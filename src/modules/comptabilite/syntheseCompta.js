// ─────────────────────────────────────────────────────────────────────────────
// Synthèse d'une période de la Comptabilité, sans React ni DOM (testé par
// node --test, syntheseCompta.test.mjs) : chiffre d'affaires, coût matière,
// marge brute, coût du personnel, charges fixes, résultat d'exploitation
// estimé, ratios et ce qui manque pour que ces chiffres soient justes.
//
// Coût matière (D10) : achats hors TVA de la période avec la règle déjà en
// prod des Analyses des dépenses (trierDocuments, montantFacture : HT, sinon
// TTC, sinon lignes), par date de facture ; le total d'un mois est donc égal à
// la barre du même mois dans « Analyses des dépenses ». En période
// d'inventaire seulement, la variation de stock s'ajoute (stock du début moins
// stock de la fin, dernier inventaire validé de chaque périmètre à la date).
//
// Une valeur inconnue vaut null (affichée « n/a »), jamais 0. Sans coût du
// personnel (hors direction, salaires pas encore lisibles, ou aucun salaire
// ni coût moyen saisi), le résultat est « avant personnel » ; quand une partie
// seulement du personnel est chiffrée, il est « personnel partiel ».
// ─────────────────────────────────────────────────────────────────────────────

import { montantFacture, trierDocuments } from '../factures-achats/analysesAchats.js';
import { dansIntervalle } from '../inventaire/exportFiduciaire.js';
import { valeurStockConsolidee } from '../../utils/inventairePerimetres.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { finEffective, prorata } from './periodesCompta.js';
import { chargesSurPeriode, doublonsCharges } from './chargesFixes.js';

const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

// Factures d'achat d'une période et leur montant hors TVA.
export function achatsPeriode(docs, { debut, fin }) {
  const dansPeriode = (docs || []).filter(d => dansIntervalle(d.dateDocument, { debut, fin }));
  const { factures, bons, exclues } = trierDocuments(dansPeriode);
  let total = 0, avecMontant = 0, sansHt = 0, sansMontant = 0, sansTaux = 0;
  factures.forEach((f) => {
    const { montant, source } = montantFacture(f);
    if (montant == null) sansMontant += 1;
    else { total += montant; avecMontant += 1; }
    if (source !== 'ht') sansHt += 1;
    if (nombre(f.tvaTaux) == null) sansTaux += 1;
  });
  return {
    liste: factures,
    factures: factures.length,
    achatsHt: avecMontant ? round2(total) : null,
    sansHt, sansMontant, sansTaux, bons, exclues,
  };
}

// Variation de stock d'une période d'inventaire : null hors mode inventaire,
// ou quand l'inventaire du début ou de la fin manque.
export function variationStock(inventaires, periode) {
  if (!periode || periode.type !== 'inventaire') return { valeur: null, mode: 'sans' };
  const valides = (inventaires || []).filter(i => i.statut === 'validé');
  const aLaDate = (date) => valides.filter(i => String(i.date || '') <= date);
  const dateDebut = periode.inventaireDebut || null;
  const dateFin = periode.ouverte ? null : periode.inventaireFin || null;
  if (!dateDebut || !dateFin) return { valeur: null, mode: 'manque', dateDebut, dateFin };
  const stockDebut = round2(valeurStockConsolidee(aLaDate(dateDebut)));
  const stockFin = round2(valeurStockConsolidee(aLaDate(dateFin)));
  return { valeur: round2(stockDebut - stockFin), mode: 'inventaire', dateDebut, dateFin, stockDebut, stockFin };
}

// « +8 % », « -3 % », « 0 % » ; « n/a » quand l'une des deux valeurs manque
// ou que la période précédente vaut zéro.
export function ecart(a, b) {
  if (a == null || b == null || b === 0) return 'n/a';
  const p = Math.round(((a - b) / Math.abs(b)) * 100);
  return `${p > 0 ? '+' : ''}${p} %`;
}

// Une période dont le chiffre d'affaires n'est connu que pour une partie des
// jours ouverts ne se compare pas : « +2 277 % sur septembre » parce que
// septembre n'a qu'un jour saisi serait faux. Comparable à partir de 80 % des
// jours attendus.
export const SEUIL_COMPARABLE = 0.8;
export function ventesComparables(ventes) {
  if (!ventes || ventes.ht == null || !ventes.attendus) return false;
  return ventes.avec / ventes.attendus >= SEUIL_COMPARABLE;
}

const pct = (part, tout) => (part != null && tout != null && tout > 0 ? (part / tout) * 100 : null);

//   periode     : période de periodesCompta.js
//   aujourdhui  : jour ISO de Zurich
//   ventes      : resumeVentes(...) de ventesCompta.js (ht null = inconnu)
//   docs        : pièces d'achat (achats_documents mappés)
//   charges     : charges fixes, ou null si la table n'est pas lisible
//   personnel   : coutPersonnel(...) de personnelCompta.js, ou null
//   inventaires : inventaires de l'établissement (période d'inventaire)
//   tva         : etatTva(...) de tvaCompta.js ({ due, couverture,
//                 ventesCompletes }), facultatif
export function synthese({ periode, aujourdhui, ventes = null, docs = [], charges = null, personnel = null, inventaires = [], tva = null }) {
  const fin = finEffective(periode, aujourdhui);
  const ca = ventes?.ht ?? null;

  const achats = achatsPeriode(docs, { debut: periode.debut, fin: periode.fin });
  const stock = variationStock(inventaires, periode);
  const matiereHt = achats.achatsHt == null ? null : round2(achats.achatsHt + (stock.valeur || 0));

  const detailCharges = charges == null ? null : chargesSurPeriode(charges, periode.debut, fin);
  const chargesHt = detailCharges ? detailCharges.ht : null;
  const personnelTotal = personnel?.total ?? null;

  const margeBrute = ca != null && matiereHt != null ? round2(ca - matiereHt) : null;
  const resultat = margeBrute == null ? null : round2(margeBrute - (personnelTotal || 0) - (chargesHt || 0));
  const doublons = charges ? doublonsCharges(charges, achats.liste) : [];

  const manques = [];
  const ajouter = (id, n, texte, ecran) => manques.push({ id, n, texte, ecran });
  const jours = ventes?.manquants?.length || 0;
  if (jours) ajouter('jours', jours, pluriel(jours, 'jour sans chiffre d\'affaires', 'jours sans chiffre d\'affaires'), 'ventes');
  if (achats.sansHt) ajouter('sansHt', achats.sansHt, pluriel(achats.sansHt, 'facture sans montant hors TVA', 'factures sans montant hors TVA'), 'achats');
  if (achats.sansTaux) ajouter('sansTaux', achats.sansTaux, pluriel(achats.sansTaux, 'facture sans taux de TVA', 'factures sans taux de TVA'), 'achats');
  if (personnel?.sansCout) ajouter('sansCout', personnel.sansCout, pluriel(personnel.sansCout, 'personne sans salaire ni coût moyen', 'personnes sans salaire ni coût moyen'), 'personnel');
  // Heures entières : « 12 heures prévues non pointées ».
  const prevues = Math.round(personnel?.heuresPrevues || 0);
  if (prevues) ajouter('nonPointees', prevues, pluriel(prevues, 'heure prévue non pointée', 'heures prévues non pointées'), 'personnel');
  if (personnel?.apresMinuit) ajouter('apresMinuit', personnel.apresMinuit, pluriel(personnel.apresMinuit, 'horaire après minuit non compté', 'horaires après minuit non comptés'), 'personnel');
  if (charges && !charges.length) ajouter('aucuneCharge', 0, 'aucune charge fixe saisie', 'charges');
  if (doublons.length) ajouter('doublons', doublons.length, pluriel(doublons.length, 'possible doublon avec une charge fixe', 'possibles doublons avec une charge fixe'), 'achats');
  if (periode.type === 'inventaire' && stock.valeur == null) ajouter('inventaire', 0, 'pas d\'inventaire au début ou à la fin', 'ensemble');

  return {
    periode,
    fin,
    prorata: prorata(periode, aujourdhui),
    ca,
    ventes,
    matiere: {
      achatsHt: achats.achatsHt,
      variationStock: stock.valeur,
      stock,
      ht: matiereHt,
      factures: achats.factures,
      liste: achats.liste,
      sansHt: achats.sansHt,
      sansMontant: achats.sansMontant,
      sansTaux: achats.sansTaux,
      bons: achats.bons,
    },
    personnel: personnelTotal,
    personnelDetail: personnel,
    charges: chargesHt,
    chargesDetail: detailCharges,
    margeBrute,
    resultat,
    // Un coût du personnel sans total (personne n'a de salaire ni de coût
    // moyen) n'est pas un personnel à zéro : le résultat reste avant personnel.
    avantPersonnel: personnelTotal == null,
    personnelPartiel: personnelTotal != null && (personnel?.sansCout || 0) > 0,
    avantCharges: chargesHt == null,
    ratios: { matierePct: pct(matiereHt, ca), personnelPct: pct(personnelTotal, ca) },
    tvaEstimee: tva?.due ?? null,
    // Couverture des ventes de l'état TVA ({ avec, attendus }) ; une TVA
    // calculée sur trop peu de jours de ventes n'est pas complète.
    tvaCouverture: tva?.couverture ?? null,
    tvaComplete: tva ? tva.ventesCompletes !== false : null,
    doublons,
    manques,
  };
}
