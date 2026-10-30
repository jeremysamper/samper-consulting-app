// ─────────────────────────────────────────────────────────────────────────────
// Charges fixes de la Comptabilité, sans React ni DOM (testé par node --test,
// chargesFixes.test.mjs).
//
// Une charge se saisit une fois : montant TVA comprise à chaque échéance,
// périodicité, taux de TVA, début et fin facultative (règle D12). Son coût
// d'un mois civil entier est son montant annuel divisé par 12 (un loyer
// mensuel de 6 500 vaut 6 500.00 en octobre, une assurance annuelle de
// 4 200 vaut 350.00 par mois) ; un mois entamé ou partiel compte au prorata de
// ses jours. Le compte de résultat la lit hors TVA.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from '../../services/recipeProductMatching.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { dernierJourDuMois, nbJours } from './periodesCompta.js';

export const CATEGORIES_CHARGES = [
  { id: 'loyer', label: 'Loyer' },
  { id: 'energie', label: 'Énergie' },
  { id: 'assurances', label: 'Assurances' },
  { id: 'leasing', label: 'Leasing' },
  { id: 'honoraires', label: 'Honoraires' },
  { id: 'abonnements', label: 'Abonnements' },
  { id: 'autre', label: 'Autre' },
];
export const libelleCategorie = (id) => CATEGORIES_CHARGES.find(c => c.id === id)?.label || 'Autre';

export const PERIODICITES = [
  { id: 'mensuelle', label: 'Mensuelle', mois: 1, par: 'par mois' },
  { id: 'trimestrielle', label: 'Trimestrielle', mois: 3, par: 'par trimestre' },
  { id: 'semestrielle', label: 'Semestrielle', mois: 6, par: 'par semestre' },
  { id: 'annuelle', label: 'Annuelle', mois: 12, par: 'par an' },
];
export const FACTEUR_ANNUEL = { mensuelle: 12, trimestrielle: 4, semestrielle: 2, annuelle: 1 };
const MOIS_PAR_ECHEANCE = { mensuelle: 1, trimestrielle: 3, semestrielle: 6, annuelle: 12 };
export const parPeriodicite = (id) => PERIODICITES.find(p => p.id === id)?.par || 'par mois';

// TVA proposée par catégorie : loyer et assurances sans TVA, le reste au taux normal.
export const TVA_PAR_CATEGORIE = { loyer: 0, energie: 8.1, assurances: 0, leasing: 8.1, honoraires: 8.1, abonnements: 8.1, autre: 8.1 };
export const TAUX_CHARGES = [0, 2.6, 3.8, 8.1];

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const pad = (n) => String(n).padStart(2, '0');
const tauxDe = (c) => nombre(c.tvaTaux) ?? 0;

// Coût TTC d'un mois civil entier.
export const coutMensuel = (c) => (nombre(c.montant) || 0) * (FACTEUR_ANNUEL[c.periodicite] || 12) / 12;

// Charge active un jour donné.
export const chargeActive = (c, jour) => !!c && c.debut <= jour && (!c.fin || c.fin >= jour);

const ventiler = (ttcBrut, taux) => {
  const ttc = round2(ttcBrut);
  const ht = round2(ttc / (1 + taux / 100));
  return { ttc, ht, tva: round2(ttc - ht) };
};

// Coût d'une charge sur une période, au prorata des jours de chaque mois.
export function coutSurPeriode(c, debut, fin) {
  const d0 = c.debut > debut ? c.debut : debut;
  const d1 = c.fin && c.fin < fin ? c.fin : fin;
  if (!d0 || !d1 || d0 > d1) return { ttc: 0, ht: 0, tva: 0 };
  const mensuel = coutMensuel(c);
  let total = 0;
  let a = Number(d0.slice(0, 4));
  let m = Number(d0.slice(5, 7));
  for (;;) {
    const premier = `${a}-${pad(m)}-01`;
    if (premier > d1) break;
    const nb = dernierJourDuMois(a, m);
    const dernier = `${a}-${pad(m)}-${pad(nb)}`;
    const de = d0 > premier ? d0 : premier;
    const jusqua = d1 < dernier ? d1 : dernier;
    total += mensuel * nbJours(de, jusqua) / nb;
    m += 1;
    if (m > 12) { m = 1; a += 1; }
  }
  return ventiler(total, tauxDe(c));
}

// Échéances d'une charge entre deux dates (bornes comprises) : le jour
// d'échéance, borné à la fin du mois (le 31 tombe le 28 en février) ; sans
// jour, celui du début. Une échéance tous les 1, 3, 6 ou 12 mois depuis le
// mois du début.
export function echeancesCharge(c, de, a) {
  const pas = MOIS_PAR_ECHEANCE[c.periodicite] || 1;
  const jour = nombre(c.jourEcheance) || Number(String(c.debut).slice(8, 10)) || 1;
  const montant = nombre(c.montant) || 0;
  const out = [];
  let annee = Number(String(c.debut).slice(0, 4));
  let mois = Number(String(c.debut).slice(5, 7));
  for (let garde = 0; garde < 2400; garde += 1) {
    if (`${annee}-${pad(mois)}-01` > a) break;
    const date = `${annee}-${pad(mois)}-${pad(Math.min(jour, dernierJourDuMois(annee, mois)))}`;
    if (date >= de && date <= a && chargeActive(c, date)) out.push({ date, montant });
    mois += pas;
    while (mois > 12) { mois -= 12; annee += 1; }
  }
  return out;
}

// Toutes les charges sur une période : totaux, détail par charge et par taux.
// Sans aucune charge saisie, les totaux valent null (affichés « n/a ») : rien
// ne dit qu'il n'y en a pas.
export function chargesSurPeriode(charges, debut, fin) {
  const liste = charges || [];
  const lignes = liste.map(c => ({ charge: c, ...coutSurPeriode(c, debut, fin) })).filter(l => l.ttc !== 0);
  const parTaux = new Map();
  lignes.forEach((l) => {
    const t = tauxDe(l.charge);
    const x = parTaux.get(t) || { taux: t, ttc: 0, ht: 0, tva: 0 };
    x.ttc += l.ttc; x.ht += l.ht; x.tva += l.tva;
    parTaux.set(t, x);
  });
  const somme = (k) => round2(lignes.reduce((s, l) => s + l[k], 0));
  const saisies = liste.length > 0;
  return {
    ttc: saisies ? somme('ttc') : null,
    ht: saisies ? somme('ht') : null,
    tva: saisies ? somme('tva') : null,
    lignes,
    parTaux: [...parTaux.values()].map(x => ({ taux: x.taux, ttc: round2(x.ttc), ht: round2(x.ht), tva: round2(x.tva) })).sort((a, b) => b.taux - a.taux),
    saisies,
  };
}

// Coût mensuel moyen TTC des charges actives un jour donné.
export function moyenneMensuelle(charges, jour) {
  const actives = (charges || []).filter(c => chargeActive(c, jour));
  return { n: actives.length, ttc: round2(actives.reduce((s, c) => s + coutMensuel(c), 0)) };
}

const lettres = (s) => s.replace(/[^a-z]/g, '').length;
// Même fournisseur : noms normalisés égaux, ou l'un contenu dans l'autre mot
// pour mot (« Romande Energie SA » et « Romande Énergie ») ; 4 lettres au moins.
export function memeFournisseur(a, b) {
  const x = normalizeName(a);
  const y = normalizeName(b);
  if (!x || !y || lettres(x) < 4 || lettres(y) < 4) return false;
  if (x === y) return true;
  return ` ${x} `.includes(` ${y} `) || ` ${y} `.includes(` ${x} `);
}

// Possibles doublons : une facture d'achat du même fournisseur qu'une charge
// fixe active à la date de la facture. Signalé, jamais retiré d'office (D11).
export function doublonsCharges(charges, factures) {
  const out = [];
  (charges || []).filter(c => c.fournisseur).forEach((c) => {
    (factures || []).forEach((f) => {
      if (f.dateDocument && chargeActive(c, f.dateDocument) && memeFournisseur(c.fournisseur, f.fournisseurNom)) out.push({ charge: c, facture: f });
    });
  });
  return out;
}
