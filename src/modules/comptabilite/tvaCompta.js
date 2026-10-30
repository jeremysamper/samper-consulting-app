// ─────────────────────────────────────────────────────────────────────────────
// État TVA de la Comptabilité, sans React ni DOM (testé par node --test,
// tvaCompta.test.mjs). Une estimation pour préparer le décompte : la
// fiduciaire établit le décompte officiel.
//
// Règle D16 de la spec :
//   - méthode effective (défaut) : TVA sur les ventes moins l'impôt préalable
//     (TVA des factures d'achat et des charges fixes), décompte par trimestre ;
//   - méthode des taux de la dette fiscale nette (TDFN, choisie dans les
//     Réglages) : chiffre d'affaires TVA comprise multiplié par le taux saisi
//     par le patron, décompte par semestre, sans impôt préalable. Aucun taux
//     TDFN n'est écrit ici.
// Échéance d'un décompte : 60 jours après la fin de sa période.
//
// La partie achats passe par lignesFiduciaire et totauxFiduciaire de
// l'export fiduciaire : mêmes montants que l'export des factures d'achat par
// construction. Une facture « à vérifier » dont la TVA est inconnue n'est pas
// déduite, et l'état le dit (nonDeduites).
// ─────────────────────────────────────────────────────────────────────────────

import { lignesFiduciaire, totauxFiduciaire } from '../inventaire/exportFiduciaire.js';
import { round2 } from '../inventaire/tvaAchats.js';
import { chargesSurPeriode } from './chargesFixes.js';
import { ajouterJours, dernierJourDuMois, finEffective } from './periodesCompta.js';
import { couvertureVentes, totauxVentes } from './ventesCompta.js';
import { ventesComparables } from './syntheseCompta.js';

export const DELAI_DECOMPTE_JOURS = 60;
const COLONNES_TVA = ['tva26', 'tva81', 'tva38', 'tvaAutre'];
const pad = (n) => String(n).padStart(2, '0');
const ordinal = (n) => (n === 1 ? '1er' : `${n}e`);
const nombre = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

// Période de décompte qui contient `aujourdhui`, décalée de `decalage`
// périodes (0 = en cours, -1 = la précédente, celle à déclarer).
//   → { type: 'trimestre' | 'semestre', numero, debut, fin, echeance, libelle, enCours }
export function periodeTva(aujourdhui, methode = 'effective', decalage = 0) {
  const mois = methode === 'tdfn' ? 6 : 3;
  const parAn = 12 / mois;
  const a = Number(aujourdhui.slice(0, 4));
  const m = Number(aujourdhui.slice(5, 7));
  const rang = a * parAn + Math.floor((m - 1) / mois) + decalage;
  const annee = Math.floor(rang / parAn);
  const k = rang - annee * parAn;
  const mDebut = k * mois + 1;
  const mFin = mDebut + mois - 1;
  const debut = `${annee}-${pad(mDebut)}-01`;
  const fin = `${annee}-${pad(mFin)}-${pad(dernierJourDuMois(annee, mFin))}`;
  const type = methode === 'tdfn' ? 'semestre' : 'trimestre';
  return {
    type,
    numero: k + 1,
    debut,
    fin,
    echeance: ajouterJours(fin, DELAI_DECOMPTE_JOURS),
    libelle: `${ordinal(k + 1)} ${type} ${annee}`,
    enCours: debut <= aujourdhui && aujourdhui <= fin,
  };
}

// Période de TVA montrée d'abord : la précédente tant que son échéance n'est
// pas passée (elle est à déclarer), sinon celle en cours.
export function periodeTvaParDefaut(aujourdhui, methode = 'effective') {
  const precedente = periodeTva(aujourdhui, methode, -1);
  return precedente.echeance >= aujourdhui ? precedente : periodeTva(aujourdhui, methode, 0);
}

// Partie achats : TVA des factures d'achat de l'intervalle, par colonne de
// l'export fiduciaire.
export function tvaAchats(docs, { debut, fin }) {
  const lignes = lignesFiduciaire(docs, { debut, fin });
  const totaux = totauxFiduciaire(lignes);
  const connues = COLONNES_TVA.map(k => totaux[k]).filter(v => v != null);
  const sansTva = (l) => COLONNES_TVA.every(k => l[k] == null);
  return {
    tva26: totaux.tva26,
    tva81: totaux.tva81,
    tva38: totaux.tva38,
    tvaAutre: totaux.tvaAutre,
    total: round2(connues.reduce((s, v) => s + v, 0)),
    factures: lignes.length,
    aVerifier: lignes.filter(l => l.aVerifier).length,
    // « À vérifier » et TVA inconnue : rien n'est déduit pour elles.
    nonDeduites: lignes.filter(l => l.aVerifier && sansTva(l)).length,
    totaux,
  };
}

//   ventes     : jours de ventesParJour (ventesCompta.js), filtrés ici
//   docs       : pièces d'achat (achats_documents mappés)
//   charges    : charges fixes, ou null si la table n'est pas lisible
//   reglages   : { methodeTva, tauxTdfn }
//   debut, fin : la période ; aujourdhui : borne des charges d'une période en
//                cours (D13), facultatif
//   joursOuverts, notesCouvrent : couverture des ventes (couvertureVentes),
//                avec aujourdhui ; sans aujourdhui, la couverture est inconnue
// → { methode, tauxTdfn, ventes: { ttc, ht, tva, parTaux, jours, nbJours },
//     achats, charges: [{ taux, ttc, tva }], chargesTva, prealable, due,
//     couverture: { avec, attendus } | null, ventesCompletes }
// ventesCompletes est faux quand moins de 80 % des jours attendus ont un
// chiffre d'affaires (même seuil que la comparaison des périodes) : la TVA
// due, et surtout un crédit de TVA, n'est alors pas à prendre telle quelle.
export function etatTva({ ventes = [], docs = [], charges = null, reglages = {}, debut, fin, aujourdhui = null, joursOuverts = null, notesCouvrent = false }) {
  const methode = reglages?.methodeTva === 'tdfn' ? 'tdfn' : 'effective';
  const tauxTdfn = nombre(reglages?.tauxTdfn);
  const jours = (ventes || []).filter(j => j.jour >= debut && j.jour <= fin);
  const tv = totauxVentes(jours);
  const nbJours = jours.filter(j => j.source || j.avecNotes).length;
  const cv = aujourdhui
    ? couvertureVentes({ parJour: jours, joursOuverts: joursOuverts || new Set(), debut, finEffective: finEffective({ debut, fin }, aujourdhui), aujourdhui, notesCouvrent })
    : null;
  const couverture = cv ? { avec: cv.avec, attendus: cv.attendus } : null;
  const ventesCompletes = couverture ? ventesComparables({ ht: tv.ht, ...couverture }) : true;

  const achats = tvaAchats(docs, { debut, fin });
  const finCharges = aujourdhui ? finEffective({ debut, fin }, aujourdhui) : fin;
  const detail = charges == null ? null : chargesSurPeriode(charges, debut, finCharges);
  const lignesCharges = detail ? detail.parTaux.filter(t => t.taux > 0).map(t => ({ taux: t.taux, ttc: t.ttc, tva: t.tva })) : [];
  const chargesTva = detail ? round2(lignesCharges.reduce((s, t) => s + t.tva, 0)) : null;

  let prealable = null;
  let due = null;
  if (methode === 'effective') {
    prealable = round2(achats.total + (chargesTva || 0));
    due = tv.tva == null ? null : round2(tv.tva - prealable);
  } else if (tv.ttc != null && tauxTdfn != null && tauxTdfn > 0) {
    due = round2(tv.ttc * tauxTdfn / 100);
  }

  return {
    methode,
    tauxTdfn,
    debut,
    fin,
    ventes: { ttc: tv.ttc, ht: tv.ht, tva: tv.tva, parTaux: tv.parTaux, jours: tv.jours, nbJours },
    achats,
    charges: lignesCharges,
    chargesTva,
    chargesLues: detail != null,
    prealable,
    due,
    couverture,
    ventesCompletes,
  };
}
