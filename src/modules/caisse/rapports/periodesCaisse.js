// ─────────────────────────────────────────────────────────────────────────────
// Périodes des rapports de la caisse, sans React ni DOM (testé par
// node --test, calculRapports.test.mjs).
//
// Six types : service (midi ou soir d'un jour d'exploitation), jour
// d'exploitation, semaine (du lundi au dimanche), mois, année, et période
// libre (du, au). Les dates sont des jours d'exploitation (AAAA-MM-JJ), ceux
// que la base fige sur chaque ticket : un service du soir qui passe minuit
// reste sur son jour.
//
// Période précédente équivalente : le même service ou le même jour une semaine
// plus tôt (un mardi se compare à un mardi), la semaine, le mois ou l'année
// d'avant, et pour une période libre le même nombre de jours juste avant.
// ─────────────────────────────────────────────────────────────────────────────

import { ajouterJours, dernierJourDuMois, nbJours } from '../../comptabilite/periodesCompta.js';

export const ISO_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const pad = (n) => String(n).padStart(2, '0');
const parties = (iso) => ({ a: Number(iso.slice(0, 4)), m: Number(iso.slice(5, 7)), j: Number(iso.slice(8, 10)) });
const jourSemaine = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay();

export const TYPES_PERIODE_CAISSE = [
  { id: 'service', label: 'Service' },
  { id: 'jour', label: 'Jour' },
  { id: 'semaine', label: 'Semaine' },
  { id: 'mois', label: 'Mois' },
  { id: 'annee', label: 'Année' },
  { id: 'libre', label: 'Période' },
];

export const lundiDe = (iso) => ajouterJours(iso, -((jourSemaine(iso) + 6) % 7));

export function periodeService(jour, service) {
  return { type: 'service', service: service === 'soir' ? 'soir' : 'midi', debut: jour, fin: jour };
}
export const periodeJour = (jour) => ({ type: 'jour', debut: jour, fin: jour });
export function periodeSemaine(jour) {
  const lundi = lundiDe(jour);
  return { type: 'semaine', debut: lundi, fin: ajouterJours(lundi, 6) };
}
export function periodeMois(jour) {
  const { a, m } = parties(jour);
  return { type: 'mois', debut: `${a}-${pad(m)}-01`, fin: `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}` };
}
export function periodeAnnee(jour) {
  const { a } = parties(jour);
  return { type: 'annee', debut: `${a}-01-01`, fin: `${a}-12-31` };
}
// Deux dates dans le désordre sont remises dans l'ordre ; null si l'une manque.
export function periodeLibre(debut, fin) {
  if (!ISO_JOUR.test(String(debut || '')) || !ISO_JOUR.test(String(fin || ''))) return null;
  return debut <= fin ? { type: 'libre', debut, fin } : { type: 'libre', debut: fin, fin: debut };
}

// La période d'un type qui contient un jour ; `service` pour le type service.
export function periodeDe(type, jour, { service = 'midi' } = {}) {
  if (type === 'service') return periodeService(jour, service);
  if (type === 'semaine') return periodeSemaine(jour);
  if (type === 'mois') return periodeMois(jour);
  if (type === 'annee') return periodeAnnee(jour);
  if (type === 'libre') return periodeLibre(jour, jour);
  return periodeJour(jour);
}

// La période précédente équivalente (voir l'en-tête).
export function periodePrecedente(p) {
  if (!p) return null;
  if (p.type === 'service') return periodeService(ajouterJours(p.debut, -7), p.service);
  if (p.type === 'jour') return periodeJour(ajouterJours(p.debut, -7));
  if (p.type === 'semaine') return periodeSemaine(ajouterJours(p.debut, -7));
  if (p.type === 'mois') return periodeMois(ajouterJours(p.debut, -1));
  if (p.type === 'annee') return periodeAnnee(ajouterJours(p.debut, -1));
  const n = nbJours(p.debut, p.fin);
  return { type: 'libre', debut: ajouterJours(p.debut, -n), fin: ajouterJours(p.debut, -1) };
}

// La période voisine pour les flèches : sens -1 (avant) ou 1 (après). Un
// service passe au service d'à côté : midi, soir, midi du lendemain.
export function periodeVoisine(p, sens) {
  if (!p) return null;
  const s = sens < 0 ? -1 : 1;
  if (p.type === 'service') {
    if (s > 0) return p.service === 'midi' ? periodeService(p.debut, 'soir') : periodeService(ajouterJours(p.debut, 1), 'midi');
    return p.service === 'soir' ? periodeService(p.debut, 'midi') : periodeService(ajouterJours(p.debut, -1), 'soir');
  }
  if (p.type === 'jour') return periodeJour(ajouterJours(p.debut, s));
  if (p.type === 'semaine') return periodeSemaine(ajouterJours(p.debut, 7 * s));
  if (p.type === 'mois') return periodeMois(s > 0 ? ajouterJours(p.fin, 1) : ajouterJours(p.debut, -1));
  if (p.type === 'annee') return periodeAnnee(s > 0 ? ajouterJours(p.fin, 1) : ajouterJours(p.debut, -1));
  const n = nbJours(p.debut, p.fin);
  return { type: 'libre', debut: ajouterJours(p.debut, n * s), fin: ajouterJours(p.fin, n * s) };
}

const jourLong = (iso, { annee = true } = {}) => {
  const { a, m, j } = parties(iso);
  return `${JOURS[jourSemaine(iso)]} ${j === 1 ? '1er' : j} ${MOIS[m - 1]}${annee ? ` ${a}` : ''}`;
};
const dateLongue = (iso, { annee = true, mois = true } = {}) => {
  const { a, m, j } = parties(iso);
  return `${j === 1 ? '1er' : j}${mois ? ` ${MOIS[m - 1]}` : ''}${annee ? ` ${a}` : ''}`;
};
// « du 9 au 15 novembre 2026 », « du 28 décembre 2026 au 3 janvier 2027 ».
const intervalle = (debut, fin) => {
  if (debut === fin) return `le ${dateLongue(debut)}`;
  const d = parties(debut);
  const f = parties(fin);
  const memeMois = d.a === f.a && d.m === f.m;
  return `du ${dateLongue(debut, { annee: d.a !== f.a, mois: !memeMois })} au ${dateLongue(fin)}`;
};

// « mardi 10 novembre 2026, midi », « mardi 10 novembre 2026 », « semaine du
// 9 au 15 novembre 2026 », « novembre 2026 », « année 2026 », « du 1er au
// 15 novembre 2026 ».
export function libellePeriodeCaisse(p) {
  if (!p) return '';
  const { a, m } = parties(p.debut);
  if (p.type === 'service') return `${jourLong(p.debut)}, ${p.service === 'soir' ? 'soir' : 'midi'}`;
  if (p.type === 'jour') return jourLong(p.debut);
  if (p.type === 'semaine') return `semaine ${intervalle(p.debut, p.fin)}`;
  if (p.type === 'mois') return `${MOIS[m - 1]} ${a}`;
  if (p.type === 'annee') return `année ${a}`;
  return intervalle(p.debut, p.fin);
}

// Morceau de nom de fichier : « 2026-11-10_midi », « 2026-11-09_2026-11-15 ».
export function clePeriode(p) {
  if (!p) return '';
  if (p.type === 'service') return `${p.debut}_${p.service}`;
  return p.debut === p.fin ? p.debut : `${p.debut}_${p.fin}`;
}

// Découpe une période en tranches d'au plus `max` jours (lecture par
// tranches : la base refuse une fenêtre plus large).
export function tranches(debut, fin, max = 31) {
  const out = [];
  let d = debut;
  for (let garde = 0; garde < 400 && d <= fin; garde += 1) {
    const f = ajouterJours(d, max - 1);
    out.push({ debut: d, fin: f < fin ? f : fin });
    d = ajouterJours(f, 1);
  }
  return out;
}
