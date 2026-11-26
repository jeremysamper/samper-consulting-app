// ─────────────────────────────────────────────────────────────
// Statut d'une chambre changé sans réseau : logique pure (lot 23).
//
// Aucun import de service ni de composant : ce fichier se teste sous
// `node --test` (statutsHorsLigne.test.mjs). La file IndexedDB vit dans
// src/services/offline/etagesQueue.js, l'envoi dans etagesSync.js.
//
// Un geste = un changement de statut d'une chambre, avec une clé posée sur
// l'appareil (idempotence) et l'heure du geste. Contrairement à un relevé
// HACCP, c'est une mise à jour : si quelqu'un d'autre a changé la chambre
// plus tard entre-temps, le geste le plus récent gagne. La base en décide
// (RPC chambre_statut_geste, migration 20261126_lot23), jamais l'appareil :
// elle rend 'applique', 'ignore' (plus ancien) ou 'deja_recu'.
// ─────────────────────────────────────────────────────────────

// Erreurs passagères : la file reste intacte, on retentera.
const CODES_RETENTABLES = new Set(['PGRST202', 'PGRST301']);
// Refus définitifs de la base : droits, chambre disparue, heure du geste
// hors des bornes (D2), statut ou geste refusé.
const CODES_REFUSES = new Set(['42501', 'P0002', '22007', '22023', '23514', '23503']);
export const MAX_TENTATIVES = 10;

// Élément de la file : ce qui partira à la RPC, plus ce qu'il faut pour le
// rejouer sous le bon compte et nommer la chambre dans un avis.
export function nouveauGeste({ cle, etablissementId, chambreId, numero = '', statut, motif = null, gesteAt, userId, maintenantMs }) {
  return {
    cle,
    etablissementId,
    chambreId,
    numero: numero || '',
    statut,
    motif: statut === 'hors_service' ? (motif || null) : null,
    gesteAt,
    userId,
    createdAt: maintenantMs,
    attempts: 0,
  };
}

// Paramètres de la RPC. `enLigne` : le geste part tout de suite, l'heure est
// celle de la base ; en rejeu, c'est l'heure du geste sur l'appareil.
export function parametresRpc(geste, { enLigne = false } = {}) {
  return {
    p_cle: geste.cle,
    p_chambre_id: geste.chambreId,
    p_statut: geste.statut,
    p_motif: geste.motif || null,
    p_geste_at: enLigne ? null : geste.gesteAt,
  };
}

function plusRecent(a, b) {
  return String(a.gesteAt || '').localeCompare(String(b.gesteAt || '')) || ((a.createdAt || 0) - (b.createdAt || 0));
}

// Dernier geste en attente par chambre, pour un établissement.
export function dernierGesteParChambre(elements, etabId) {
  const parChambre = new Map();
  for (const el of elements || []) {
    if (!el || el.etablissementId !== etabId) continue;
    const deja = parChambre.get(el.chambreId);
    if (!deja || plusRecent(el, deja) > 0) parChambre.set(el.chambreId, el);
  }
  return parChambre;
}

// Chambres affichées : le dernier geste en attente passe par-dessus la
// lecture du serveur, marqué `enAttente`. Rien n'est changé pour les autres.
export function appliquerEnAttente(chambres, elements, etabId) {
  const parChambre = dernierGesteParChambre(elements, etabId);
  if (!parChambre.size) return chambres || [];
  return (chambres || []).map((c) => {
    const g = parChambre.get(c.id);
    if (!g) return c;
    return { ...c, statutMenage: g.statut, horsServiceMotif: g.motif || '', enAttente: true };
  });
}

// Erreur réseau (fetch échoué, délai dépassé) : pas de code PostgREST.
export function estErreurReseau(error) {
  return !!error && !error.code;
}

export function issueRejeu(resultat, error, attempts = 0) {
  if (!error) {
    if (resultat === 'ignore') return 'ignore';
    if (resultat === 'applique' || resultat === 'deja_recu') return 'envoye';
    // Réponse inattendue : on compte une tentative plutôt que de perdre le geste.
    return (attempts || 0) + 1 >= MAX_TENTATIVES ? 'refuse' : 'tentative';
  }
  if (estErreurReseau(error) || CODES_RETENTABLES.has(error.code)) return 'reessayer';
  if (CODES_REFUSES.has(error.code)) return 'refuse';
  if ((attempts || 0) + 1 >= MAX_TENTATIVES) return 'refuse';
  return 'tentative';
}

// Rejoue la file dans l'ordre des gestes. Une panne réseau arrête tout sans
// rien toucher ; un geste plus ancien qu'un autre se retire (la base garde le
// plus récent) ; une erreur inconnue compte une tentative ; un refus retire
// l'élément et prévient (jamais de disparition en silence).
export async function rejouerFile({ elements, envoyer, retirer, garder, avertir }) {
  const ordre = [...(elements || [])].sort(plusRecent);
  let envoyes = 0;
  let ignores = 0;
  let refuses = 0;
  let restants = 0;
  for (let i = 0; i < ordre.length; i += 1) {
    const el = ordre[i];
    let resultat = null;
    let error = null;
    try {
      const res = await envoyer(el);
      resultat = res?.data ?? null;
      error = res?.error || null;
    } catch (err) {
      error = err || new Error('envoi impossible');
    }
    const issue = issueRejeu(resultat, error, el.attempts || 0);
    if (issue === 'reessayer') {
      restants += ordre.length - i;
      break;
    }
    if (issue === 'envoye') {
      await retirer(el.cle);
      envoyes += 1;
    } else if (issue === 'ignore') {
      await retirer(el.cle);
      ignores += 1;
    } else if (issue === 'tentative') {
      await garder({ ...el, attempts: (el.attempts || 0) + 1 });
      restants += 1;
    } else {
      await retirer(el.cle);
      refuses += 1;
      await avertir(el, error);
    }
  }
  return { envoyes, ignores, refuses, restants };
}

// ─── Textes ───

export const PHRASE_GARDE = 'Gardé sur cet appareil. Il partira au retour du réseau.';
export const PHRASE_IGNORE = 'Une chambre a été changée par quelqu\'un d\'autre pendant que vous étiez hors ligne. Le changement le plus récent est gardé.';

export function phraseRefus(element) {
  const numero = element?.numero ? ` ${element.numero}` : '';
  return `Chambre${numero} : le changement fait hors ligne n'a pas été enregistré. Refaites-le.`;
}

export function libelleBandeau(n) {
  return `${n} statut${n > 1 ? 's' : ''} de chambre en attente de synchronisation`;
}
