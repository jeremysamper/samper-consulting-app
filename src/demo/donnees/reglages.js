// Réglages des modules de la démo (lot 2, migration 20261122_lot2a_reglages_modules).
// Valeurs de départ égales à ce que l'app fait aujourd'hui sans réglage
// (motifs de perte, 14 jours d'alerte des groupes, bons en retard à 12 min),
// pour que l'écran des réglages montre une maison déjà tenue. Le front déjà
// en ligne ne lit aucune de ces tables : rien ne change pour lui.
import { ETAB } from './base.js';

const LE = '2026-03-01T08:00:00Z';

export const REGLAGES_MODULES = [
  {
    module: 'pertes',
    config: {
      motifs: ['DLC dépassée', 'Surproduction', 'Erreur de préparation', 'Erreur de commande', 'Retour client', 'Casse', 'Autre'],
      valideurs: ['consultant', 'patron'],
    },
  },
  {
    module: 'groupes',
    config: {
      delai_alerte_jours: 14,
      statuts: { a_lire: { libelle: 'À lire' }, lu: { libelle: 'Lu', actif: true }, pret: { libelle: 'Prêt' } },
      types_actifs: ['mariage', 'anniversaire', 'seminaire', 'groupe', 'apero_dinatoire'],
    },
  },
  { module: 'mep', config: { postes: ['Froid', 'Chaud', 'Pâtisserie'] } },
  {
    module: 'fiches_salle',
    config: {
      valideurs: ['consultant', 'patron', 'resp_cuisine'],
      brouillons_visibles_salle: false,
      champs: { temps: true, accords: true, allergenes: true },
    },
  },
  { module: 'kds', config: { son: true, attention_minutes: 7, retard_minutes: 12 } },
  {
    module: 'catalogue',
    config: {
      unites: [
        { code: 'bouteille 75 cl', base: 'ml', facteur: 750 },
        { code: 'carton de 6', base: 'pcs', facteur: 6 },
        { code: 'sac de 25 kg', base: 'g', facteur: 25000 },
      ],
    },
  },
].map((r) => ({ etablissement_id: ETAB, updated_at: LE, updated_by: 'demo-patron', ...r }));

export const MEP_MODELES = [
  {
    id: '00000000-0000-4000-8000-0000000002a1',
    poste: 'Chaud',
    nom: 'Service du soir',
    lignes: [
      { label: 'Velouté de courge', recette_id: 'r-veloute-courge', quantite: 5, unite: 'l', congelable: true },
      { label: 'Sauce au poivre', recette_id: 'r-sauce-poivre', quantite: 1.5, unite: 'l', congelable: false },
      { label: 'Gratin dauphinois', recette_id: 'r-gratin', quantite: 2, unite: 'plaques', congelable: false },
    ],
    ordre: 0,
  },
  {
    id: '00000000-0000-4000-8000-0000000002a2',
    poste: 'Pâtisserie',
    nom: 'Desserts du week-end',
    lignes: [
      { label: 'Mousse au chocolat', recette_id: 'r-mousse-chocolat', quantite: 24, unite: 'portions', congelable: false },
      { label: 'Crèmes brûlées', recette_id: 'r-creme-brulee', quantite: 12, unite: 'ramequins', congelable: false },
    ],
    ordre: 1,
  },
].map((m) => ({ etablissement_id: ETAB, actif: true, created_by: 'demo-chef', created_at: LE, updated_at: LE, ...m }));

// Stock cible par produit et par jour de livraison (1 = lundi), dans l'unité
// de référence du produit (g ou pièce). Jours pris dans ceux du fournisseur.
const CIBLES = [
  ['p-courge', [1, 3, 5], 6000],
  ['p-pomme-de-terre', [1, 5], 25000],
  ['p-oignon', [1, 3, 5], 5000],
  ['p-boeuf-filet', [2, 4], 4000],
  ['p-volaille-supreme', [2, 4], 3000],
];
export const COMMANDE_CIBLES = CIBLES.flatMap(([produit, jours, quantite], i) => jours.map((j) => ({
  id: `00000000-0000-4000-8000-0000000003${i}${j}`,
  etablissement_id: ETAB,
  produit_id: produit,
  jour_livraison: j,
  quantite,
  updated_by: 'demo-chef',
  created_at: LE,
  updated_at: LE,
})));
