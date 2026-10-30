// ─────────────────────────────────────────────────────────────────────────────
// Trésorerie prévisionnelle de la Comptabilité, sans React ni DOM (testé par
// node --test, tresorerie.test.mjs). Règle D18 de la spec : huit semaines,
// du lundi au dimanche, à partir de la semaine en cours.
//
// Sorties : factures d'achat à régler à leur échéance (celles en retard dans
// la semaine en cours), charges fixes à leur jour d'échéance, TVA estimée à
// l'échéance de son décompte, salaires estimés le dernier jour du mois.
// Entrées : chiffre d'affaires TVA comprise moyen par jour des 28 derniers
// jours connus, seulement si 7 jours au moins sont connus ; sinon inconnues
// (n/a), jamais 0. Solde de départ : le solde de fin du dernier relevé
// importé ; sans relevé, les flux seuls. Ce qui est déjà passé cette semaine
// (charges, salaires, TVA d'un jour avant aujourd'hui) est tenu pour payé.
// ─────────────────────────────────────────────────────────────────────────────

import { estFacture } from '../inventaire/facturesLogic.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { echeancesCharge } from './chargesFixes.js';
import { ajouterJours, dernierJourDuMois, nbJours } from './periodesCompta.js';

export const SEMAINES_PREVISION = 8;
export const JOURS_CA = 28;
export const MINIMUM_JOURS_CA = 7;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const pad = (n) => String(n).padStart(2, '0');

// Lundi de la semaine d'un jour ISO.
export function lundiDe(iso) {
  const j = (new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7;
  return ajouterJours(iso, -j);
}

// Chiffre d'affaires TVA comprise moyen par jour calendaire, sur les 28
// derniers jours connus (un jour connu a une saisie, la caisse ou des notes
// de séjour) : leur total divisé par le nombre de jours qu'ils couvrent, du
// premier au dernier, jours fermés compris (un restaurant fermé le lundi n'a
// pas d'entrée ce jour-là). Rien avant 7 jours connus.
//   → { moyenne (null si trop peu), jours, debut, fin }
export function caMoyenParJour(parJour, aujourdhui, { jours = JOURS_CA, minimum = MINIMUM_JOURS_CA } = {}) {
  const connus = (parJour || [])
    .filter(j => (j.source || j.avecNotes) && j.jour <= aujourdhui && nombre(j.ttc) != null)
    .sort((a, b) => a.jour.localeCompare(b.jour))
    .slice(-jours);
  if (connus.length < minimum) return { moyenne: null, jours: connus.length, debut: null, fin: null };
  const debut = connus[0].jour;
  const fin = connus[connus.length - 1].jour;
  const total = connus.reduce((s, j) => s + Number(j.ttc), 0);
  return { moyenne: round2(total / nbJours(debut, fin)), jours: connus.length, debut, fin };
}

// Derniers jours des mois entre deux dates (bornes comprises).
function finsDeMois(de, a) {
  const out = [];
  let annee = Number(de.slice(0, 4));
  let mois = Number(de.slice(5, 7));
  for (let garde = 0; garde < 36; garde += 1) {
    const fin = `${annee}-${pad(mois)}-${pad(dernierJourDuMois(annee, mois))}`;
    if (fin > a) break;
    if (fin >= de) out.push(fin);
    mois += 1;
    if (mois > 12) { mois = 1; annee += 1; }
  }
  return out;
}

//   aujourdhui     : jour ISO de Zurich
//   docs           : pièces d'achat (achats_documents mappés)
//   charges        : charges fixes (null si la table n'est pas lisible)
//   echeancesTva   : [{ date, montant, libelle }] (TVA estimée de chaque décompte)
//   salaireMensuel : coût du personnel estimé d'un mois, ou null
//   caMoyenJour    : chiffre d'affaires TTC moyen par jour, ou null
//   soldeDepart    : solde de fin du dernier relevé, ou null
// → { debut, fin, semaines: [{ debut, fin, entrees, sorties: { factures,
//     charges, tva, salaires, total }, detail, flux, cumul, solde }],
//     sansEcheance: { n, montant }, sansTtc, plusTard }
export function previsionTresorerie({
  aujourdhui, semaines = SEMAINES_PREVISION, docs = [], charges = null, echeancesTva = [],
  salaireMensuel = null, caMoyenJour = null, soldeDepart = null,
}) {
  const lundi = lundiDe(aujourdhui);
  const liste = Array.from({ length: semaines }, (_, k) => {
    const debut = ajouterJours(lundi, 7 * k);
    return {
      debut,
      fin: ajouterJours(debut, 6),
      sorties: { factures: 0, charges: 0, tva: 0, salaires: 0 },
      detail: { factures: [], charges: [], tva: [], salaires: [] },
    };
  });
  const fin = liste[liste.length - 1].fin;
  const semaineDe = (date) => liste.find(s => date >= s.debut && date <= s.fin) || null;

  // ── Factures à régler ──
  let sansTtc = 0;
  let plusTard = 0;
  const sansEcheance = { n: 0, montant: 0 };
  (docs || []).filter(d => estFacture(d) && !d.exclu && !d.regleLe).forEach((f) => {
    const ttc = nombre(f.totalTTC);
    if (!ISO.test(String(f.dateEcheance || ''))) {
      sansEcheance.n += 1;
      if (ttc != null) sansEcheance.montant += ttc;
      return;
    }
    // En retard : à payer cette semaine.
    const s = f.dateEcheance < aujourdhui ? liste[0] : semaineDe(f.dateEcheance);
    if (!s) { plusTard += 1; return; }
    s.detail.factures.push({ facture: f, montant: ttc, enRetard: f.dateEcheance < aujourdhui });
    if (ttc == null) sansTtc += 1;
    else s.sorties.factures += ttc;
  });

  // ── Charges fixes, TVA, salaires : à leur date, à partir d'aujourd'hui ──
  (charges || []).forEach((c) => {
    echeancesCharge(c, aujourdhui, fin).forEach((e) => {
      const s = semaineDe(e.date);
      if (!s) return;
      s.sorties.charges += e.montant;
      s.detail.charges.push({ charge: c, date: e.date, montant: e.montant });
    });
  });
  (echeancesTva || []).forEach((t) => {
    const montant = nombre(t.montant);
    if (montant == null || montant <= 0 || !ISO.test(String(t.date || '')) || t.date < aujourdhui) return;
    const s = semaineDe(t.date);
    if (!s) return;
    s.sorties.tva += montant;
    s.detail.tva.push({ date: t.date, montant, libelle: t.libelle || '' });
  });
  const salaire = nombre(salaireMensuel);
  if (salaire != null && salaire > 0) {
    finsDeMois(aujourdhui, fin).forEach((date) => {
      const s = semaineDe(date);
      if (!s) return;
      s.sorties.salaires += salaire;
      s.detail.salaires.push({ date, montant: salaire });
    });
  }

  // ── Entrées et solde ──
  const moyenne = nombre(caMoyenJour);
  const depart = nombre(soldeDepart);
  let cumul = 0;
  const resultat = liste.map((s, k) => {
    const sorties = {
      factures: round2(s.sorties.factures),
      charges: round2(s.sorties.charges),
      tva: round2(s.sorties.tva),
      salaires: round2(s.sorties.salaires),
    };
    sorties.total = round2(sorties.factures + sorties.charges + sorties.tva + sorties.salaires);
    // La semaine en cours : les jours qui restent, aujourd'hui compris.
    const joursRestants = k === 0 ? nbJours(aujourdhui, s.fin) : 7;
    const entrees = moyenne == null ? null : round2(moyenne * joursRestants);
    const flux = round2((entrees || 0) - sorties.total);
    cumul = round2(cumul + flux);
    const solde = depart == null || moyenne == null ? null : round2(depart + cumul);
    return { debut: s.debut, fin: s.fin, entrees, sorties, detail: s.detail, flux, cumul, solde };
  });

  return {
    debut: lundi,
    fin,
    semaines: resultat,
    sansEcheance: { n: sansEcheance.n, montant: round2(sansEcheance.montant) },
    sansTtc,
    plusTard,
  };
}
