// ═══════════════════════════════════════════════════════════════════════════
// Périodes du rapport des réservations : bornes de la période choisie, de sa
// période de comparaison et de la fenêtre à lire en base.
//
// Tout est calcul de calendrier sur des dates YYYY-MM-DD (date_service est une
// date sans fuseau) ; seul « aujourd'hui » vient de l'heure de Zurich, fourni
// par l'appelant. Semaine ISO du lundi au dimanche, mois civil.
// ═══════════════════════════════════════════════════════════════════════════

import { zurichAjouterJours, zurichLundi } from '../../../utils/zurichTime.js';

export const PERIODES = [
  { id: 'semaine', label: 'Cette semaine' },
  { id: 'semaine_prec', label: 'Semaine dernière' },
  { id: 'mois', label: 'Ce mois' },
  { id: 'mois_prec', label: 'Mois dernier' },
  { id: 'trois_mois', label: '3 derniers mois' },
  { id: 'annee', label: 'Cette année' },
  { id: 'perso', label: 'Dates choisies' },
];

export const COMPARAISONS = [
  { id: 'precedente', label: 'Période précédente' },
  { id: 'n1', label: 'Même période N-1' },
];

const DATE_OK = /^\d{4}-\d{2}-\d{2}$/;

const parts = (d) => d.split('-').map(Number);
const versDate = (y, m, j) => new Date(Date.UTC(y, m - 1, j)).toISOString().slice(0, 10);
const joursDuMois = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const debutMois = (d) => `${d.slice(0, 8)}01`;

export function finMois(d) {
  const [y, m] = parts(d);
  return versDate(y, m, joursDuMois(y, m));
}

// Même jour n mois plus tard (ou plus tôt), ramené au dernier jour du mois
// d'arrivée si besoin : 31.03 moins un mois donne 28.02 ou 29.02.
export function ajouterMois(d, n) {
  const [y, m, j] = parts(d);
  const total = y * 12 + (m - 1) + n;
  const y2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return versDate(y2, m2, Math.min(j, joursDuMois(y2, m2)));
}

// Nombre de jours de debut à fin, bornes comprises.
export function nbJours(debut, fin) {
  const [y1, m1, j1] = parts(debut);
  const [y2, m2, j2] = parts(fin);
  return Math.round((Date.UTC(y2, m2 - 1, j2) - Date.UTC(y1, m1 - 1, j1)) / 86400000) + 1;
}

// Jour de la semaine ISO : 1 = lundi … 7 = dimanche (comme les clés des
// horaires de la réservation en ligne).
export function jourIso(d) {
  const [y, m, j] = parts(d);
  const n = new Date(Date.UTC(y, m - 1, j)).getUTCDay();
  return n === 0 ? 7 : n;
}

export function listeJours(debut, fin) {
  const jours = [];
  for (let d = debut; d <= fin; d = zurichAjouterJours(d, 1)) jours.push(d);
  return jours;
}

// Période en mois civils entiers (du 1er au dernier jour) : nombre de mois,
// sinon 0.
function moisEntiers(debut, fin) {
  if (debut !== debutMois(debut) || fin !== finMois(fin)) return 0;
  const [y1, m1] = parts(debut);
  const [y2, m2] = parts(fin);
  return (y2 * 12 + m2) - (y1 * 12 + m1) + 1;
}

export function bornesPeriode(id, aujourdhui, perso = {}) {
  const lundi = zurichLundi(aujourdhui);
  switch (id) {
    case 'semaine':
      return { debut: lundi, fin: zurichAjouterJours(lundi, 6) };
    case 'semaine_prec':
      return { debut: zurichAjouterJours(lundi, -7), fin: zurichAjouterJours(lundi, -1) };
    case 'mois_prec': {
      const d = ajouterMois(debutMois(aujourdhui), -1);
      return { debut: d, fin: finMois(d) };
    }
    case 'trois_mois':
      return { debut: ajouterMois(debutMois(aujourdhui), -2), fin: finMois(aujourdhui) };
    case 'annee':
      return { debut: `${aujourdhui.slice(0, 4)}-01-01`, fin: `${aujourdhui.slice(0, 4)}-12-31` };
    case 'perso': {
      const a = DATE_OK.test(perso.debut || '') ? perso.debut : debutMois(aujourdhui);
      const b = DATE_OK.test(perso.fin || '') ? perso.fin : aujourdhui;
      return a <= b ? { debut: a, fin: b } : { debut: b, fin: a };
    }
    case 'mois':
    default:
      return { debut: debutMois(aujourdhui), fin: finMois(aujourdhui) };
  }
}

// Décalage de la comparaison. Période précédente : le même nombre de mois
// civils juste avant (mois, trimestre, année), sinon le même nombre de jours
// (une semaine recule d'une semaine). N-1 : un an plus tôt, sauf une période
// faite de semaines entières, qui recule de 52 semaines pour garder le lundi.
function decalage(periode, mode) {
  const mois = moisEntiers(periode.debut, periode.fin);
  const jours = nbJours(periode.debut, periode.fin);
  if (mode === 'n1') {
    if (!mois && jourIso(periode.debut) === 1 && jours % 7 === 0) return { jours: -364 };
    return { mois: -12 };
  }
  return mois ? { mois: -mois } : { jours: -jours };
}

function decaler(d, dec) {
  return dec.jours ? zurichAjouterJours(d, dec.jours) : ajouterMois(d, dec.mois);
}

export function bornesComparaison(periode, mode) {
  const dec = decalage(periode, mode);
  const debut = decaler(periode.debut, dec);
  // Mois entiers : la fin reste un dernier jour de mois (février compris).
  const fin = dec.mois && moisEntiers(periode.debut, periode.fin)
    ? finMois(decaler(debutMois(periode.fin), dec))
    : decaler(periode.fin, dec);
  return { debut, fin };
}

// « Aujourd'hui » transposé dans la période de comparaison : sert au carnet à
// venir (ce qui était déjà réservé à cette date-là).
export function dateComparable(aujourdhui, periode, mode) {
  return decaler(aujourdhui, decalage(periode, mode));
}

// Fenêtre unique à lire en base : la période, sa comparaison et les deux
// carnets à venir (30 jours depuis aujourd'hui et depuis la date comparable).
export function fenetreLecture(periode, comparaison, aujourdhui, reference) {
  const bornes = [
    periode.debut, periode.fin, comparaison.debut, comparaison.fin,
    aujourdhui, zurichAjouterJours(aujourdhui, 29), reference, zurichAjouterJours(reference, 29),
  ].sort();
  return { debut: bornes[0], fin: bornes[bornes.length - 1] };
}

// JJ.MM.AAAA
export function dateCh(d) {
  if (!DATE_OK.test(d || '')) return '';
  const [y, m, j] = d.split('-');
  return `${j}.${m}.${y}`;
}
