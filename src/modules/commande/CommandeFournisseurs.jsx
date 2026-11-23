import React from 'react';
import { CalendarClock, ClipboardCheck, PackagePlus, Send, ShoppingBasket, Truck } from 'lucide-react';
import { supabase } from '../../services/supabase.js';
import { dbService } from '../../services/dbService.js';
import { pdfUtils } from '../../services/pdf.js';
import { navigateToPage } from '../../services/navigationService.js';
import { notify } from '../../components/toast/index.js';
import { Btn, CarteRepere, Panneau, SegmentedTabs, ligneStyle } from '../../components/ui/index.jsx';
import { BoutonActions, Choix, Fenetre, st as fs } from '../../components/ui/Fenetres.jsx';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { LigneRegler } from '../../components/ui/BoutonRegler.jsx';
import { readText, writeText } from '../../utils/storage.js';
import { zurichAjouterJours, zurichDateHeure, zurichToday } from '../../utils/zurichTime.js';
import { useReglagesModule } from '../../hooks/useReglagesModule.js';
import { useGroupeMenus } from '../../hooks/useGroupeMenus.js';
import { postesProduction } from '../groupes/choixMenu.js';
import { computeListeCourses } from '../groupes/listeCourses.js';
import { NUMERO_COMPLEMENTS } from '../groupes/typesGroupe.js';
import { useCommandeV1 } from './useCommandeV1.js';
import {
  besoinsGroupePourFournisseur, courrielCommande, depuisChamp, formatQuantite, groupesAPrendre, jourIso,
  libelleCommande, lienGmail, lienMailto, limitePassee, pdfCommande, prochaineLivraison, quantiteRetenue,
  uniteAffichage, versChamp,
} from './commandeV1.js';
import './commande.css';

// ─────────────────────────────────────────────────────────────────────────────
// COMMANDE V1 (plan 15, lot 4, décision D3) : un onglet par fournisseur. Dans
// chaque onglet, la commande de sa prochaine livraison : pour qui, quelle
// livraison, avant quelle heure. On tape « il en reste combien », l'app
// calcule depuis le stock cible du jour et arrondit au colis. Les besoins des
// groupes des quinze jours suivants s'ajoutent en une touche. L'envoi ouvre un
// brouillon Gmail préécrit (mailto en repli, PDF du service partagé), et la
// réception se coche sur la commande elle-même (reçu, écart, manquant), ce qui
// crée le bon de livraison des Factures & achats.
// Droits : toute l'équipe du module prépare, envoie et réceptionne ; un
// brouillon se supprime par l'équipe, une commande envoyée par la direction ;
// une commande reçue est scellée (la base refuse le reste).
// ─────────────────────────────────────────────────────────────────────────────

const DIRECTION = ['consultant', 'patron', 'resp_cuisine'];
const cleOnglet = (etabId) => 'sc_commande_fournisseur_' + etabId;
const N = ({ children }) => <span data-no-translate="">{children}</span>;
// Un jour en clair : le nom du jour traduit, la date à part (« mercredi 25.11 »).
const NOMS_JOURS = ["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const Jour = ({ date }) => {
  if (!date) return null;
  const [, m, d] = String(date).split("-");
  return <><span>{NOMS_JOURS[jourIso(date)]}</span> <N>{d}.{m}</N></>;
};
// Repère sans chiffre : une phrase et son détail (CarteRepere ne rend pas
// detail quand il reçoit un texte).
const TexteRepere = ({ titre, detail }) => (
  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span>{titre}</span>
    {detail ? <span style={{ fontSize: 'var(--t1)', color: 'var(--text3)' }}>{detail}</span> : null}
  </span>
);
const Limite = ({ iso }) => {
  if (!iso) return null;
  const z = zurichDateHeure(iso);
  return <><Jour date={z.jour} /> à <N>{z.heure}</N></>;
};
const STATUTS_RECEPTION = [
  { id: 'recu', label: 'Reçu' },
  { id: 'ecart', label: 'Écart' },
  { id: 'manquant', label: 'Manquant' },
];

const messageBase = (error, defaut) => {
  const code = String(error?.code || '');
  if (code === '42501') return "Votre rôle ne permet pas ce changement sur cette commande.";
  if (code === '23505') return 'Une commande existe déjà pour ce fournisseur et cette livraison.';
  return defaut;
};

export default function CommandeFournisseurs({ user, etablissement, onParCarte }) {
  const etabId = etablissement?.id || null;
  const donnees = useCommandeV1(etabId);
  const { status, fournisseurs, commandes, lignes, groupesPris, habituels, cibles, produits, groupes, relire, poserLigne } = donnees;
  const { reglages: reglageGroupes } = useReglagesModule(etabId, 'groupes');
  const delaiGroupes = Number.isInteger(reglageGroupes?.delai_alerte_jours) ? reglageGroupes.delai_alerte_jours : 14;
  const { menuDe } = useGroupeMenus(etabId);
  const estDirection = DIRECTION.includes(user?.role);

  const [ongletChoisi, setOngletChoisi] = React.useState(() => readText(cleOnglet(etabId), ''));
  const [fenetre, setFenetre] = React.useState(null); // { type, ... }
  const [enCours, setEnCours] = React.useState(false);
  const [reception, setReception] = React.useState(null); // { commandeId, lignes: { id: {statut, quantite, lot, dlc} }, numero }

  const aujourdhui = zurichToday();

  // Fournisseurs à onglet : jours de livraison réglés, commande ouverte,
  // produits habituels ou stocks cibles. Les autres s'ouvrent par « Autre
  // fournisseur ».
  const fournisseursActifs = React.useMemo(() => {
    const avecCible = new Set(cibles.map((c) => produits.find((p) => p.id === c.produit_id)?.fournisseur_id).filter(Boolean));
    const avecHabituels = new Set(habituels.map((h) => h.fournisseur_id));
    const ouverts = new Set(commandes.filter((c) => c.statut !== 'recue').map((c) => c.fournisseur_id));
    return fournisseurs.filter((f) => (f.jours_livraison?.length || ouverts.has(f.id) || avecHabituels.has(f.id) || avecCible.has(f.id)));
  }, [fournisseurs, commandes, habituels, cibles, produits]);

  // Commande en cours d'un fournisseur : la première non reçue (date la plus
  // proche), sinon la dernière reçue des deux derniers jours.
  const commandeDe = React.useCallback((fid) => {
    const siennes = commandes.filter((c) => c.fournisseur_id === fid);
    const ouverte = siennes.filter((c) => c.statut !== 'recue').sort((a, b) => a.date_livraison.localeCompare(b.date_livraison))[0];
    if (ouverte) return ouverte;
    return siennes.filter((c) => c.statut === 'recue' && c.date_livraison >= zurichAjouterJours(aujourdhui, -2))
      .sort((a, b) => b.date_livraison.localeCompare(a.date_livraison))[0] || null;
  }, [commandes, aujourdhui]);

  // Onglet d'ouverture : le dernier choisi sur ce poste, sinon le premier
  // brouillon dont l'heure limite arrive, sinon le premier fournisseur.
  const parDefaut = React.useMemo(() => {
    const brouillons = commandes.filter((c) => c.statut === 'brouillon' && !limitePassee(c.envoyer_avant))
      .sort((a, b) => String(a.envoyer_avant || '9').localeCompare(String(b.envoyer_avant || '9')));
    const f = brouillons.find((c) => fournisseursActifs.some((x) => x.id === c.fournisseur_id));
    return f?.fournisseur_id || fournisseursActifs[0]?.id || null;
  }, [commandes, fournisseursActifs]);
  const onglet = fournisseursActifs.some((f) => f.id === ongletChoisi) ? ongletChoisi : parDefaut;
  const choisirOnglet = (id) => { setOngletChoisi(id); writeText(cleOnglet(etabId), id); setReception(null); };

  const fournisseur = fournisseurs.find((f) => f.id === onglet) || null;
  const commande = fournisseur ? commandeDe(fournisseur.id) : null;
  const lignesCommande = React.useMemo(
    () => (commande ? lignes.filter((l) => l.commande_id === commande.id).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)) : []),
    [commande, lignes],
  );
  const produitsFournisseur = React.useMemo(() => produits.filter((p) => p.fournisseur_id === fournisseur?.id), [produits, fournisseur]);
  const livraison = fournisseur ? prochaineLivraison(fournisseur) : null;
  const aCommander = lignesCommande.filter((l) => { const q = quantiteRetenue(l); return q !== null && q > 0; });
  // Restes à taper : lignes à stock cible dont le reste n’est pas encore donné.
  const enAttente = lignesCommande.filter((l) => l.stock_cible != null && l.reste == null && l.quantite == null && !(Number(l.besoin_groupes) > 0));

  // ── Écritures ──
  const creerCommande = async (fid, dateLivraison) => {
    if (enCours) return;
    setEnCours(true);
    try {
      const { data: cmd, error } = await supabase.from('commandes')
        .insert({ etablissement_id: etabId, fournisseur_id: fid, date_livraison: dateLivraison })
        .select().single();
      if (error) throw error;
      // Lignes de départ : les produits à stock cible du jour de livraison et
      // les habituels du fournisseur. La base reprend nom, unité, colis, prix
      // et cible ; une quantité proposée n'est posée que sans cible.
      const jour = jourIso(dateLivraison);
      const ciblesDuJour = new Set(cibles.filter((c) => c.jour_livraison === jour).map((c) => c.produit_id));
      const lignesNeuves = [];
      produits.filter((p) => p.fournisseur_id === fid && ciblesDuJour.has(p.id))
        .forEach((p) => lignesNeuves.push({ commande_id: cmd.id, produit_id: p.id, source: 'cible' }));
      habituels.filter((h) => h.fournisseur_id === fid && !ciblesDuJour.has(h.produit_id))
        .forEach((h) => lignesNeuves.push({ commande_id: cmd.id, produit_id: h.produit_id, source: 'habituel', quantite: h.quantite_defaut ?? null }));
      lignesNeuves.forEach((l, i) => { l.ordre = i; });
      if (lignesNeuves.length) {
        const r = await supabase.from('commande_lignes').insert(lignesNeuves);
        if (r.error) throw r.error;
      }
      if (fid !== onglet) choisirOnglet(fid);
      await relire();
    } catch (error) {
      console.error('[commande] création', error);
      notify(messageBase(error, "La commande n'a pas pu être préparée. Réessayez."), 'error');
      if (String(error?.code) === '23505') await relire();
    } finally {
      setEnCours(false);
    }
  };

  const ecrireLigne = async (ligne, valeurs) => {
    poserLigne(ligne.id, valeurs);
    const { error } = await supabase.from('commande_lignes').update(valeurs).eq('id', ligne.id);
    if (error) {
      console.error('[commande] ligne', error);
      notify(messageBase(error, "La ligne n'a pas pu être enregistrée. Réessayez."), 'error');
    }
    await relire();
  };

  const ajouterProduit = async (produitId) => {
    if (!commande) return;
    const { error } = await supabase.from('commande_lignes')
      .insert({ commande_id: commande.id, produit_id: produitId, source: 'manuel', ordre: lignesCommande.length });
    if (error) { console.error('[commande] ajout', error); notify(messageBase(error, "Le produit n'a pas pu être ajouté. Réessayez."), 'error'); return; }
    setFenetre(null);
    await relire();
  };

  const retirerLigne = async (ligne) => {
    const { error } = await supabase.from('commande_lignes').delete().eq('id', ligne.id);
    if (error) { console.error('[commande] retrait', error); notify(messageBase(error, "La ligne n'a pas pu être retirée. Réessayez."), 'error'); return; }
    setFenetre(null);
    await relire();
  };

  const changerStatut = async (statut, envoiCanal = null) => {
    if (!commande) return false;
    const valeurs = statut === 'envoyee' ? { statut, envoi_canal: envoiCanal } : { statut, envoi_canal: null };
    const { error } = await supabase.from('commandes').update(valeurs).eq('id', commande.id);
    if (error) { console.error('[commande] statut', error); notify(messageBase(error, "La commande n'a pas pu être mise à jour. Réessayez."), 'error'); return false; }
    await relire();
    return true;
  };

  const supprimerCommande = async () => {
    if (!commande) return;
    const { error } = await supabase.from('commandes').delete().eq('id', commande.id);
    if (error) { console.error('[commande] suppression', error); notify(messageBase(error, "La commande n'a pas pu être supprimée."), 'error'); return; }
    notify('Commande supprimée.', 'success');
    await relire();
  };

  const ecrireNote = async (note) => {
    if (!commande || (note || null) === (commande.note || null)) return;
    const { error } = await supabase.from('commandes').update({ note: note || null }).eq('id', commande.id);
    if (error) { console.error('[commande] note', error); notify(messageBase(error, "La note n'a pas pu être enregistrée."), 'error'); }
    await relire();
  };

  // Besoins d'un groupe : sa liste de courses (Groupes), ramenée aux produits
  // de ce fournisseur, portée sur les lignes.
  const ajouterGroupe = async (groupe) => {
    if (!commande || enCours) return;
    setEnCours(true);
    try {
      const db = dbService.getDb();
      const [plats, recettes, catalogue] = await Promise.all([
        db.listPlats(etabId, { strict: true }),
        db.listRecettes(etabId, { strict: true }),
        db.listProduits(etabId),
      ]);
      const production = postesProduction({
        groupe,
        menu: groupe.menuNumero ? menuDe(groupe.typeGroupe, groupe.menuNumero) : null,
        complements: menuDe(groupe.typeGroupe, NUMERO_COMPLEMENTS),
        menus: [],
      });
      const liste = computeListeCourses({
        postes: production.postes, plats: plats || [], recettes: (recettes || []).filter((r) => r.statut !== 'archivée'), catalogue: catalogue || [],
      });
      const besoins = besoinsGroupePourFournisseur(liste, produitsFournisseur);
      const ids = Object.keys(besoins);
      if (!ids.length) {
        notify(production.aChoisir?.length && !production.postes.length
          ? "Le client n'a pas encore choisi son menu. Les besoins viendront avec son choix."
          : "Les menus de ce groupe n'utilisent aucun produit de ce fournisseur.", 'info');
        return;
      }
      const r = await supabase.from('commande_groupes').insert({ commande_id: commande.id, groupe_evenement_id: groupe.id, nb_pax: groupe.nbPax });
      if (r.error) throw r.error;
      for (const pid of ids) {
        const existante = lignesCommande.find((l) => l.produit_id === pid);
        const res = existante
          ? await supabase.from('commande_lignes').update({ besoin_groupes: (Number(existante.besoin_groupes) || 0) + besoins[pid] }).eq('id', existante.id)
          : await supabase.from('commande_lignes').insert({ commande_id: commande.id, produit_id: pid, source: 'groupe', besoin_groupes: besoins[pid], ordre: lignesCommande.length });
        if (res.error) throw res.error;
      }
      notify(`Besoins du groupe ajoutés sur ${ids.length} ${ids.length > 1 ? 'produits' : 'produit'}.`, 'success');
      await relire();
    } catch (error) {
      console.error('[commande] groupe', error);
      notify(messageBase(error, "Les besoins du groupe n'ont pas pu être ajoutés. Réessayez."), 'error');
      await relire();
    } finally {
      setEnCours(false);
    }
  };

  // ── Envoi ──
  const message = commande ? courrielCommande({ fournisseur, commande, lignes: lignesCommande, etablissement }) : null;
  const envoyer = async (canal) => {
    if (!message) return;
    if (canal === 'gmail') window.open(lienGmail(message), '_blank', 'noopener');
    if (canal === 'mail') window.location.href = lienMailto(message);
    if (canal === 'pdf') await exporterPdf();
    setFenetre(null);
    const ok = await changerStatut('envoyee', canal);
    if (ok) notify(canal === 'telephone' ? 'Commande marquée envoyée.' : 'Commande marquée envoyée. Vérifiez le message avant de l’envoyer.', 'success');
  };
  const exporterPdf = async () => {
    if (!commande) return;
    try {
      await pdfUtils?.exportCommandePdf?.(pdfCommande({ fournisseur, commande, lignes: lignesCommande }), {
        etablissement, filename: `commande-${(fournisseur?.nom || 'fournisseur').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${commande.date_livraison}.pdf`,
      });
    } catch { /* le service PDF a déjà prévenu */ }
  };

  // ── Réception ──
  const ouvrirReception = () => {
    if (!commande) return;
    const etatLignes = {};
    lignesCommande.forEach((l) => {
      etatLignes[l.id] = { statut: l.statut_reception || null, quantite: l.quantite_recue != null ? versChamp(l.quantite_recue, l.unite) : '', lot: l.lot || '', dlc: l.dlc || '', ouvert: !!(l.lot || l.dlc) };
    });
    setReception({ commandeId: commande.id, lignes: etatLignes, numero: '' });
  };
  const poserReception = (id, valeurs) => setReception((r) => ({ ...r, lignes: { ...r.lignes, [id]: { ...r.lignes[id], ...valeurs } } }));
  const validerReception = async () => {
    if (!reception || enCours) return;
    const pLignes = [];
    for (const l of lignesCommande) {
      const e = reception.lignes[l.id] || {};
      if (!e.statut && !e.lot && !e.dlc) continue;
      const item = { id: l.id, statut: e.statut || 'recu' };
      if (e.statut === 'ecart') {
        const q = depuisChamp(e.quantite, l.unite);
        if (q === undefined || q === null) { notify(`Indiquez la quantité reçue pour ${l.nom}.`, 'warning'); return; }
        item.quantite_recue = q;
      }
      if (e.statut === 'manquant') item.quantite_recue = 0;
      if (e.lot) item.lot = e.lot.trim();
      if (e.dlc) item.dlc = e.dlc;
      pLignes.push(item);
    }
    setEnCours(true);
    const { data, error } = await supabase.rpc('commande_receptionner', {
      p_commande_id: commande.id, p_lignes: pLignes, p_numero: reception.numero.trim() || null, p_achat: true,
    });
    setEnCours(false);
    if (error) { console.error('[commande] réception', error); notify(messageBase(error, "La réception n'a pas pu être enregistrée. Réessayez."), 'error'); return; }
    const r = Array.isArray(data) ? data[0] : data;
    const ecarts = (r?.ecarts || 0) + (r?.manquantes || 0);
    notify(ecarts > 0
      ? `Réception enregistrée avec ${ecarts} ${ecarts > 1 ? 'écarts' : 'écart'}. Le bon de livraison est dans Factures & achats.`
      : 'Réception enregistrée. Le bon de livraison est dans Factures & achats.', 'success');
    setReception(null);
    await relire();
  };

  // ── Rendu ──
  if (status === 'loading') {
    return <Panneau><div style={s.vide}>Chargement…</div></Panneau>;
  }
  if (status === 'error') {
    return (
      <Panneau style={s.videCarte}>
        <div style={s.vide}>Les commandes n'ont pas pu être lues.</div>
        <Btn variant="ghost" onClick={relire}>Réessayer</Btn>
      </Panneau>
    );
  }

  const onglets = fournisseursActifs.map((f) => ({ id: f.id, label: <span data-no-translate="">{f.nom}</span> }));
  const autres = fournisseurs.filter((f) => !fournisseursActifs.some((x) => x.id === f.id));
  const enReception = reception && commande && reception.commandeId === commande.id;
  const recue = commande?.statut === 'recue';
  const envoyee = commande?.statut === 'envoyee';
  const modifiable = commande && commande.statut === 'brouillon' && !enReception;
  const prisIci = new Set(groupesPris.filter((g) => g.fournisseur_id === fournisseur?.id || g.commande_id === commande?.id).map((g) => g.groupe_evenement_id));
  const aPrendre = commande && !recue ? groupesAPrendre(groupes, { dateLivraison: commande.date_livraison, delaiJours: delaiGroupes, dejaPris: prisIci }) : [];
  const prisCommande = commande ? groupesPris.filter((g) => g.commande_id === commande.id) : [];
  const produitsHorsCommande = produitsFournisseur.filter((p) => !lignesCommande.some((l) => l.produit_id === p.id));

  const tuiles = [
    { id: 'envoyer', Icone: Send, libelle: "J'envoie la commande", etat: <>Gmail, courriel ou PDF</>, visible: !!commande && commande.statut === 'brouillon' && aCommander.length > 0 && !enReception, onClick: () => setFenetre({ type: 'envoyer' }) },
    { id: 'recevoir', Icone: ClipboardCheck, libelle: 'Je réceptionne la livraison', etat: <>reçu ou écart, ligne par ligne</>, visible: !!commande && !recue && !enReception && lignesCommande.length > 0, onClick: ouvrirReception },
    { id: 'ajouter', Icone: PackagePlus, libelle: "J'ajoute un produit", etat: <>de ce fournisseur</>, visible: !!modifiable && produitsHorsCommande.length > 0, onClick: () => setFenetre({ type: 'ajouter' }) },
  ];

  return (
    <div className="commande-page" data-commande-v1="">
      <span id="commande-lbl-reste" hidden>Il en reste</span>
      <div className="commande-grille">
        <div className="commande-cote">
          <AccueilModule tuiles={tuiles} />
          <div className="module-actions no-print" style={s.actionsCote}>
            <Btn variant="ghost" onClick={onParCarte}>Liste par carte</Btn>
            <LigneRegler section="commande" user={user} etablissement={etablissement} className="" />
          </div>
          {commande && (
            <div className="commande-reperes no-print" data-commande-reperes="">
              <CarteRepere Icone={Truck} texte={<TexteRepere titre={<>Livraison <Jour date={commande.date_livraison} /></>} detail={<span data-no-translate="">{commande.fournisseur_nom || fournisseur?.nom}</span>} />} />
              {recue ? (
                <CarteRepere Icone={ClipboardCheck} texte={<TexteRepere titre="Commande reçue" detail={commande.recue_at ? <Jour date={zurichDateHeure(commande.recue_at).jour} /> : null} />} />
              ) : envoyee ? (
                <CarteRepere Icone={Send} texte={<TexteRepere titre="Commande envoyée" detail={commande.envoyee_at ? <><Jour date={zurichDateHeure(commande.envoyee_at).jour} />, <N>{zurichDateHeure(commande.envoyee_at).heure}</N></> : null} />} />
              ) : (
                <CarteRepere Icone={CalendarClock} texte={<TexteRepere titre={commande.envoyer_avant ? <>À envoyer avant <Limite iso={commande.envoyer_avant} /></> : 'Heure limite à régler'} detail={limitePassee(commande.envoyer_avant) ? "L'heure limite est passée." : null} />} />
              )}
              <CarteRepere Icone={ShoppingBasket} valeur={aCommander.length} libelle={aCommander.length > 1 ? 'produits à commander' : 'produit à commander'} detail={enAttente.length ? <><N>{enAttente.length}</N> {enAttente.length > 1 ? 'restes à taper' : 'reste à taper'}</> : null} />
            </div>
          )}
        </div>

        <div className="commande-corps">
          {onglets.length > 0 && <SegmentedTabs tabs={onglets} active={onglet} onChange={choisirOnglet} retourLigne />}
          {autres.length > 0 && (
            <div className="no-print"><Btn variant="ghost" onClick={() => setFenetre({ type: 'autre' })}>Autre fournisseur</Btn></div>
          )}

          {!fournisseur ? (
            <Panneau style={s.videCarte}>
              <div style={s.videTitre}>Aucun fournisseur à commander</div>
              <div style={s.videTexte}>Réglez les jours de livraison de vos fournisseurs dans Réglages, ou préparez une commande pour un autre fournisseur.</div>
            </Panneau>
          ) : !commande ? (
            <Panneau style={s.videCarte}>
              <div style={s.videTitre}><span data-no-translate="">{fournisseur.nom}</span></div>
              {livraison ? (
                <>
                  <div style={s.videTexte}>Prochaine livraison <Jour date={livraison.date} />.</div>
                  {livraison.heure && <div style={s.videTexte}>À commander avant <Jour date={livraison.limite} /> à <N>{livraison.heure}</N>.</div>}
                  <Btn variant="primary" style={{ marginTop: 12 }} disabled={enCours} onClick={() => creerCommande(fournisseur.id, livraison.date)}>Préparer la commande</Btn>
                </>
              ) : (
                <>
                  <div style={s.videTexte}>Ses jours de livraison ne sont pas réglés.</div>
                  <Btn variant="primary" style={{ marginTop: 12 }} disabled={enCours} onClick={() => setFenetre({ type: 'autre', fournisseurId: fournisseur.id })}>Préparer une commande</Btn>
                </>
              )}
            </Panneau>
          ) : (
            <>
              <Panneau style={s.carte} data-commande-id={commande.id}>
                <div style={s.entete}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={s.titre}><span data-no-translate="">{commande.fournisseur_nom || fournisseur.nom}</span></div>
                    <div style={s.sousTitre}>Livraison <Jour date={commande.date_livraison} /></div>
                    {!recue && !envoyee && commande.envoyer_avant && (
                      <div style={{ ...s.sousTitre, ...(limitePassee(commande.envoyer_avant) ? s.alerte : null) }}>
                        À envoyer avant <Limite iso={commande.envoyer_avant} />
                      </div>
                    )}
                  </div>
                  <span style={{ ...s.statut, ...(recue ? s.statutRecu : envoyee ? s.statutEnvoye : null) }}>
                    {recue ? 'Reçue' : envoyee ? 'Envoyée' : 'Brouillon'}
                  </span>
                  <BoutonActions
                    id="commande-gerer"
                    label="Gérer"
                    ariaLabel="Gérer la commande"
                    style={fs.secondaire}
                    titre="Gérer la commande"
                    sections={[{
                      items: [
                        { titre: 'Télécharger le PDF', detail: 'La commande en colis, prête à imprimer.', onClick: exporterPdf },
                        envoyee && !enReception ? { titre: 'Repasser en brouillon', detail: 'Pour la modifier avant de la renvoyer.', onClick: () => changerStatut('brouillon') } : null,
                        enReception ? { titre: 'Annuler la réception', detail: 'Rien n’est enregistré.', onClick: () => setReception(null) } : null,
                        (commande.statut === 'brouillon' || estDirection) && !recue
                          ? { titre: 'Supprimer la commande', detail: commande.statut === 'brouillon' ? 'Le brouillon et ses lignes.' : 'La commande envoyée et ses lignes.', danger: true, onClick: supprimerCommande }
                          : null,
                      ],
                    }]}
                  />
                </div>

                {lignesCommande.length === 0 ? (
                  <div style={s.vide}>Aucun produit dans cette commande. Ajoutez un produit.</div>
                ) : (
                  <div>
                    {lignesCommande.map((l, i) => (
                      enReception
                        ? <LigneReception key={l.id} ligne={l} etat={reception.lignes[l.id] || {}} onChange={(v) => poserReception(l.id, v)} derniere={i === lignesCommande.length - 1} />
                        : <LigneCommande key={l.id} ligne={l} modifiable={!!modifiable} recue={recue} derniere={i === lignesCommande.length - 1}
                          onReste={(reste) => ecrireLigne(l, { reste })} onOuvrir={() => setFenetre({ type: 'ligne', ligne: l })} />
                    ))}
                  </div>
                )}

                {enReception && (
                  <div style={s.piedReception}>
                    <label style={{ ...fs.section, flex: '1 1 200px' }}>
                      <span style={fs.label}>Numéro du bon de livraison (facultatif)</span>
                      <input style={fs.champ} value={reception.numero} onChange={(e) => setReception((r) => ({ ...r, numero: e.target.value }))} data-no-translate="" />
                    </label>
                    <div style={s.boutonsReception}>
                      <Btn variant="ghost" onClick={() => setReception(null)}>Annuler</Btn>
                      <Btn variant="primary" disabled={enCours} onClick={validerReception}>Valider la réception</Btn>
                    </div>
                    <div style={s.remarque}>Une ligne non cochée est reçue comme commandée.</div>
                  </div>
                )}

                {recue && commande.achat_document_id && (
                  <div style={s.piedReception}>
                    <div style={s.remarque}>Le bon de livraison de cette réception est dans Factures & achats.</div>
                    <Btn variant="ghost" onClick={() => navigateToPage('achats')}>Ouvrir Factures & achats</Btn>
                  </div>
                )}
              </Panneau>

              {(aPrendre.length > 0 || prisCommande.length > 0) && !enReception && (
                <Panneau style={s.carte} data-commande-groupes="">
                  <div style={s.titreSection}>Groupes à venir</div>
                  {prisCommande.map((p, i) => {
                    const g = groupes.find((x) => x.id === p.groupe_evenement_id);
                    const change = g && Number(g.nbPax) !== Number(p.nb_pax);
                    return (
                      <div key={p.id} style={{ ...ligneStyle({ derniere: i === prisCommande.length - 1 && aPrendre.length === 0 }), ...s.ligneGroupe }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={s.nom}><span data-no-translate="">{g?.nom || 'Groupe'}</span></div>
                          <div style={s.detail}>
                            {g?.dateEvenement && <><Jour date={g.dateEvenement} />, </>}<N>{p.nb_pax}</N> couverts, besoins ajoutés
                            {change && <> (<span style={s.alerte}>le groupe compte maintenant <N>{g.nbPax}</N> couverts : besoins à revoir</span>)</>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {aPrendre.map((g, i) => (
                    <div key={g.id} style={{ ...ligneStyle({ derniere: i === aPrendre.length - 1 }), ...s.ligneGroupe }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.nom}><span data-no-translate="">{g.nom || 'Groupe'}</span></div>
                        <div style={s.detail}><Jour date={g.dateEvenement} />, <N>{g.nbPax}</N> couverts</div>
                      </div>
                      {modifiable && <Btn variant="ghost" disabled={enCours} onClick={() => ajouterGroupe(g)}>Ajouter les besoins</Btn>}
                    </div>
                  ))}
                </Panneau>
              )}

              {modifiable && (
                <Panneau style={s.carteNote}>
                  <label style={fs.section}>
                    <span style={fs.label}>Note pour le fournisseur</span>
                    <NoteCommande valeur={commande.note || ''} onValider={ecrireNote} />
                  </label>
                </Panneau>
              )}
            </>
          )}
        </div>
      </div>

      {fenetre?.type === 'envoyer' && message && (
        <Fenetre
          id="commande-envoyer"
          titre="J'envoie la commande"
          sousTitre={<span data-no-translate="">{fournisseur?.nom}</span>}
          onClose={() => setFenetre(null)}
          largeur={560}
        >
          <div style={fs.section}>
            {message.a
              ? <div style={s.remarque}>À <span data-no-translate="">{message.a}</span></div>
              : <div style={{ ...s.remarque, ...s.alerte }}>Ce fournisseur n'a pas d'adresse courriel dans le Catalogue. Ajoutez-la dans le brouillon.</div>}
            <div style={s.apercu} data-no-translate="">{message.corps}</div>
          </div>
          <div style={fs.section}>
            <Choix titre="Ouvrir le brouillon Gmail" detail="Le message est déjà écrit. Relisez-le, puis envoyez-le." onClick={() => envoyer('gmail')} />
            <Choix titre="Autre messagerie" detail="Le même message dans la messagerie de l'appareil." onClick={() => envoyer('mail')} />
            <Choix titre="Télécharger le PDF" detail="La commande en colis, à joindre ou à imprimer." onClick={() => envoyer('pdf')} />
            <Choix titre="Je l'ai passée par téléphone" detail="La commande est marquée envoyée." onClick={() => envoyer('telephone')} />
          </div>
        </Fenetre>
      )}

      {fenetre?.type === 'ligne' && (
        <FenetreLigne
          ligne={lignes.find((l) => l.id === fenetre.ligne.id) || fenetre.ligne}
          modifiable={!!modifiable}
          onClose={() => setFenetre(null)}
          onQuantite={async (quantite) => { await ecrireLigne(fenetre.ligne, { quantite }); setFenetre(null); }}
          onRetirer={() => retirerLigne(fenetre.ligne)}
        />
      )}

      {fenetre?.type === 'ajouter' && (
        <Fenetre id="commande-ajouter-produit" titre="J'ajoute un produit" sousTitre={<span data-no-translate="">{fournisseur?.nom}</span>} onClose={() => setFenetre(null)}>
          <div style={fs.section}>
            {produitsHorsCommande.map((p) => (
              <Choix key={p.id} titre={<span data-no-translate="">{p.nom}</span>} detail={p.conditionnement ? <span data-no-translate="">{p.conditionnement}</span> : null} onClick={() => ajouterProduit(p.id)} />
            ))}
          </div>
        </Fenetre>
      )}

      {fenetre?.type === 'autre' && (
        <FenetreAutreFournisseur
          fournisseurs={fenetre.fournisseurId ? fournisseurs : autres}
          fournisseurId={fenetre.fournisseurId}
          enCours={enCours}
          onClose={() => setFenetre(null)}
          onCreer={async (fid, date) => { setFenetre(null); await creerCommande(fid, date); setOngletChoisi(fid); writeText(cleOnglet(etabId), fid); }}
        />
      )}
    </div>
  );
}

// ── Une ligne de commande : le reste à taper, la quantité calculée ──
function LigneCommande({ ligne, modifiable, recue, derniere, onReste, onOuvrir }) {
  const [saisie, setSaisie] = React.useState(null); // texte en cours de frappe
  const u = uniteAffichage(ligne.unite);
  const resteEnCours = saisie == null ? undefined : depuisChamp(saisie, ligne.unite);
  const q = quantiteRetenue(ligne, resteEnCours === undefined && saisie != null ? ligne.reste : resteEnCours);
  const aCible = ligne.stock_cible !== null && ligne.stock_cible !== undefined;
  const valider = () => {
    if (saisie == null) return;
    const v = depuisChamp(saisie, ligne.unite);
    setSaisie(null);
    if (v === undefined) { notify('Ce reste n’est pas lisible.', 'warning'); return; }
    if (v !== (ligne.reste ?? null)) onReste(v);
  };
  const idNom = `commande-ligne-${ligne.id}`;
  const details = [
    ligne.conditionnement_libelle || null,
    aCible ? <>cible <N>{formatQuantite(ligne.stock_cible, ligne.unite)}</N></> : null,
    Number(ligne.besoin_groupes) > 0 ? <>groupes <N>{formatQuantite(ligne.besoin_groupes, ligne.unite)}</N></> : null,
  ].filter(Boolean);
  return (
    <div style={{ ...ligneStyle({ derniere }), ...s.ligne }} data-ligne-commande={ligne.id}>
      <div style={s.colNom}>
        <div id={idNom} style={s.nom}><span data-no-translate="">{ligne.nom}</span></div>
        {details.length > 0 && (
          <div style={s.detail}>{details.map((d, i) => <React.Fragment key={i}>{i > 0 && ', '}{typeof d === 'string' ? <span data-no-translate="">{d}</span> : d}</React.Fragment>)}</div>
        )}
        {recue && ligne.statut_reception && (
          <div style={{ ...s.detail, ...(ligne.statut_reception !== 'recu' ? s.alerte : null) }}>
            {ligne.statut_reception === 'recu' ? 'Reçu' : ligne.statut_reception === 'ecart' ? 'Écart' : 'Manquant'}
            {ligne.statut_reception !== 'recu' && ligne.quantite_recue != null && <>, reçu <N>{formatQuantite(ligne.quantite_recue, ligne.unite)}</N></>}
            {ligne.lot && <>, lot <N>{ligne.lot}</N></>}
            {ligne.dlc && <>, DLC <N>{ligne.dlc.split('-').reverse().slice(0, 2).join('.')}</N></>}
          </div>
        )}
      </div>
      {aCible && (
        <label style={s.colReste}>
          <span style={s.libelleChamp}>Il en reste</span>
          <span style={s.champUnite}>
            <input
              type="text" inputMode="decimal"
              style={s.champ}
              value={saisie != null ? saisie : versChamp(ligne.reste, ligne.unite)}
              disabled={!modifiable}
              aria-labelledby={`commande-lbl-reste ${idNom}`}
              onChange={(e) => setSaisie(e.target.value)}
              onBlur={valider}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
              data-no-translate=""
            />
            <span style={s.unite}>{u.libelle}</span>
          </span>
        </label>
      )}
      <button type="button" style={s.colQuantite} onClick={onOuvrir} aria-describedby={idNom}>
        <span style={s.libelleChamp}>À commander</span>
        <span style={q === null ? s.quantiteVide : s.quantite}>
          {q === null ? (aCible ? 'Tapez le reste' : 'Quantité à choisir') : q === 0 ? 'Rien' : <span data-no-translate="">{libelleCommande(ligne, q)}</span>}
        </span>
      </button>
    </div>
  );
}

// ── Une ligne en réception : reçu, écart (quantité reçue) ou manquant ──
function LigneReception({ ligne, etat, onChange, derniere }) {
  const q = quantiteRetenue(ligne);
  const u = uniteAffichage(ligne.unite);
  const idNom = `commande-recep-${ligne.id}`;
  return (
    <div style={{ ...ligneStyle({ derniere }), ...s.ligneReception }} data-ligne-reception={ligne.id}>
      <div style={s.colNom}>
        <div id={idNom} style={s.nom}><span data-no-translate="">{ligne.nom}</span></div>
        <div style={s.detail}>Commandé <N>{q != null ? libelleCommande(ligne, q) : '0'}</N></div>
      </div>
      <div style={s.pilules} role="group" aria-labelledby={idNom}>
        {STATUTS_RECEPTION.map((x) => {
          const actif = (etat.statut || null) === x.id;
          return (
            <button key={x.id} type="button" aria-pressed={actif} style={{ ...s.pilule, ...(actif ? s.piluleActive : null) }}
              onClick={() => onChange({ statut: actif ? null : x.id })}>
              {x.label}
            </button>
          );
        })}
        <button type="button" aria-expanded={!!etat.ouvert} style={s.pilule} onClick={() => onChange({ ouvert: !etat.ouvert })}>Lot et DLC</button>
      </div>
      {etat.statut === 'ecart' && (
        <label style={s.colReste}>
          <span style={s.libelleChamp}>Quantité reçue</span>
          <span style={s.champUnite}>
            <input type="text" inputMode="decimal" style={s.champ} value={etat.quantite || ''} onChange={(e) => onChange({ quantite: e.target.value })} data-no-translate="" aria-describedby={idNom} />
            <span style={s.unite}>{u.libelle}</span>
          </span>
        </label>
      )}
      {etat.ouvert && (
        <div style={s.lotDlc}>
          <label style={{ ...fs.section, flex: '1 1 140px' }}>
            <span style={fs.label}>Lot</span>
            <input style={fs.champ} value={etat.lot || ''} onChange={(e) => onChange({ lot: e.target.value })} data-no-translate="" />
          </label>
          <label style={{ ...fs.section, flex: '1 1 160px' }}>
            <span style={fs.label}>DLC</span>
            <input type="date" style={fs.champ} value={etat.dlc || ''} onChange={(e) => onChange({ dlc: e.target.value })} />
          </label>
        </div>
      )}
    </div>
  );
}

function FenetreLigne({ ligne, modifiable, onClose, onQuantite, onRetirer }) {
  const [texte, setTexte] = React.useState(() => versChamp(ligne.quantite, ligne.unite));
  const u = uniteAffichage(ligne.unite);
  const calcul = quantiteRetenue({ ...ligne, quantite: null });
  const valider = () => {
    const v = depuisChamp(texte, ligne.unite);
    if (v === undefined) { notify('Cette quantité n’est pas lisible.', 'warning'); return; }
    onQuantite(v);
  };
  return (
    <Fenetre
      id="commande-ligne"
      titre={<span data-no-translate="">{ligne.nom}</span>}
      onClose={onClose}
      pied={modifiable ? (
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={fs.primaire} onClick={valider}>Enregistrer</button>
        </>
      ) : null}
    >
      <div style={fs.section}>
        <div style={s.remarque}>
          {calcul === null ? 'Calcul : en attente du reste.' : <>Calcul : <N>{libelleCommande(ligne, calcul) || '0'}</N>.</>}
        </div>
        {modifiable && (
          <label style={fs.section}>
            <span style={fs.label}>Quantité à commander <span data-no-translate="">({u.libelle})</span></span>
            <input type="text" inputMode="decimal" style={fs.champ} value={texte} onChange={(e) => setTexte(e.target.value)} data-no-translate="" />
            <span style={fs.remarque}>Laissez vide pour garder le calcul.</span>
          </label>
        )}
      </div>
      {modifiable && (
        <div style={fs.section}>
          <Choix titre="Retirer de la commande" detail="La ligne part de cette commande seulement." danger onClick={onRetirer} />
        </div>
      )}
    </Fenetre>
  );
}

function FenetreAutreFournisseur({ fournisseurs, fournisseurId, enCours, onClose, onCreer }) {
  const [fid, setFid] = React.useState(fournisseurId || fournisseurs[0]?.id || '');
  const [date, setDate] = React.useState(() => zurichAjouterJours(zurichToday(), 1));
  return (
    <Fenetre
      id="commande-autre"
      titre="Préparer une commande"
      onClose={onClose}
      pied={(
        <>
          <button type="button" style={fs.secondaire} onClick={onClose}>Annuler</button>
          <button type="button" style={fs.primaire} disabled={!fid || !date || enCours} onClick={() => onCreer(fid, date)}>Préparer la commande</button>
        </>
      )}
    >
      <label style={fs.section}>
        <span style={fs.label}>Fournisseur</span>
        <select style={fs.champ} value={fid} onChange={(e) => setFid(e.target.value)} disabled={!!fournisseurId}>
          {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
        </select>
      </label>
      <label style={fs.section}>
        <span style={fs.label}>Date de livraison</span>
        <input type="date" style={fs.champ} value={date} min={zurichToday()} onChange={(e) => setDate(e.target.value)} />
      </label>
    </Fenetre>
  );
}

function NoteCommande({ valeur, onValider }) {
  const [texte, setTexte] = React.useState(valeur);
  React.useEffect(() => { setTexte(valeur); }, [valeur]);
  return (
    <textarea style={{ ...fs.champ, minHeight: 72, resize: 'vertical' }} value={texte} onChange={(e) => setTexte(e.target.value)} onBlur={() => onValider(texte.trim())} data-no-translate="" />
  );
}

const s = {
  carte: { padding: 0, overflow: 'hidden' },
  carteNote: { padding: 16 },
  entete: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', boxShadow: 'inset 0 -1px 0 var(--rule-soft)', flexWrap: 'wrap' },
  titre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  sousTitre: { fontSize: 'var(--t2)', color: 'var(--text2)', marginTop: 2 },
  alerte: { color: 'var(--danger-text)' },
  statut: { alignSelf: 'center', fontSize: 'var(--t1)', fontWeight: 'var(--g2)', color: 'var(--text2)', background: 'var(--piste)', borderRadius: 'var(--r-full)', padding: '4px 12px', whiteSpace: 'nowrap' },
  statutEnvoye: { background: 'var(--info-bg)', color: 'var(--info-text)' },
  statutRecu: { background: 'var(--success-bg)', color: 'var(--success-text)' },
  titreSection: { fontSize: 'var(--t2)', fontWeight: 'var(--g3)', color: 'var(--text)', padding: '14px 16px 4px' },
  ligne: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', flexWrap: 'wrap' },
  ligneReception: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', flexWrap: 'wrap' },
  ligneGroupe: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', flexWrap: 'wrap' },
  colNom: { flex: '1 1 180px', minWidth: 0 },
  nom: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', color: 'var(--text)', overflowWrap: 'anywhere' },
  detail: { fontSize: 'var(--t1)', color: 'var(--text2)', marginTop: 2 },
  colReste: { display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 auto' },
  libelleChamp: { fontSize: 'var(--t1)', color: 'var(--text3)' },
  champUnite: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  champ: { width: 84, minHeight: 44, boxSizing: 'border-box', padding: '0 10px', textAlign: 'right', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--champ-bord)', borderRadius: 'var(--r)', background: 'var(--surface)', color: 'var(--text)', fontFamily: 'var(--font-num)', fontSize: 'var(--t2)' },
  unite: { fontSize: 'var(--t2)', color: 'var(--text2)', minWidth: 40 },
  colQuantite: { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, flex: '1 1 180px', minHeight: 44, padding: '4px 10px', background: 'transparent', borderWidth: 0, borderStyle: 'none', borderRadius: 'var(--r)', textAlign: 'left', cursor: 'pointer', fontFamily: 'var(--font)', color: 'var(--text)' },
  quantite: { fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font-num)' },
  quantiteVide: { fontSize: 'var(--t2)', color: 'var(--text3)' },
  pilules: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  pilule: { minHeight: 44, padding: '0 14px', borderWidth: 1, borderStyle: 'solid', borderColor: 'var(--btn-bord)', background: 'var(--btn-fond)', color: 'var(--btn-texte)', borderRadius: 'var(--r-full)', fontSize: 'var(--t2)', fontWeight: 'var(--g2)', fontFamily: 'var(--font)', cursor: 'pointer' },
  piluleActive: { background: 'var(--accent)', color: 'var(--on-accent)', borderColor: 'var(--accent)' },
  lotDlc: { display: 'flex', gap: 10, flexWrap: 'wrap', flex: '1 1 100%' },
  piedReception: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12, padding: '14px 16px', boxShadow: 'inset 0 1px 0 var(--rule-soft)' },
  boutonsReception: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  remarque: { fontSize: 'var(--t1)', color: 'var(--text2)', lineHeight: 1.5, flex: '1 1 100%' },
  apercu: { whiteSpace: 'pre-wrap', fontSize: 'var(--t2)', color: 'var(--text)', lineHeight: 1.5, background: 'var(--piste)', borderRadius: 'var(--r)', padding: 12, maxHeight: 260, overflowY: 'auto' },
  actionsCote: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  vide: { padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 'var(--t2)' },
  videCarte: { padding: 32, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  videTitre: { fontSize: 'var(--t3)', fontWeight: 'var(--g3)', color: 'var(--text)' },
  videTexte: { fontSize: 'var(--t2)', color: 'var(--text2)', maxWidth: 440 },
};
