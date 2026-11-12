// ─────────────────────────────────────────────────────────────────────────────
// Découpage d'une période en tranches et lecture d'une série selon sa nature,
// sans React ni DOM (testé par node --test, agregation.test.mjs).
//
// Le module Statistiques n'écrit aucune bibliothèque de périodes : les jours
// et les mois viennent de periodesCompta.js, le lundi d'une semaine ISO de
// periodesCaisse.js (bâtie sur la première), la période de comparaison de
// periodesRapport.js. Ici, seulement le découpage en pas.
//
// Tout est calcul de calendrier sur des jours ISO (AAAA-MM-JJ) de Zurich :
// aucun passage par une heure locale, un changement d'heure ne décale rien.
//
// Natures (D9) :
//   flux  : s'additionne ; le total d'une période est rendu par la fonction
//           d'origine sur la période entière, jamais par la somme des points ;
//   taux  : se recalcule sur la tranche par la fonction d'origine (numérateur
//           et dénominateur sommés), ne se moyenne jamais ;
//   stock : relevé à une date, ne s'additionne pas ; la période vaut son
//           dernier relevé.
// Une valeur absente vaut null (« n/a »), jamais 0.
// ─────────────────────────────────────────────────────────────────────────────

import { ajouterJours, dernierJourDuMois, listeJours, nbJours } from '../comptabilite/periodesCompta.js';
import { lundiDe } from '../caisse/rapports/periodesCaisse.js';

export const PAS = [
  { id: 'jour', label: 'Jour' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
];
export const NATURES = ['flux', 'taux', 'stock'];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const plusTard = (a, b) => (a > b ? a : b);
const plusTot = (a, b) => (a < b ? a : b);

// Les tranches d'une période pour un pas, dans l'ordre, sans recouvrement.
//   cle     : le jour, le lundi de la semaine ISO, ou AAAA-MM
//   complet : faux pour une semaine ou un mois coupé par un bord de la période
export function tranchesDe(debut, fin, pas = 'jour') {
  if (!ISO.test(String(debut || '')) || !ISO.test(String(fin || '')) || fin < debut) return [];
  if (pas === 'semaine') {
    const out = [];
    for (let l = lundiDe(debut), garde = 0; l <= fin && garde < 600; l = ajouterJours(l, 7), garde += 1) {
      const dimanche = ajouterJours(l, 6);
      out.push({ cle: l, pas, debut: plusTard(l, debut), fin: plusTot(dimanche, fin), complet: l >= debut && dimanche <= fin });
    }
    return out;
  }
  if (pas === 'mois') {
    const out = [];
    let a = Number(debut.slice(0, 4));
    let m = Number(debut.slice(5, 7));
    for (let garde = 0; garde < 240; garde += 1) {
      const premier = `${a}-${pad(m)}-01`;
      if (premier > fin) break;
      const dernier = `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}`;
      out.push({ cle: `${a}-${pad(m)}`, pas, debut: plusTard(premier, debut), fin: plusTot(dernier, fin), complet: premier >= debut && dernier <= fin });
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
    return out;
  }
  return listeJours(debut, fin).map((j) => ({ cle: j, pas: 'jour', debut: j, fin: j, complet: true }));
}

// La période entière comme une seule tranche : le total d'un flux et la valeur
// d'un taux se lisent sur elle, par la fonction d'origine.
export const trancheEntiere = (debut, fin) => ({ cle: `${debut}_${fin}`, pas: 'periode', debut, fin, complet: true });

// Numéro de semaine ISO 8601 (la semaine 1 contient le premier jeudi) et son
// année, qui n'est pas toujours celle du lundi.
export function semaineIso(iso) {
  const d = new Date(`${iso}T12:00:00Z`);
  const jour = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - jour + 3);
  const annee = d.getUTCFullYear();
  const premierJeudi = new Date(Date.UTC(annee, 0, 4, 12));
  const semaine = 1 + Math.round(((d - premierJeudi) / 86400000 - 3 + ((premierJeudi.getUTCDay() + 6) % 7)) / 7);
  return { annee, semaine };
}

const dateCh = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

// Libellés chiffrés, les mêmes dans les trois langues : « 11.11.2026 »,
// « S46 2026 », « 11.2026 ». `court` pour l'axe : « 11.11 », « S46 », « 11.26 ».
export function libelleTranche(t, { court = false } = {}) {
  if (!t) return '';
  if (t.pas === 'semaine') {
    const { annee, semaine } = semaineIso(t.cle);
    return court ? `S${pad(semaine)}` : `S${pad(semaine)} ${annee}`;
  }
  if (t.pas === 'mois') return court ? `${t.cle.slice(5, 7)}.${t.cle.slice(2, 4)}` : `${t.cle.slice(5, 7)}.${t.cle.slice(0, 4)}`;
  if (t.pas === 'periode') return t.debut === t.fin ? dateCh(t.debut) : `${dateCh(t.debut)} → ${dateCh(t.fin)}`;
  return court ? `${t.debut.slice(8, 10)}.${t.debut.slice(5, 7)}` : dateCh(t.debut);
}

// Bornes exactes d'une tranche, pour le détail : « 09.11.2026 → 15.11.2026 ».
export function bornesTranche(t) {
  if (!t) return '';
  return t.debut === t.fin ? dateCh(t.debut) : `${dateCh(t.debut)} → ${dateCh(t.fin)}`;
}

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

// Somme d'un flux au centime : null si aucun point n'a de valeur.
export function sommeFlux(valeurs) {
  const connues = (valeurs || []).filter(estNombre);
  if (!connues.length) return null;
  return connues.reduce((s, v) => s + Math.round(v * 100), 0) / 100;
}

// Dernier relevé d'un stock : null si aucun point n'a de valeur.
export function dernierReleve(valeurs) {
  const connues = (valeurs || []).filter(estNombre);
  return connues.length ? connues[connues.length - 1] : null;
}

// Valeur de la période entière selon la nature.
//   surPeriode : la valeur rendue par la fonction d'origine sur la période
//   entière (flux et taux) ; valeurs : les points (stock).
export function valeurPeriode(nature, { surPeriode = null, valeurs = [] } = {}) {
  if (nature === 'stock') return dernierReleve(valeurs);
  return estNombre(surPeriode) ? surPeriode : null;
}

// Écart d'arrondi d'un flux : somme des points moins total de la période, en
// unités, null quand l'un des deux manque. Vaut 0 pour un flux qui s'additionne
// au centime (D4) ; non nul quand la fonction d'origine arrondit sur le total
// (hors TVA de la Comptabilité, arrondi par taux).
export function ecartArrondi(valeurs, total) {
  const somme = sommeFlux(valeurs);
  if (somme == null || !estNombre(total)) return null;
  return Math.round((somme - total) * 100) / 100;
}

// Écart avec la comparaison, en valeur et en pourcentage. « n/a » (null) quand
// l'une des deux valeurs manque ; le pourcentage manque aussi quand la valeur
// d'avant est nulle. Pour un taux (pct), l'écart se lit en points.
export function ecartDe(actuel, avant) {
  if (!estNombre(actuel) || !estNombre(avant)) return { valeur: null, pct: null };
  const valeur = Math.round((actuel - avant) * 10000) / 10000;
  return { valeur, pct: avant === 0 ? null : (actuel - avant) / Math.abs(avant) };
}

// Pas proposés pour une période : pas de courbe à plus de 400 points.
export function pasPossibles(debut, fin) {
  const n = nbJours(debut, fin);
  return PAS.filter((p) => p.id !== 'jour' || n <= 400).map((p) => p.id);
}
