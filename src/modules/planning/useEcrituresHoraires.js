import React from 'react';
import { notifyLegacy } from '../../legacy/legacyApi.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { chevauche, horairesDuModele } from './planningModeles.js';
import { copieHoraire, estPointe, horaireDeplace, idCopie, regleDepot } from './planningGlisser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Écritures des gestes de la grille : poser un modèle, déplacer ou copier un
// horaire glissé, dupliquer, et revenir en arrière. Seul endroit qui appelle
// updateShift / createShifts / deleteShifts pour ces gestes.
//
// Écriture optimiste avec retour arrière réel : la grille change tout de
// suite ; si l'écriture échoue, l'objet d'AVANT le geste (porté par le geste,
// jamais relu dans l'état) est remis. Pas de relecture globale comme retour
// arrière (elle peut échouer aussi), pas de nouvel essai maison.
//
// Un seul retour arrière : le dernier geste, tant que son bandeau est affiché
// (BandeauAnnuler, 8 s). `bandeau` est ce que le bandeau montre ; le geste
// annulable vit à côté, dans une ref (avec la promesse de son écriture). Le
// geste suivant ferme le bandeau (poserModele ici, les fenêtres d'écriture dans
// Planning.jsx). Un dépôt refusé n'écrit rien, donc n'est pas un geste : son
// bandeau garde le geste d'avant (precedent), qui revient, toujours annulable,
// quand on ferme le refus (fermerMessage). Un retour arrière ne crée jamais de
// chevauchement : la case de départ est relue au moment d'annuler.
// ─────────────────────────────────────────────────────────────────────────────

// Bandeaux d'un dépôt refusé : rien n'a été écrit.
const REFUS = new Set(['chevauche', 'pointe']);

export function useEcrituresHoraires({ bridge, setPlanning, existants, canWrite, etabId }) {
  const existantsRef = React.useRef(existants);
  existantsRef.current = existants;
  const [bandeau, setBandeau] = React.useState(null);
  const dernierRef = React.useRef(null);
  const seqRef = React.useRef(0);
  // Horaires dont une écriture est en cours : ils ne s'attrapent pas.
  const enCoursRef = React.useRef(new Map());

  const vers = (row) => bridge.db.mapShiftFromDB(row);
  const remplacer = (id, objet) => setPlanning(prev => prev.map(s => (s.id === id ? objet : s)));
  const retirer = (ids) => { const set = new Set(ids); setPlanning(prev => prev.filter(s => !set.has(s.id))); };
  const ajouter = (objets) => setPlanning(prev => [...prev, ...objets.filter(o => !prev.some(p => p.id === o.id))]);
  const actuel = (id) => existantsRef.current.find(s => s.id === id) || null;
  const marquer = (id, delta) => {
    const n = (enCoursRef.current.get(id) || 0) + delta;
    if (n > 0) enCoursRef.current.set(id, n); else enCoursRef.current.delete(id);
  };
  const estEnCours = React.useCallback((id) => enCoursRef.current.has(id), []);

  const montrer = (b) => {
    seqRef.current += 1;
    setBandeau({ ...b, seq: seqRef.current });
    return seqRef.current;
  };
  const fermerBandeau = React.useCallback(() => { dernierRef.current = null; setBandeau(null); }, []);
  // Le geste échoue ou ne peut plus être annulé : son bandeau s'en va, pas celui
  // d'un geste plus récent, et il ne revient pas après un refus (fini).
  const oublier = (geste) => {
    geste.fini = true;
    if (dernierRef.current === geste) dernierRef.current = null;
    setBandeau(b => (b && b.seq === geste.seq ? null : b));
  };
  const occuper = (geste, occupe) => {
    geste.annulation = occupe;
    setBandeau(b => (b && b.seq === geste.seq ? { ...b, occupe } : b));
  };
  const memoriser = (geste) => { dernierRef.current = geste; return geste; };
  // Montre le bandeau d'un geste (vue) et en fait le dernier geste.
  const retenir = (vue, geste) => memoriser({ ...geste, vue, seq: montrer(vue) });

  // « Fermer », × ou fin du délai du bandeau. Après un refus, le geste d'avant
  // revient avec son bandeau, s'il est toujours annulable ; sinon tout se ferme.
  const fermerMessage = () => {
    const d = dernierRef.current;
    const p = d && REFUS.has(d.type) ? d.precedent : null;
    if (!p || p.fini) { fermerBandeau(); return; }
    p.seq = montrer({ ...p.vue, occupe: Boolean(p.annulation) });
    dernierRef.current = p;
  };

  // ─── Poser un modèle (saisie en un geste, pinceau) ───
  // Un créneau qui chevauche un horaire existant est laissé de côté : le
  // service coupé reste possible, rien n'est écrasé sans le demander.
  const poserModele = async (modele, userId, date, { silencieux = false } = {}) => {
    if (!canWrite || !modele || !userId || !date) return;
    // Geste suivant : le bandeau du geste d'avant ne propose plus de l'annuler.
    fermerBandeau();
    const { aCreer, ignores } = horairesDuModele(modele, { userId, date, etablissementId: etabId, existants: existantsRef.current });
    if (!aCreer.length) {
      if (!silencieux) notifyLegacy('Ce créneau est déjà occupé.', 'warning');
      return;
    }
    try {
      let crees;
      if (bridge) {
        const rows = await bridge.db.createShifts(aCreer);
        crees = (rows || []).map(vers);
      } else {
        crees = aCreer.map((s, i) => ({ ...s, id: 'sm' + Date.now() + '-' + i }));
      }
      ajouter(crees);
      if (ignores && !silencieux) notifyLegacy('Une partie était déjà occupée : seul le créneau libre a été posé.', 'info');
    } catch (err) {
      notifyLegacy('Enregistrement impossible. ' + messageErreur(err, 'planning'), 'error');
    }
  };

  // ─── Déplacer (glisser) ───
  // Seuls la personne et le jour changent. La ligne du serveur remplace la
  // ligne optimiste ; en échec, l'objet d'avant revient, sans bandeau.
  const deplacer = (avant, cible, absence = null) => {
    const apres = horaireDeplace(avant, cible);
    remplacer(avant.id, apres);
    marquer(avant.id, 1);
    const promesse = bridge
      ? bridge.db.updateShift(avant.id, { userId: cible.userId, date: cible.date }).then((row) => { const m = vers(row); remplacer(m.id, m); return m; })
      : Promise.resolve(apres);
    const geste = retenir({ type: 'deplace', horaire: apres, absence }, { type: 'deplace', avant, apres, absence, promesse });
    promesse
      .catch((err) => {
        remplacer(avant.id, avant);
        oublier(geste);
        notifyLegacy('Déplacement impossible. ' + messageErreur(err, 'planning'), 'error');
      })
      .finally(() => marquer(avant.id, -1));
    return promesse;
  };

  // ─── Copier (Alt ou Ctrl, « Copier ici », « Copier plutôt ») ───
  // L'id est fabriqué sur l'appareil : la ligne optimiste a déjà son id
  // définitif, l'écho realtime de l'INSERT est dédoublonné par id.
  const copier = (source, cible, absence = null) => {
    const copie = { ...copieHoraire(source, cible, idCopie()), etablissementId: source.etablissementId || etabId };
    ajouter([copie]);
    marquer(copie.id, 1);
    const promesse = bridge
      ? bridge.db.createShifts([copie]).then((rows) => { const m = rows && rows[0] ? vers(rows[0]) : copie; remplacer(copie.id, m); return m; })
      : Promise.resolve(copie);
    const geste = retenir({ type: 'copie', horaire: copie, absence }, { type: 'copie', copie, promesse });
    promesse
      .catch((err) => {
        retirer([copie.id]);
        oublier(geste);
        notifyLegacy('Copie impossible. ' + messageErreur(err, 'planning'), 'error');
      })
      .finally(() => marquer(copie.id, -1));
    return promesse;
  };

  // Un dépôt refusé se dit dans le bandeau ; « pointe » garde de quoi copier.
  // Le geste annulable d'avant (ou celui que gardait un refus précédent) est
  // porté par precedent, et rendu par fermerMessage.
  const signaler = (b) => {
    const d = dernierRef.current;
    const precedent = d && REFUS.has(d.type) ? d.precedent : d;
    retenir(b, { ...b, precedent: precedent || null, promesse: Promise.resolve() });
  };

  // Lâcher sur une case : la règle (regleDepot) a déjà tranché.
  const deposer = ({ horaire, cible, regle }) => {
    if (regle.bloque === 'chevauche') return signaler({ type: 'chevauche' });
    if (regle.bloque === 'pointe') return signaler({ type: 'pointe', horaire, cible, absence: regle.absence });
    if (regle.effet === 'deplacer') return deplacer(horaire, cible, regle.absence);
    if (regle.effet === 'copier') return copier(horaire, cible, regle.absence);
    return null;
  };

  // La copie d'un horaire reste-t-elle possible sur cette case, avec l'état le
  // plus récent ? Sinon le bandeau le dit.
  const copiePossible = (horaire, cible, absence) => {
    const r = regleDepot({ horaire, cible, copie: true, existants: existantsRef.current, absence });
    if (r.effet === 'copier') return true;
    signaler({ type: 'chevauche' });
    return false;
  };

  // ─── Retours arrière ───
  const annulerDeplacement = async (geste) => {
    const id = geste.avant.id;
    const courant = actuel(id);
    if (!courant) { notifyLegacy('Cet horaire n\'existe plus.', 'warning'); oublier(geste); return false; }
    if (estPointe(courant)) { notifyLegacy('Cet horaire vient d\'être pointé : il reste où il est.', 'warning'); oublier(geste); return false; }
    // Sa case de départ a pu recevoir un horaire entre-temps (autre appareil,
    // geste resté sans fermer le bandeau) : la même règle que le dépôt.
    const retour = { userId: geste.avant.userId, date: geste.avant.date };
    if (regleDepot({ horaire: courant, cible: retour, copie: false, existants: existantsRef.current, absence: null }).bloque === 'chevauche') {
      notifyLegacy('Sa case de départ a maintenant un horaire qui le chevauche : il reste où il est.', 'warning');
      oublier(geste);
      return false;
    }
    remplacer(id, { ...courant, ...retour });
    marquer(id, 1);
    try {
      if (bridge) {
        const row = await bridge.db.updateShift(id, retour);
        const m = vers(row);
        remplacer(id, m);
      }
      return true;
    } catch (err) {
      remplacer(id, courant);
      occuper(geste, false);
      notifyLegacy('Annulation impossible. ' + messageErreur(err, 'planning'), 'error');
      return false;
    } finally {
      marquer(id, -1);
    }
  };

  const annulerCopie = async (geste) => {
    const id = geste.copie.id;
    const courant = actuel(id);
    if (!courant) { notifyLegacy('Cet horaire n\'existe plus.', 'warning'); oublier(geste); return false; }
    if (estPointe(courant)) { notifyLegacy('Cet horaire vient d\'être pointé : il reste où il est.', 'warning'); oublier(geste); return false; }
    retirer([id]);
    marquer(id, 1);
    try {
      if (bridge) await bridge.db.deleteShifts([id]);
      return true;
    } catch (err) {
      ajouter([courant]);
      occuper(geste, false);
      notifyLegacy('Annulation impossible. ' + messageErreur(err, 'planning'), 'error');
      return false;
    } finally {
      marquer(id, -1);
    }
  };

  // Annuler une duplication : les horaires créés s'en vont (sauf ceux pointés
  // entre-temps), puis ceux qu'un « Remplacer » avait effacés reviennent avec
  // leurs ids et leurs champs (Remplacer n'efface jamais un horaire pointé),
  // sauf là où un autre horaire occupe désormais leur créneau.
  const annulerDuplication = async (geste) => {
    const partants = geste.crees.map(c => actuel(c.id)).filter(c => c && !estPointe(c));
    const ids = partants.map(c => c.id);
    const restants = existantsRef.current.filter(e => !ids.includes(e.id));
    const aRemettre = geste.remplaces.filter(r => !restants.some(e => e.id !== r.id
      && e.userId === r.userId && e.date === r.date && chevauche(e.debut, e.fin, r.debut, r.fin)));
    retirer(ids);
    try {
      if (bridge && ids.length) await bridge.db.deleteShifts(ids);
    } catch (err) {
      ajouter(partants);
      occuper(geste, false);
      notifyLegacy('Annulation impossible. ' + messageErreur(err, 'planning'), 'error');
      return false;
    }
    if (aRemettre.length < geste.remplaces.length) {
      notifyLegacy('Certains horaires remplacés ne reviennent pas : un autre horaire occupe leur créneau.', 'warning');
    }
    if (aRemettre.length) {
      ajouter(aRemettre);
      try {
        if (bridge) {
          const rows = await bridge.db.createShifts(aRemettre);
          (rows || []).map(vers).forEach(m => remplacer(m.id, m));
        }
      } catch (err) {
        retirer(aRemettre.map(r => r.id));
        oublier(geste);
        notifyLegacy('Annulation impossible. ' + messageErreur(err, 'planning'), 'error');
        return false;
      }
    }
    return true;
  };

  const annulerDernier = async () => {
    const geste = dernierRef.current;
    if (!geste || geste.annulation) return;
    occuper(geste, true);
    try { await geste.promesse; } catch { return; }
    let ok = false;
    if (geste.type === 'deplace') ok = await annulerDeplacement(geste);
    else if (geste.type === 'copie') ok = await annulerCopie(geste);
    else if (geste.type === 'duplication') ok = await annulerDuplication(geste);
    if (ok && dernierRef.current === geste) {
      dernierRef.current = null;
      montrer({ type: 'annule' });
    }
  };

  // « Copier plutôt » : d'abord l'original revient à sa place (même id), puis
  // la copie part vers la case visée. Si la copie échoue, l'original est à sa
  // place : l'état reste cohérent.
  const copierPlutot = async () => {
    const geste = dernierRef.current;
    if (!geste || geste.type !== 'deplace' || geste.annulation) return;
    occuper(geste, true);
    try { await geste.promesse; } catch { return; }
    const cible = { userId: geste.apres.userId, date: geste.apres.date };
    // Copie refusée : le déplacement reste annulable quand le refus se ferme.
    if (!copiePossible(geste.avant, cible, geste.absence)) { geste.annulation = false; return; }
    if (!(await annulerDeplacement(geste))) return;
    copier(geste.avant, cible, geste.absence);
  };

  // « Copier ici » après un dépôt refusé d'un horaire déjà pointé.
  const copierIci = () => {
    const geste = dernierRef.current;
    if (!geste || geste.type !== 'pointe') return;
    const horaire = actuel(geste.horaire.id) || geste.horaire;
    if (!copiePossible(horaire, geste.cible, geste.absence)) return;
    copier(horaire, geste.cible, geste.absence);
  };

  // ─── Duplication (fenêtres Dupliquer et « Dupliquer vers… ») ───
  // Un effacement groupé (ce qui est remplacé) puis une création groupée. Si la
  // création échoue après l'effacement, les horaires effacés sont remis.
  // mode 'bandeau' : « N horaires copiés. Annuler » ; 'toast' : le message de
  // « Dupliquer vers… ».
  const appliquerDuplication = async ({ aCreer, aSupprimer }, { mode = 'bandeau' } = {}) => {
    const aEffacer = new Set(aSupprimer);
    const remplaces = existantsRef.current.filter(s => aEffacer.has(s.id));
    let crees;
    let efface = false;
    try {
      if (bridge) {
        if (aSupprimer.length) { await bridge.db.deleteShifts(aSupprimer); efface = true; }
        const rows = await bridge.db.createShifts(aCreer);
        crees = (rows || []).map(vers);
      } else {
        crees = aCreer.map((s, i) => ({ ...s, id: 'sd' + Date.now() + '-' + i }));
      }
    } catch (err) {
      if (efface) {
        try { await bridge.db.createShifts(remplaces); } catch { retirer(aSupprimer); }
      }
      notifyLegacy('Duplication impossible. ' + messageErreur(err, 'planning'), 'error');
      throw err;
    }
    setPlanning(prev => [...prev.filter(s => !aEffacer.has(s.id)), ...crees.filter(c => !prev.some(p => p.id === c.id))]);
    if (mode === 'bandeau') {
      retenir({ type: 'duplication', n: crees.length }, { type: 'duplication', crees, remplaces, promesse: Promise.resolve() });
    } else {
      let msg = `${crees.length} horaire${crees.length > 1 ? 's' : ''} créé${crees.length > 1 ? 's' : ''}`;
      if (remplaces.length) msg += ` (${remplaces.length} remplacé${remplaces.length > 1 ? 's' : ''})`;
      notifyLegacy(msg, 'success');
    }
    return { crees, remplaces };
  };

  return {
    bandeau, fermerBandeau, fermerMessage, estEnCours,
    poserModele, deposer, deplacer, copier, copierIci, copierPlutot, annulerDernier,
    appliquerDuplication, annulerDuplication,
  };
}
