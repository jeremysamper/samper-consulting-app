// ─────────────────────────────────────────────────────────────────────────────
// Analyses des factures d'achat, sans React (achats_documents).
//
// Règles communes (relevé L3a du 27.10.2026) :
//   - une dépense est une facture (type_document 'facture', ou réglée) que
//     personne n'a exclue à la main ; les bons de livraison et de commande
//     doubleraient la facture qui suit, ils ne sont pas additionnés ;
//   - montant d'une facture : total_ht, à défaut total_ttc, à défaut la somme
//     des lignes lues (lignes[].montantLigne) ; sans aucun des trois, elle
//     n'entre dans aucune somme et elle est comptée à part, à côté du total ;
//   - une période sans facture vaut null (affichée « n/a »), jamais 0 ;
//   - 12 mois glissants : le mois en cours (jour de Zurich) et les 11 d'avant.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from '../../services/recipeProductMatching.js';
import { estFacture, statutPaiement } from '../inventaire/facturesLogic.js';
import { nomDepuisLibelle } from '../inventaire/achatsLogic.js';
import { AUTRES, classerProduit, contexteClassement } from '../commande/classerProduit.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const NON_CLASSE = 'Non classé';
export const SANS_FOURNISSEUR = 'Fournisseur non lu';
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const MOIS_LONGS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const arrondi = (v) => Math.round(v * 100) / 100;
const perimetreDe = (d) => (d.perimetre || '').trim() || 'Général';

// Montant retenu d'une facture et sa source : 'ht' | 'ttc' | 'lignes' | null.
export function montantFacture(d) {
  const ht = nombre(d.totalHT);
  if (ht != null) return { montant: ht, source: 'ht' };
  const ttc = nombre(d.totalTTC);
  if (ttc != null) return { montant: ttc, source: 'ttc' };
  const lignes = (d.lignes || []).map(l => nombre(l.montantLigne)).filter(v => v != null);
  if (lignes.length) return { montant: arrondi(lignes.reduce((s, v) => s + v, 0)), source: 'lignes' };
  return { montant: null, source: null };
}

// Documents d'un périmètre ('' = tous) : factures retenues et ce qui est mis
// de côté (bons, factures exclues à la main), compté pour être dit.
export function trierDocuments(docs, perimetre = '') {
  const factures = [];
  let bons = 0;
  let exclues = 0;
  (docs || []).forEach((d) => {
    if (perimetre && perimetreDe(d) !== perimetre) return;
    if (!estFacture(d)) { bons += 1; return; }
    if (d.exclu) { exclues += 1; return; }
    factures.push(d);
  });
  return { factures, bons, exclues };
}

// ── Mois ──
export const cleMois = (iso) => String(iso || '').slice(0, 7);
const moisPlus = (cle, n) => {
  const [a, m] = cle.split('-').map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};
export const libelleMois = (cle, { long = false, annee = false } = {}) => {
  const [a, m] = cle.split('-').map(Number);
  const nom = (long ? MOIS_LONGS : MOIS_COURTS)[m - 1];
  return annee ? `${nom} ${a}` : nom;
};

// Les 12 clés de mois qui finissent au mois de `aujourdhui` (ISO, Zurich).
export function douzeMois(aujourdhui) {
  const fin = cleMois(aujourdhui);
  return Array.from({ length: 12 }, (_, i) => moisPlus(fin, i - 11));
}

// Totaux d'une liste de factures : montant, nombre avec montant, sans montant.
function totaux(factures) {
  let montant = 0, n = 0, sansMontant = 0;
  factures.forEach((f) => {
    const m = montantFacture(f).montant;
    if (m == null) sansMontant += 1;
    else { montant += m; n += 1; }
  });
  return { montant: n ? arrondi(montant) : null, n, sansMontant, total: factures.length };
}

// Dépenses par mois sur 12 mois, et les mêmes mois un an plus tôt.
// Un mois sans facture, ou dont aucune facture n'a de montant : valeur null.
export function depensesParMois(factures, aujourdhui) {
  const mois = douzeMois(aujourdhui);
  const parMois = new Map();
  let sansDate = 0;
  factures.forEach((f) => {
    if (!ISO.test(String(f.dateDocument || ''))) { sansDate += 1; return; }
    const k = cleMois(f.dateDocument);
    if (!parMois.has(k)) parMois.set(k, []);
    parMois.get(k).push(f);
  });
  const ligne = (cle) => {
    const t = totaux(parMois.get(cle) || []);
    return { cle, ...t, valeur: t.montant };
  };
  const points = mois.map(ligne);
  const precedents = mois.map(k => ligne(moisPlus(k, -12)));
  const somme = (liste) => {
    const avec = liste.filter(p => p.valeur != null);
    return {
      montant: avec.length ? arrondi(avec.reduce((s, p) => s + p.valeur, 0)) : null,
      n: liste.reduce((s, p) => s + p.n, 0),
      sansMontant: liste.reduce((s, p) => s + p.sansMontant, 0),
      moisAvecDonnees: avec.length,
    };
  };
  return { mois, points, precedents, total: somme(points), totalPrecedent: somme(precedents), sansDate };
}

// Factures des 12 mois (date de facture dans la fenêtre).
export function facturesDesDouzeMois(factures, aujourdhui) {
  const mois = new Set(douzeMois(aujourdhui));
  return factures.filter(f => ISO.test(String(f.dateDocument || '')) && mois.has(cleMois(f.dateDocument)));
}

// Par fournisseur, regroupé par normalizeName (accents et casse ; une faute
// de frappe reste un fournisseur à part). Libellé : la graphie la plus
// fréquente. Trié par montant décroissant.
export function parFournisseur(factures) {
  const groupes = new Map();
  factures.forEach((f) => {
    const brut = String(f.fournisseurNom || '').trim();
    const cle = normalizeName(brut) || '__sans__';
    if (!groupes.has(cle)) groupes.set(cle, { cle, graphies: new Map(), factures: [] });
    const g = groupes.get(cle);
    g.factures.push(f);
    if (brut) g.graphies.set(brut, (g.graphies.get(brut) || 0) + 1);
  });
  return [...groupes.values()].map((g) => {
    const graphies = [...g.graphies.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { cle: g.cle, label: graphies[0]?.[0] || SANS_FOURNISSEUR, graphies: graphies.map(x => x[0]), ...totaux(g.factures) };
  }).sort((a, b) => (b.montant || 0) - (a.montant || 0) || a.label.localeCompare(b.label));
}

// Par rayon : chaque ligne lue (montantLigne) rangée par le classeur de la
// commande (catalogue de l'établissement, puis mots-clés) sur son libellé
// nettoyé ; « Autres » y signifie « rien reconnu » : affiché « Non classé ».
// Les factures sans aucune ligne chiffrée ne sont pas réparties.
export function parRayon(factures, catalogue = []) {
  const ctx = contexteClassement({ catalogue });
  const rayons = new Map();
  let reparti = 0, nonRepartis = 0, montantNonReparti = null;
  factures.forEach((f) => {
    const lignes = (f.lignes || []).filter(l => nombre(l.montantLigne) != null);
    if (!lignes.length) {
      nonRepartis += 1;
      const m = montantFacture(f).montant;
      if (m != null) montantNonReparti = (montantNonReparti || 0) + m;
      return;
    }
    lignes.forEach((l) => {
      const r = classerProduit(nomDepuisLibelle(l.libelle, l.conditionnement), ctx);
      const nom = r === AUTRES ? NON_CLASSE : r;
      const m = nombre(l.montantLigne);
      if (!rayons.has(nom)) rayons.set(nom, { cle: nom, label: nom, montant: 0, lignes: 0 });
      const x = rayons.get(nom);
      x.montant += m;
      x.lignes += 1;
      reparti += m;
    });
  });
  // Du plus gros poste au plus petit, la part non classée en dernier.
  const liste = [...rayons.values()].map(x => ({ ...x, montant: arrondi(x.montant), nonClasse: x.cle === NON_CLASSE }))
    .sort((a, b) => (a.nonClasse - b.nonClasse) || b.montant - a.montant || a.cle.localeCompare(b.cle));
  return { rayons: liste, reparti: arrondi(reparti), nonRepartis, montantNonReparti: montantNonReparti == null ? null : arrondi(montantNonReparti) };
}

// Prix unitaire d'une ligne lue : montant / quantité totale, ramenée au kg,
// au litre ou à la pièce ; sinon par colis. null si rien ne se divise.
export function prixLigne(l) {
  const m = nombre(l.montantLigne);
  if (m == null || m <= 0) return null;
  const total = nombre(l.quantiteTotale);
  if (total && total > 0) {
    if (l.uniteTotale === 'g') return { prix: m / (total / 1000), unite: 'kg' };
    if (l.uniteTotale === 'ml') return { prix: m / (total / 1000), unite: 'L' };
    if (l.uniteTotale === 'pcs') return { prix: m / total, unite: 'pièce' };
  }
  const colis = nombre(l.quantite);
  if (colis && colis > 0) return { prix: m / colis, unite: 'colis' };
  return null;
}

// Produits achetés et leurs prix datés : le produit rattaché à la main
// (produitNom), sinon le libellé nettoyé ; une unité par série. Trié : les
// produits à plusieurs dates d'abord.
export function prixParProduit(factures) {
  const series = new Map();
  factures.forEach((f) => {
    if (!ISO.test(String(f.dateDocument || ''))) return;
    (f.lignes || []).forEach((l) => {
      if ((l.issues || []).includes('ligne non produit') || l.lien === 'ignore') return;
      const p = prixLigne(l);
      if (!p) return;
      const nom = (l.lien === 'manuel' && l.produitNom) ? l.produitNom : nomDepuisLibelle(l.libelle, l.conditionnement);
      const cle = `${normalizeName(nom)}|${p.unite}`;
      if (!normalizeName(nom)) return;
      if (!series.has(cle)) series.set(cle, { cle, nom, unite: p.unite, points: [] });
      series.get(cle).points.push({ date: f.dateDocument, prix: Math.round(p.prix * 10000) / 10000, fournisseur: f.fournisseurNom || '' });
    });
  });
  return [...series.values()].map((s) => {
    const points = s.points.sort((a, b) => a.date.localeCompare(b.date));
    return { ...s, points, dates: new Set(points.map(x => x.date)).size };
  }).sort((a, b) => b.dates - a.dates || a.nom.localeCompare(b.nom));
}

// Échéancier des factures non réglées, en TTC (le montant à payer, comme
// « Je règle les factures ») ; une facture sans TTC est comptée à part.
export const TRANCHES = [
  { id: 'retard', label: 'En retard' },
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'prochaine', label: 'Semaine prochaine' },
  { id: 'mois', label: 'Dans 2 à 4 semaines' },
  { id: 'plus_tard', label: 'Plus tard' },
  { id: 'sans', label: 'Sans échéance' },
];
const jours = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
export function trancheEcheance(f, aujourdhui) {
  if (!ISO.test(String(f.dateEcheance || ''))) return 'sans';
  if (statutPaiement(f, aujourdhui) === 'en_retard') return 'retard';
  // Semaine du lundi au dimanche (jour de Zurich).
  const j = (new Date(`${aujourdhui}T12:00:00Z`).getUTCDay() + 6) % 7;
  const reste = 6 - j;
  const d = jours(aujourdhui, f.dateEcheance);
  if (d <= reste) return 'semaine';
  if (d <= reste + 7) return 'prochaine';
  if (d <= reste + 28) return 'mois';
  return 'plus_tard';
}
export function echeancier(docs, aujourdhui) {
  const aRegler = (docs || []).filter(d => estFacture(d) && !d.regleLe);
  const parTranche = new Map(TRANCHES.map(t => [t.id, { ...t, montant: 0, n: 0, sansTTC: 0, factures: [] }]));
  aRegler.forEach((f) => {
    const t = parTranche.get(trancheEcheance(f, aujourdhui));
    t.factures.push(f);
    const m = nombre(f.totalTTC);
    if (m == null) t.sansTTC += 1;
    else { t.montant += m; t.n += 1; }
  });
  const tranches = [...parTranche.values()].map(t => ({ ...t, montant: t.n ? arrondi(t.montant) : null }));
  return { tranches, aRegler: aRegler.length };
}

// Date de facture antérieure de plus d'un an à son enregistrement : année
// probablement mal lue (4 factures datées 2023 au Rucher, enregistrées en
// octobre 2026). Signalé, jamais corrigé d'office.
export function datesAVerifier(docs) {
  return (docs || []).filter((d) => {
    if (!ISO.test(String(d.dateDocument || '')) || !d.createdAt) return false;
    const enregistre = String(d.createdAt).slice(0, 10);
    return ISO.test(enregistre) && jours(d.dateDocument, enregistre) > 365;
  }).sort((a, b) => String(a.dateDocument).localeCompare(String(b.dateDocument)));
}
