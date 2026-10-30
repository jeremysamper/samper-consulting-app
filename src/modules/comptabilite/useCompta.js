import { useCallback, useMemo } from 'react';
import { supabase } from '../../services/supabase.js';
import { isModuleActiveForEtab } from '../moduleConfig.js';
import { useAchatsDocuments } from '../inventaire/useAchatsDocuments.js';
import { lirePeriode } from '../planning/contratsService.js';
import { bornesMois } from '../planning/soldesHeures.js';
import { REGLAGES_DEFAUT, lireToutesLesPages, useLecture, useTableCompta } from './comptaService.js';
import { ajouterJours, finEffective } from './periodesCompta.js';
import { resumeVentes, ventesParJour } from './ventesCompta.js';
import { synthese } from './syntheseCompta.js';

// ─────────────────────────────────────────────────────────────────────────────
// Toutes les lectures de la Comptabilité pour une période, et les calculs qui
// en sortent (synthèse de la période et de la précédente). Appelé une fois,
// par Comptabilite.jsx, seulement pour qui peut lire les chiffres (D5) : sans
// ce droit, aucune lecture n'est lancée.
//
// Fenêtre de lecture des ventes : de la période précédente (comparaison) ou
// des 14 derniers jours (écran Chiffre du jour) jusqu'à aujourd'hui, ou la fin
// de la période si elle court encore. Horaires lus mois par mois par
// lirePeriode du Planning (jours ouverts), sans le modifier.
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

export function useCompta({ etablissement, periode, precedente, aujourdhui, inventaires, actif = true }) {
  const etabId = etablissement?.id || null;
  const hebergement = isModuleActiveForEtab(etablissement, 'hebergement');
  const finEff = finEffective(periode, aujourdhui);
  const quinzaine = ajouterJours(aujourdhui, -13);
  const debutLecture = [precedente?.debut, periode.debut, quinzaine].filter(Boolean).sort()[0];
  const finLecture = periode.fin > aujourdhui ? periode.fin : aujourdhui;

  // ── Tables neuves ──
  const ventesJour = useTableCompta('ventes_jour', etabId, { debut: debutLecture, fin: finLecture, colonneDate: 'jour', actif, ordre: ['jour', 'taux'] });
  const charges = useTableCompta('charges_fixes', etabId, { actif, ordre: ['debut', 'id'] });
  const reglagesLus = useTableCompta('compta_reglages', etabId, { actif, ordre: ['etablissement_id'] });

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
  const reglages = useMemo(() => ({ ...REGLAGES_DEFAUT, ...(reglagesLus.lignes[0] || {}) }), [reglagesLus.lignes]);

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
    const ventes = resume(periode);
    const courante = synthese({ periode, aujourdhui, ventes, docs, charges: chargesListe, personnel: null, inventaires: listeInventaires });
    const ventesPrec = precedente ? resume(precedente) : null;
    const prec = precedente
      ? synthese({ periode: precedente, aujourdhui, ventes: ventesPrec, docs, charges: chargesListe, personnel: null, inventaires: listeInventaires })
      : null;
    return { parJour: parJourTout.filter(dans(periode)), synthese: courante, precedente: prec };
  }, [parJourTout, joursOuverts, periode, precedente, aujourdhui, docs, chargesListe, listeInventaires]);

  // ── États ──
  const achatsStatut = achats.docs === null ? 'loading' : (achats.loadError && !docs.length ? 'error' : 'ready');
  const etats = {
    ventes: etatDe(ventesJour.status, caisse.status, notes.status),
    couverture: horaires.status,
    achats: achatsStatut,
    matiere: periode.type === 'inventaire' ? etatDe(achatsStatut, inventaires?.status || 'loading') : achatsStatut,
    charges: charges.status,
    reglages: reglagesLus.status,
  };
  etats.resultat = etatDe(etats.ventes, etats.matiere, etats.charges === 'absente' ? 'ready' : etats.charges);
  const migrationAbsente = [ventesJour.status, charges.status, reglagesLus.status].includes('absente');
  const enEchec = [ventesJour, charges, reglagesLus, caisse, notes, horaires, inventaires].some(l => l?.enEchec)
    || (achats.loadError && docs.length > 0);

  const reloadTout = useCallback(() => Promise.all([
    ventesJour.reload(), charges.reload(), reglagesLus.reload(), caisse.reload(), notes.reload(), horaires.reload(),
    inventaires?.reload?.(), achats.reload(),
  ]), [ventesJour.reload, charges.reload, reglagesLus.reload, caisse.reload, notes.reload, horaires.reload, inventaires, achats.reload]);

  return {
    hebergement,
    ventesJour,
    charges,
    reglages,
    achats,
    docs,
    caisse,
    horaires,
    joursOuverts,
    parJourTout,
    ...calculs,
    etats,
    migrationAbsente,
    enEchec,
    reloadTout,
  };
}
