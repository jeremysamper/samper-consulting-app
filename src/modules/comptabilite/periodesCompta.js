// ─────────────────────────────────────────────────────────────────────────────
// Périodes de la Comptabilité, sans React ni DOM (testé par node --test,
// periodesCompta.test.mjs).
//
// Quatre types : mois, trimestre et année civils, et période d'inventaire
// (du lendemain d'un inventaire validé au suivant inclus, tous périmètres
// confondus ; plus la période ouverte depuis le dernier). Dates en jours ISO
// (AAAA-MM-JJ) de Zurich : le jour du jour vient de l'appelant (zurichToday),
// jamais d'ici. On ne va jamais au-delà de la période en cours.
// ─────────────────────────────────────────────────────────────────────────────

import { dateLongue, intervalleLong } from '../inventaire/facturesLogic.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const pad = (n) => String(n).padStart(2, '0');
const parties = (iso) => ({ a: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), j: Number(iso.slice(8, 10)) });
// Dernier jour du mois m (1 à 12) de l'année a.
export const dernierJourDuMois = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate();

export const TYPES_PERIODE = [
  { id: 'mois', label: 'Mois' },
  { id: 'trimestre', label: 'Trimestre' },
  { id: 'annee', label: 'Année' },
  { id: 'inventaire', label: 'Inventaire' },
];

export function ajouterJours(iso, n) {
  const { a, m, j } = parties(iso);
  return new Date(Date.UTC(a, m - 1, j + n)).toISOString().slice(0, 10);
}

// Nombre de jours de debut à fin, bornes comprises (0 si fin avant debut).
export function nbJours(debut, fin) {
  if (!ISO.test(String(debut || '')) || !ISO.test(String(fin || '')) || fin < debut) return 0;
  return Math.round((Date.parse(`${fin}T12:00:00Z`) - Date.parse(`${debut}T12:00:00Z`)) / 86400000) + 1;
}

// Tous les jours de debut à fin, bornes comprises.
export function listeJours(debut, fin) {
  const n = nbJours(debut, fin);
  return Array.from({ length: n }, (_, i) => ajouterJours(debut, i));
}

export function periodeMois(iso) {
  const { a, m } = parties(iso);
  return { type: 'mois', debut: `${a}-${pad(m)}-01`, fin: `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}` };
}

export function periodeTrimestre(iso) {
  const { a, m } = parties(iso);
  const numero = Math.floor((m - 1) / 3) + 1;
  const mDebut = (numero - 1) * 3 + 1;
  const mFin = mDebut + 2;
  return { type: 'trimestre', numero, debut: `${a}-${pad(mDebut)}-01`, fin: `${a}-${pad(mFin)}-${pad(dernierJourDuMois(a, mFin))}` };
}

export function periodeAnnee(iso) {
  const { a } = parties(iso);
  return { type: 'annee', debut: `${a}-01-01`, fin: `${a}-12-31` };
}

// Périodes d'inventaire, de la plus ancienne à la plus récente. Seuls les
// inventaires validés comptent ; deux périmètres comptés le même jour ne font
// qu'une borne. Une période va du lendemain d'un inventaire au suivant inclus ;
// la dernière, ouverte, part du lendemain du dernier inventaire et finit
// aujourd'hui (absente si le dernier inventaire date d'aujourd'hui).
export function periodesInventaire(inventaires, aujourdhui) {
  const dates = Array.from(new Set((inventaires || [])
    .filter(i => i && i.statut === 'validé' && ISO.test(String(i.date || '')) && i.date <= aujourdhui)
    .map(i => i.date))).sort();
  const periodes = [];
  for (let k = 1; k < dates.length; k += 1) {
    periodes.push({ type: 'inventaire', debut: ajouterJours(dates[k - 1], 1), fin: dates[k], inventaireDebut: dates[k - 1], inventaireFin: dates[k], ouverte: false });
  }
  const dernier = dates[dates.length - 1];
  if (dernier && ajouterJours(dernier, 1) <= aujourdhui) {
    periodes.push({ type: 'inventaire', debut: ajouterJours(dernier, 1), fin: aujourdhui, inventaireDebut: dernier, inventaireFin: null, ouverte: true });
  }
  return periodes;
}

// Période en cours d'un type ; null pour l'inventaire sans inventaire validé.
export function periodeCourante(type, aujourdhui, { periodesInv = [] } = {}) {
  if (type === 'trimestre') return periodeTrimestre(aujourdhui);
  if (type === 'annee') return periodeAnnee(aujourdhui);
  if (type === 'inventaire') return periodesInv[periodesInv.length - 1] || null;
  return periodeMois(aujourdhui);
}

const indexInventaire = (p, periodesInv) => (periodesInv || []).findIndex(x => x.debut === p.debut);

// Période précédente du même type (null avant la première période d'inventaire).
export function periodePrecedente(p, { periodesInv = [] } = {}) {
  if (!p) return null;
  if (p.type === 'inventaire') {
    const i = indexInventaire(p, periodesInv);
    return i > 0 ? periodesInv[i - 1] : null;
  }
  const veille = ajouterJours(p.debut, -1);
  if (p.type === 'trimestre') return periodeTrimestre(veille);
  if (p.type === 'annee') return periodeAnnee(veille);
  return periodeMois(veille);
}

// Période suivante, null au-delà de la période en cours.
export function periodeSuivante(p, aujourdhui, { periodesInv = [] } = {}) {
  if (!p) return null;
  if (p.type === 'inventaire') {
    const i = indexInventaire(p, periodesInv);
    return i >= 0 && i < periodesInv.length - 1 ? periodesInv[i + 1] : null;
  }
  const lendemain = ajouterJours(p.fin, 1);
  if (lendemain > aujourdhui) return null;
  if (p.type === 'trimestre') return periodeTrimestre(lendemain);
  if (p.type === 'annee') return periodeAnnee(lendemain);
  return periodeMois(lendemain);
}

// Dernier jour compté : la fin de la période, ou aujourd'hui si elle court encore.
export function finEffective(p, aujourdhui) {
  if (!p) return aujourdhui;
  return p.fin && p.fin < aujourdhui ? p.fin : aujourdhui;
}

// Vrai pour une période qui court encore aujourd'hui.
export function estEnCours(p, aujourdhui) {
  return !!p && p.debut <= aujourdhui && (!p.fin || p.fin >= aujourdhui);
}

// Jours écoulés et jours de la période, pour « au prorata des jours écoulés, N sur M ».
export function prorata(p, aujourdhui) {
  if (!estEnCours(p, aujourdhui) || (p.type === 'inventaire' && p.ouverte)) return null;
  return { ecoules: nbJours(p.debut, aujourdhui), total: nbJours(p.debut, p.fin) };
}

const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);

// « octobre 2026 », « 4e trimestre 2026 », « 1er trimestre 2027 »,
// « année 2026 », « du 1er au 30 septembre 2026 », « depuis le 30 septembre 2026 ».
export function libellePeriode(p) {
  if (!p) return '';
  const { a, m } = parties(p.debut);
  if (p.type === 'mois') return `${MOIS[m - 1]} ${a}`;
  if (p.type === 'trimestre') return `${ordinal(p.numero || Math.floor((m - 1) / 3) + 1)} trimestre ${a}`;
  if (p.type === 'annee') return `année ${a}`;
  if (p.type === 'inventaire') {
    if (p.ouverte) return `depuis le ${dateLongue(p.inventaireDebut)}`;
    return intervalleLong(p.debut, p.fin);
  }
  return intervalleLong(p.debut, p.fin);
}

// Libellé de comparaison : « septembre 2026 » ; « la période précédente » pour
// un inventaire (« sur du 1er au 31 août » se lirait mal).
export function libelleComparaison(p) {
  if (!p) return '';
  return p.type === 'inventaire' ? 'la période précédente' : libellePeriode(p);
}
