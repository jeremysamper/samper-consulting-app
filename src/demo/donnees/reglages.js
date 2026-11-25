// Réglages des modules de la démo (lot 2, migration 20261122_lot2a_reglages_modules).
// Valeurs de départ égales à ce que l'app fait aujourd'hui sans réglage
// (motifs de perte, 14 jours d'alerte des groupes, bons en retard à 12 min),
// pour que l'écran des réglages montre une maison déjà tenue. Le front déjà
// en ligne ne lit aucune de ces tables : rien ne change pour lui.
import { ETAB, aujourdhui, instant } from './base.js';

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
  // Lot 6b (migration 20261122_lot6b_reglages_hotel) : la branche Hôtel de la
  // démo (lot 6a) a ses temps de ménage, ses demandes courantes et la carte du
  // room service.
  {
    module: 'etages',
    config: {
      temps_defaut: { depart: 30, recouche: 15 },
      types: [
        { categorie: 'Simple', depart: 25, recouche: 12, linge: { draps: 1, serviettes: 2, tapis: 1 } },
        { categorie: 'Double', depart: 30, recouche: 15, linge: { draps: 2, serviettes: 4, tapis: 1 } },
        { categorie: 'Twin', depart: 30, recouche: 15, linge: { draps: 2, serviettes: 4, tapis: 1 } },
        { categorie: 'Junior suite', depart: 45, recouche: 20, linge: { draps: 3, serviettes: 6, peignoirs: 2, tapis: 1 } },
        { categorie: 'Familiale', depart: 50, recouche: 25, linge: { draps: 4, serviettes: 8, tapis: 2 } },
      ],
    },
  },
  {
    module: 'demandes',
    config: {
      categories: [
        { libelle: 'Oreillers en plus', pole: 'etages', priorite: 'normale', delai_minutes: 30 },
        { libelle: 'Serviettes en plus', pole: 'etages', priorite: 'normale', delai_minutes: 30 },
        { libelle: 'Peignoirs pour le spa', pole: 'etages', priorite: 'normale', delai_minutes: 45 },
        { libelle: 'Lit bébé', pole: 'etages', priorite: 'haute', delai_minutes: 60 },
        { libelle: 'Fuite d\'eau', pole: 'technique', priorite: 'urgente', delai_minutes: 30 },
        { libelle: 'Chauffage ou climatisation', pole: 'technique', priorite: 'haute', delai_minutes: 60 },
        { libelle: 'Télévision ou wifi', pole: 'technique', priorite: 'normale', delai_minutes: 120 },
        { libelle: 'Taxi à commander', pole: 'reception', priorite: 'haute', delai_minutes: 30 },
        { libelle: 'Départ tardif', pole: 'reception', priorite: 'normale', delai_minutes: 120 },
        { libelle: 'Table au restaurant', pole: 'restaurant', priorite: 'normale', delai_minutes: 60 },
        { libelle: 'Repas sans allergène', pole: 'cuisine', priorite: 'haute', delai_minutes: 180 },
      ],
    },
  },
  {
    module: 'repas',
    config: {
      horaires: {
        petit_dejeuner: { debut: '07:00', fin: '10:30' },
        dejeuner: { debut: '12:00', fin: '14:00' },
        diner: { debut: '18:30', fin: '21:30' },
      },
      room_service: { heures: { debut: '11:00', fin: '22:00' }, frais: 5 },
      carte: [
        { libelle: 'Club sandwich', prix: 24 },
        { libelle: 'Salade valaisanne', prix: 22 },
        { libelle: 'Assiette valaisanne', prix: 28 },
        { libelle: 'Tarte aux abricots', prix: 9 },
        { libelle: 'Eau minérale 50 cl', prix: 5 },
        { libelle: 'Verre de Fendant', prix: 8 },
        { libelle: 'Café', prix: 4.5 },
      ],
    },
  },
  // Lot 06 du panel (migration 20261125_panel_lot06_previsions_sources) : la
  // prévision des couverts compte les hôtes en pension de la branche Hôtel.
  { module: 'previsions', config: { sources: { pension: true } } },
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



// Fils d'équipe de Messages (décision D5) : canaux_messages, canal 'cuisine',
// 'restaurant' (affiché « Salle ») et 'tous' (Toute l'équipe). Le front déjà
// en ligne ne les lit que dans Passations (Hôtel).
const FIL = [
  ['tous', 'demo-patron', '09:40', 'Bonjour à tous. Ce soir, 29 couverts et un groupe de 18 personnes à 19 h. Soyez en place à 18 h 15.', []],
  ['cuisine', 'demo-chef', '10:05', 'Les légumes arrivent demain à 8 h. Videz la chambre froide positive ce soir.', []],
  ['cuisine', 'demo-cuisinier', '10:12', "C'est noté. Je m'en occupe après le service.", []],
  ['restaurant', 'demo-serveur', '11:30', 'Table 12 : un client est allergique aux fruits à coque. Julien, vous êtes prévenu.', ['demo-chef']],
  ['restaurant', 'demo-hote', '11:45', "Le groupe de 18 arrive à 19 h. Je l'installe dans la salle du fond.", []],
];
export const CANAUX_MESSAGES = FIL.map(([canal, auteur, heure, contenu, mentions], i) => ({
  id: '00000000-0000-4000-8000-0000000004' + String(i).padStart(2, '0'),
  etablissement_id: ETAB,
  canal,
  contenu,
  mentions,
  created_by: auteur,
  created_at: instant(aujourdhui(), heure),
  updated_at: instant(aujourdhui(), heure),
}));
