import { useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase.js';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import { useAchatsDocuments } from '../inventaire/useAchatsDocuments.js';
import { lirePeriode, useContrats } from '../planning/contratsService.js';
import { bornesMois } from '../planning/soldesHeures.js';
import { REGLAGES_DEFAUT, lireToutesLesPages, useLecture, useTableCompta } from './comptaService.js';
import { ajouterJours, finEffective, periodeMois } from './periodesCompta.js';
import { resumeVentes, ventesParJour } from './ventesCompta.js';
import { synthese } from './syntheseCompta.js';
import { coutPersonnel } from './personnelCompta.js';
import { etatTva, periodeTva } from './tvaCompta.js';
import { etatBanque } from './rapprochement.js';

// ─────────────────────────────────────────────────────────────────────────────
// Toutes les lectures de la Comptabilité pour une période, et les calculs qui
// en sortent (synthèse de la période et de la précédente). Appelé une fois,
// par Comptabilite.jsx, seulement pour qui peut lire les chiffres (D5) : sans
// ce droit, aucune lecture n'est lancée.
//
// Fenêtre de lecture des ventes : de la période précédente (comparaison), des
// 14 derniers jours (écran Chiffre du jour) ou du décompte de TVA précédent
// (écran TVA), jusqu'à aujourd'hui, ou la fin de la période si elle court
// encore. Horaires lus mois par mois par lirePeriode du Planning (jours
// ouverts, heures du personnel), sans le modifier.
//
// Personnel (D4, D14) : salaires estimés et contrats lus pour la direction
// seulement (consultant, patron) ; pour qui règle les factures sans être de la
// direction, le coût du personnel reste « réservé à la direction ».
//
// Banque et trésorerie (`banque`, droit « Régler les factures ») : relevés et
// lignes de relevé, ventes des 45 derniers jours (chiffre d'affaires moyen) et,
// pour la direction, horaires du mois précédent (salaires estimés d'un mois).
// ─────────────────────────────────────────────────────────────────────────────

const PRET = new Set(['ready', 'absente', 'inactif']);
// État d'un chiffre qui dépend de plusieurs lectures.
export function etatDe(...statuts) {
  if (statuts.some(s => s === 'loading')) return 'loading';
  if (statuts.some(s => s === 'error')) return 'error';
  return statuts.every(s => PRET.has(s)) ? 'ready' : 'loading';
}

// Clés de mois (AAAA-MM) couvertes par des intervalles.
function moisDe(intervalles) {
  const cles = new Set();
  intervalles.forEach(([debut, fin]) => {
    let a = Number(debut.slice(0, 4));
    let m = Number(debut.slice(5, 7));
    const finCle = fin.slice(0, 7);
    for (let garde = 0; garde < 40; garde += 1) {
      const cle = `${a}-${String(m).padStart(2, '0')}`;
      if (cle > finCle) break;
      cles.add(cle);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
  });
  return [...cles].sort();
}

// Ventes de la caisse : connexions de l'établissement, leurs plats (archivés
// compris : une vente passée reste une vente), puis les ventes de la fenêtre.
async function lireCaisse(etabId, debut, fin) {
  const { data: conns, error } = await supabase.from('pos_connections').select('id').eq('etablissement_id', etabId);
  if (error) throw error;
  if (!conns?.length) return { connexions: 0, lignes: [] };
  const items = await lireToutesLesPages((de, a) => supabase.from('pos_items').select('id')
    .in('pos_connection_id', conns.map(c => c.id)).order('id').range(de, a));
  const ids = items.map(i => i.id);
  const lignes = [];
  // Par paquets de 150 plats : l'URL de la requête reste courte.
  for (let i = 0; i < ids.length; i += 150) {
    const paquet = ids.slice(i, i + 150);
    const ventes = await lireToutesLesPages((de, a) => supabase.from('pos_sales').select('id, date, revenue_cts')
      .in('pos_item_id', paquet).gte('date', debut).lte('date', fin).order('id').range(de, a));
    ventes.forEach(v => lignes.push({ jour: v.date, montantTtc: (Number(v.revenue_cts) || 0) / 100 }));
  }
  return { connexions: conns.length, lignes };
}

export function useCompta({ etablissement, periode, precedente, aujourdhui, inventaires, direction = false, banque = false, actif = true }) {
  const etabId = etablissement?.id || null;
  const hebergement = isModuleActiveForEtab(etablissement, 'hebergement');
  const finEff = finEffective(periode, aujourdhui);
  const quinzaine = ajouterJours(aujourdhui, -13);
  // Mois précédent entier : salaires estimés d'un mois pour la trésorerie.
  const moisPasse = useMemo(() => periodeMois(ajouterJours(`${aujourdhui.slice(0, 7)}-01`, -1)), [aujourdhui]);

  // ── Tables neuves ──
  const reglagesLus = useTableCompta('compta_reglages', etabId, { actif, ordre: ['etablissement_id'] });
  const reglages = useMemo(() => ({ ...REGLAGES_DEFAUT, ...(reglagesLus.lignes[0] || {}) }), [reglagesLus.lignes]);
  // Décompte de TVA précédent : le premier jour de vente dont l'écran TVA a besoin.
  const tvaPrecedente = periodeTva(aujourdhui, reglages.methodeTva, -1);
  const debutLecture = [precedente?.debut, periode.debut, quinzaine, tvaPrecedente.debut, banque ? ajouterJours(aujourdhui, -45) : null]
    .filter(Boolean).sort()[0];
  const finLecture = periode.fin > aujourdhui ? periode.fin : aujourdhui;

  const ventesJour = useTableCompta('ventes_jour', etabId, { debut: debutLecture, fin: finLecture, colonneDate: 'jour', actif, ordre: ['jour', 'taux'] });
  const charges = useTableCompta('charges_fixes', etabId, { actif, ordre: ['debut', 'id'] });
  // Salaires : direction seulement (RLS) ; pour un autre, une liste vide mentirait.
  const salaires = useTableCompta('salaires_estimes', etabId, { actif: actif && direction, ordre: ['debut', 'id'] });
  const contratsLus = useContrats(actif && direction ? etabId : null);
  // Banque : seulement pour qui règle les factures (Banque et Trésorerie).
  const releves = useTableCompta('releves_bancaires', etabId, { actif: actif && banque, ordre: ['created_at', 'id'] });
  const lignesReleve = useTableCompta('releve_lignes', etabId, { actif: actif && banque, ordre: ['date_operation', 'id'] });

  // ── Lectures existantes ──
  const achats = useAchatsDocuments(etabId, { actif });

  const lireCaisseFenetre = useCallback(() => lireCaisse(etabId, debutLecture, finLecture), [etabId, debutLecture, finLecture]);
  const caisse = useLecture(`caisse|${etabId}|${debutLecture}|${finLecture}`, lireCaisseFenetre, { actif: actif && !!etabId, tables: ['pos_sales'] });

  const lireNotes = useCallback(() => lireToutesLesPages((de, a) => supabase.from('sejour_lignes').select('jour, type, montant, tva_taux')
    .eq('etablissement_id', etabId).gte('jour', debutLecture).lte('jour', finLecture).order('jour').order('id').range(de, a)), [etabId, debutLecture, finLecture]);
  const notes = useLecture(`notes|${etabId}|${debutLecture}|${finLecture}`, lireNotes, { actif: actif && !!etabId && hebergement, tables: ['sejour_lignes'] });

  // Horaires : mois de la période, des 14 derniers jours et de la période
  // précédente (jours ouverts de la comparaison), sauf l'année précédente
  // (24 mois de lectures pour un écart).
  const intervalles = [[periode.debut, finEff], [quinzaine, aujourdhui]];
  if (precedente && precedente.type !== 'annee') intervalles.push([precedente.debut, finEffective(precedente, aujourdhui)]);
  if (banque && direction) intervalles.push([moisPasse.debut, moisPasse.fin]);
  const moisHoraires = moisDe(intervalles);
  const lireHoraires = useCallback(async () => {
    const parMois = await Promise.all(moisHoraires.map((cle) => {
      const { debut, fin } = bornesMois(cle);
      return lirePeriode(etabId, debut, fin).then(r => r.shifts);
    }));
    return parMois.flat();
  }, [etabId, moisHoraires.join(',')]);
  const horaires = useLecture(`horaires|${etabId}|${moisHoraires.join(',')}`, lireHoraires, { actif: actif && !!etabId });

  // ── Calculs ──
  const docs = Array.isArray(achats.docs) ? achats.docs : [];
  const listeInventaires = inventaires?.data || [];
  const chargesListe = charges.status === 'ready' ? charges.lignes : null;

  // Personnel : prêt quand horaires, salaires, contrats et réglages sont lus.
  // Sans la migration (salaires absents), il n'est pas estimé.
  const contratsStatut = contratsLus.status === 'absent' ? 'ready' : contratsLus.status;
  const personnelEtat = !direction ? 'inactif'
    : salaires.status === 'absente' ? 'absente'
      : etatDe(horaires.status, salaires.status, contratsStatut, reglagesLus.status === 'absente' ? 'ready' : reglagesLus.status);
  const personnelPret = personnelEtat === 'ready';

  const parJourTout = useMemo(() => ventesParJour({
    manuel: ventesJour.lignes,
    pos: caisse.data?.lignes || [],
    notes: (notes.data || []).map(l => ({ jour: l.jour, type: l.type, montant: l.montant, tvaTaux: l.tva_taux })),
  }), [ventesJour.lignes, caisse.data, notes.data]);

  const joursOuverts = useMemo(() => new Set((horaires.data || []).map(s => s.date)), [horaires.data]);

  const calculs = useMemo(() => {
    const dans = (p) => (j) => j.jour >= p.debut && j.jour <= p.fin;
    const resume = (p) => resumeVentes({
      parJour: parJourTout.filter(dans(p)), joursOuverts, debut: p.debut, finEffective: finEffective(p, aujourdhui), aujourdhui,
    });
    // Personnes suivies : contrats qui couvrent une partie de la période.
    const personnel = (p) => {
      if (!personnelPret) return null;
      const fin = finEffective(p, aujourdhui);
      const personnes = contratsLus.contrats.filter(c => c.debut <= fin && (!c.fin || c.fin >= p.debut)).map(c => c.profileId);
      return coutPersonnel({ personnes, salaires: salaires.lignes, shifts: horaires.data || [], reglages, debut: p.debut, fin: p.fin, aujourdhui });
    };
    const tva = (p) => etatTva({ ventes: parJourTout, docs, charges: chargesListe, reglages, debut: p.debut, fin: p.fin, aujourdhui });

    const ventes = resume(periode);
    const personnelCourant = personnel(periode);
    const tvaPeriode = tva(periode);
    const courante = synthese({ periode, aujourdhui, ventes, docs, charges: chargesListe, personnel: personnelCourant, inventaires: listeInventaires, tva: tvaPeriode });
    let prec = null;
    if (precedente) {
      // Horaires de l'année précédente non lus (24 mois de lectures pour un
      // écart) : pas de personnel, donc pas de résultat comparable.
      const personnelPrec = precedente.type === 'annee' ? null : personnel(precedente);
      prec = synthese({ periode: precedente, aujourdhui, ventes: resume(precedente), docs, charges: chargesListe, personnel: personnelPrec, inventaires: listeInventaires, tva: tva(precedente) });
      if (personnelCourant && !personnelPrec) prec = { ...prec, resultat: null };
    }
    // Salaires estimés d'un mois entier (trésorerie) : le mois précédent.
    const salaireMensuel = banque ? (personnel(moisPasse)?.total ?? null) : null;
    return { parJour: parJourTout.filter(dans(periode)), synthese: courante, precedente: prec, tvaPeriode, salaireMensuel };
  }, [parJourTout, joursOuverts, periode, precedente, aujourdhui, docs, chargesListe, listeInventaires,
    personnelPret, contratsLus.contrats, salaires.lignes, horaires.data, reglages, banque, moisPasse]);

  // Décomptes de TVA : le précédent (à déclarer) et celui en cours ; montré
  // d'abord, le précédent tant que son échéance n'est pas passée.
  const tva = useMemo(() => {
    const decomptes = [-1, 0].map((decalage) => {
      const p = periodeTva(aujourdhui, reglages.methodeTva, decalage);
      return { periode: p, etat: etatTva({ ventes: parJourTout, docs, charges: chargesListe, reglages, debut: p.debut, fin: p.fin, aujourdhui }) };
    });
    return { decomptes, defaut: decomptes[0].periode.echeance >= aujourdhui ? 0 : 1 };
  }, [aujourdhui, reglages, parJourTout, docs, chargesListe]);

  // ── États ──
  const achatsStatut = achats.docs === null ? 'loading' : (achats.loadError && !docs.length ? 'error' : 'ready');
  const etats = {
    ventes: etatDe(ventesJour.status, caisse.status, notes.status),
    couverture: horaires.status,
    achats: achatsStatut,
    matiere: periode.type === 'inventaire' ? etatDe(achatsStatut, inventaires?.status || 'loading') : achatsStatut,
    charges: charges.status,
    reglages: reglagesLus.status,
    personnel: personnelEtat,
  };
  const pretOuAbsent = (s) => (s === 'absente' || s === 'inactif' ? 'ready' : s);
  etats.resultat = etatDe(etats.ventes, etats.matiere, pretOuAbsent(etats.charges), pretOuAbsent(personnelEtat));
  // TVA : ventes, achats et charges fixes (sans la migration, sans les charges).
  etats.tva = etatDe(etats.ventes, achatsStatut, pretOuAbsent(etats.charges), pretOuAbsent(reglagesLus.status));
  const migrationAbsente = [ventesJour.status, charges.status, reglagesLus.status].includes('absente');
  const enEchec = [ventesJour, charges, reglagesLus, salaires, caisse, notes, horaires, inventaires, releves, lignesReleve].some(l => l?.enEchec)
    || (achats.loadError && docs.length > 0);

  const reloadTout = useCallback(() => Promise.all([
    ventesJour.reload(), charges.reload(), reglagesLus.reload(), salaires.reload(), caisse.reload(), notes.reload(), horaires.reload(),
    inventaires?.reload?.(), achats.reload(), releves.reload(), lignesReleve.reload(),
  ]), [ventesJour.reload, charges.reload, reglagesLus.reload, salaires.reload, caisse.reload, notes.reload, horaires.reload, inventaires,
    achats.reload, releves.reload, lignesReleve.reload]);

  // Banque : dernier relevé et paiements à rapprocher (accueil, trésorerie).
  const etatDeLaBanque = useMemo(() => etatBanque(releves.lignes, lignesReleve.lignes), [releves.lignes, lignesReleve.lignes]);

  return {
    hebergement,
    ventesJour,
    charges,
    salaires,
    releves,
    lignesReleve,
    banque: etatDeLaBanque,
    moisPasse,
    contrats: contratsLus,
    reglages,
    reglagesLus,
    achats,
    docs,
    caisse,
    horaires,
    joursOuverts,
    parJourTout,
    ...calculs,
    tva,
    etats,
    migrationAbsente,
    enEchec,
    reloadTout,
  };
}
