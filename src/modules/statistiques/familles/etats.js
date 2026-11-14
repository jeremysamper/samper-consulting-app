// Familles Marges (Comptabilité) et Chiffrage (Outils consultant) du catalogue
// des Statistiques : des valeurs d'aujourd'hui (nature 'etat'), aux prix et
// coûts actuels, sans série dans le temps. Chaque mesure lit une ligne rendue
// par etatMarges (comptabilite/serieMarges.js) ou etatChiffrage
// (consultant-tools/serieChiffrage.js), sur chiffrerCarte et chiffrerFiche.
// Sans React ni service.
//
// Une mesure état déclare `categories` (genre de ses catégories : deux mesures
// ne se tracent ensemble que sur les mêmes), `lignes(point, choix)` (une ligne
// par plat ou par fiche) et, comme la carte des Marges, `total` (la ligne
// « un plat de chaque »). Un food cost est un rapport entre 0 et 1 (unité
// 'pct'). Une valeur que l'écran ne chiffre pas (plat sans fiche, sans prix)
// vaut « n/a », jamais 0.

import { etatMarges } from '../../comptabilite/serieMarges.js';
import { etatChiffrage } from '../../consultant-tools/serieChiffrage.js';
import { carnetsAVenir } from '../../previsions/rapport/computeReservationStats.js';

const pct = (v) => (v == null ? null : v / 100);
const instantane = (calculer) => (donnees, tranches, ctx) => {
  const point = calculer(donnees, ctx);
  return (tranches || []).map(() => point);
};

// Carte choisie (partagée par les quatre mesures de carte) ; la première
// visible à défaut, comme l'écran.
const choixCarte = { cle: 'marges_carte', libelle: 'Carte', options: (p) => (p.cartes || []).map((x) => ({ cle: x.carte.id, libelle: x.carte.nom || x.carte.id })) };
const calculDe = (p, id) => ((p.cartes || []).find((x) => x.carte.id === id) || (p.cartes || [])[0] || null)?.calcul || null;
const mesureCarte = (id, libelle, unite, lire, total, phrase) => ({
  id, libelle, unite, nature: 'etat', categories: 'plats_carte', libelleCategories: 'Plat', libelleTotal: 'Un plat de chaque',
  choix: choixCarte,
  valeur: (p, carte) => { const c = calculDe(p, carte); return c ? total(c) : null; },
  lignes: (p, carte) => (calculDe(p, carte)?.plats || []).map((l) => ({ cle: l.plat.id, libelle: l.plat.nom, valeur: lire(l) })),
  total: (p, carte) => { const c = calculDe(p, carte); return c ? total(c) : null; },
  phrase,
});
const mesureFiche = (id, libelle, unite, lire, categories, phrase) => ({
  id, libelle, unite, nature: 'etat', categories, libelleCategories: 'Fiche',
  valeur: () => null,
  lignes: (p) => (p.fiches || []).map(({ r, c }) => ({ cle: r.id, libelle: r.nom, valeur: lire(r, c) })),
  phrase,
});

// Carnet à venir du rapport des réservations (S3) : couverts déjà réservés pour
// les 7, 14 et 30 prochains jours, ce qui l'était à la date comparable (celle
// de la comparaison de la vue, comme le rapport) et la variation.
const ligneCarnet = (lire) => (p) => (p.carnets || []).map((c) => ({ cle: String(c.jours), libelle: `${c.jours} jours`, valeur: lire(c) }));
const mesureCarnet = (id, libelle, unite, lire, phrase) => ({
  id, libelle, unite, nature: 'etat', categories: 'horizons_carnet', libelleCategories: 'Horizon', valeur: () => null, lignes: ligneCarnet(lire), phrase,
});
export const familleCarnet = {
  id: 'carnet',
  libelle: 'Carnet à venir',
  journee: 'aujourd\'hui, pour les jours qui viennent',
  calculer: instantane((d, ctx) => ({
    carnets: carnetsAVenir({ lignes: d.lignes, aujourdhui: ctx?.aujourdhui, reference: ctx?.reference, service: ctx?.filtres?.service || 'tous', parametres: d.parametres }),
    avecReference: !!ctx?.reference && ctx.reference !== ctx.aujourdhui,
  })),
  mesures: [
    mesureCarnet('carnet.couverts', 'Couverts au carnet', 'nombre', (c) => c.actuel,
      'Couverts déjà réservés pour les prochains jours (confirmés, demandes, arrivés, partis), comme le carnet à venir du rapport.'),
    mesureCarnet('carnet.avant', 'Couverts au carnet à la date comparable', 'nombre', (c) => c.avant,
      'Ce qui était déjà réservé à la date comparable de la comparaison choisie, pour le même nombre de jours.'),
    mesureCarnet('carnet.variation', 'Variation du carnet', 'pct', (c) => pct(c.variation),
      'Écart du carnet d\'aujourd\'hui sur celui de la date comparable, en pour cent ; n/a sans base.'),
  ],
};

export const familleMarges = {
  id: 'marges',
  libelle: 'Marges',
  journee: 'aujourd\'hui, aux prix et coûts actuels',
  calculer: instantane((d, ctx) => etatMarges({ ...d, consultant: ctx?.role === 'consultant' })),
  mesures: [
    mesureCarte('marges.carte_prix', 'Prix de vente des plats', 'chf', (l) => l.prix, (c) => c.prix,
      'Prix de vente TVA comprise de chaque plat de la carte choisie, celui du plat, sinon celui de son unique fiche ; « un plat de chaque » fait la somme des plats comptés.'),
    mesureCarte('marges.carte_cout', 'Coût matière des plats', 'chf', (l) => l.cout, (c) => c.cout,
      'Coût d\'une portion de chaque fiche du plat, prix du catalogue, sinon prix noté dans la fiche, comme l\'écran Marges.'),
    mesureCarte('marges.carte_food_cost', 'Food cost des plats', 'pct', (l) => pct(l.foodCost), (c) => pct(c.foodCost),
      'Coût matière divisé par le prix de vente ; pour la carte, somme des coûts sur somme des prix, un plat de chaque, sans les quantités vendues.'),
    mesureCarte('marges.carte_marge', 'Marge des plats', 'chf', (l) => l.marge, (c) => c.marge,
      'Prix de vente moins coût matière ; n/a pour un plat sans fiche ou sans prix, qui n\'entre pas dans la ligne d\'ensemble.'),
    mesureFiche('marges.fiche_prix', 'Prix de vente des fiches', 'chf', (r) => Number(r.prixVente), 'fiches_marges',
      'Prix de vente des fiches non archivées qui en ont un, comme l\'onglet Fiches des Marges.'),
    mesureFiche('marges.fiche_cout', 'Coût par portion des fiches', 'chf', (r, c) => c.coutPortion, 'fiches_marges',
      'Coût matière de la fiche divisé par ses portions.'),
    mesureFiche('marges.fiche_food_cost', 'Food cost des fiches', 'pct', (r, c) => pct(c.foodCost), 'fiches_marges',
      'Coût par portion divisé par le prix de vente de la fiche.'),
    mesureFiche('marges.fiche_marge', 'Marge brute des fiches', 'chf', (r, c) => c.margeBrute, 'fiches_marges',
      'Prix de vente moins coût par portion.'),
  ],
};

export const familleChiffrage = {
  id: 'chiffrage',
  libelle: 'Chiffrage (Outils consultant)',
  journee: 'aujourd\'hui, aux prix et coûts actuels',
  calculer: instantane((d) => ({ fiches: etatChiffrage(d) })),
  mesures: [
    mesureFiche('chiffrage.cout_matiere', 'Coût matière d\'une fiche', 'chf', (r, c) => c.coutMatiere, 'fiches_chiffrage',
      'Coût de tous les ingrédients de la fiche, prix du catalogue, sinon prix noté dans la fiche, comme le Chiffrage.'),
    mesureFiche('chiffrage.cout_portion', 'Coût par portion', 'chf', (r, c) => c.coutPortion, 'fiches_chiffrage',
      'Coût matière divisé par les portions de la fiche.'),
    mesureFiche('chiffrage.prix', 'Prix de vente d\'une fiche', 'chf', (r) => (Number(r.prixVente) > 0 ? Number(r.prixVente) : null), 'fiches_chiffrage',
      'Prix de vente saisi dans la fiche ; n/a sans prix.'),
    mesureFiche('chiffrage.food_cost', 'Food cost d\'une fiche', 'pct', (r, c) => pct(c.foodCost), 'fiches_chiffrage',
      'Coût par portion divisé par le prix de vente ; n/a sans prix.'),
    mesureFiche('chiffrage.marge', 'Marge brute par portion', 'chf', (r, c) => (Number(r.prixVente) > 0 ? c.margeBrute : null), 'fiches_chiffrage',
      'Prix de vente moins coût par portion ; n/a sans prix (le Chiffrage affiche alors 0).'),
  ],
};
