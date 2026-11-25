// ─────────────────────────────────────────────────────────────────────────────
// Journal d'activité, logique pure (plan 15, lot 5), sans React ni service :
// testée par node --test (journalLogique.test.mjs).
//
//   - filtres : recherche par mots, personne, module, action ;
//   - regroupement : les lignes identiques qui se suivent le même jour (même
//     personne, même module, même action, même élément) deviennent une seule
//     ligne, « 7 modifications » ;
//   - phrases : ce qui a changé, en mots lisibles ;
//   - lecture prudente du filtre gardé pour chaque personne (user_settings,
//     clé journal_filtres). Le réglage de la maison (vue, format d'export)
//     se lit dans utils/reglagesModules.js, module 'journal'.
// ─────────────────────────────────────────────────────────────────────────────

import { makeSearchMatcher } from '../../utils/searchText.js';
import { MODULES_JOURNAL, OPERATIONS_JOURNAL } from './serieJournal.js';

export const CLE_FILTRES_JOURNAL = 'journal_filtres';
export const TOUS = 'tous';

// Colonnes de la base, telles que le déclencheur les relève, en mots lisibles.
// Une colonne absente de la table se lit « autre champ » ; les colonnes de
// service (date de mise à jour, auteur) ne disent rien au lecteur du journal.
export const LIBELLES_CHAMPS = {
  nom: 'nom', categorie: 'catégorie', sous_categorie: 'sous-catégorie', statut: 'statut',
  portions: 'portions', prix_vente: 'prix de vente', temps_preparation: 'temps de préparation',
  temps_cuisson: 'temps de cuisson', temps_total: 'temps total', version: 'version',
  allergenes_ids: 'allergènes', allergenes: 'allergènes', notes_consultant: 'notes du consultant',
  dressage: 'dressage', conservation: 'conservation', etapes: 'étapes', ingredients: 'ingrédients',
  photo_url: 'photo', congelable: 'congelable', masquee: 'visibilité', archive: 'archivage',
  duree_vie_jours: 'durée de vie', duree_vie_congele_jours: 'durée de vie congelé',
  duree_vie_decongele_jours: 'durée de vie décongelé', date: 'date', valide_par: 'validation',
  valide: 'validation', valeur_totale: 'valeur totale', lignes: "lignes de l'inventaire", produit: 'produit',
  quantite: 'quantité', unite: 'unité', unite_ref: 'unité', valeur_unit: 'valeur unitaire',
  motif: 'motif', declare_par: 'déclarant', commentaire: 'commentaire', prix_unitaire: 'prix unitaire',
  fournisseur_id: 'fournisseur', fournisseurs: 'fournisseurs', reference_fourn: 'référence fournisseur',
  conditionnement: 'conditionnement', actif: 'actif', notes: 'notes', strategie_prix: 'stratégie de prix',
  prix_verrouille: 'prix verrouillé', prix_maj_le: 'mise à jour du prix', zone: 'zone',
};
const CHAMPS_DE_SERVICE = new Set(['id', 'etablissement_id', 'created_at', 'updated_at', 'modifie_par']);

// Les champs changés d'une ou plusieurs lignes, sans doublon, dans l'ordre.
export function champsChanges(lignes) {
  const vus = new Set();
  (Array.isArray(lignes) ? lignes : [lignes]).forEach((l) => {
    (l?.colonnes_modifiees || []).forEach((c) => {
      if (!CHAMPS_DE_SERVICE.has(c)) vus.add(LIBELLES_CHAMPS[c] || 'autre champ');
    });
  });
  return [...vus];
}

// « nom, prix de vente et allergènes »
export function listeEnMots(mots) {
  if (!mots.length) return '';
  if (mots.length === 1) return mots[0];
  return `${mots.slice(0, -1).join(', ')} et ${mots[mots.length - 1]}`;
}

// Ce qui a changé, en une phrase : « nom et prix de vente changés ». Une
// création ou une suppression n'a pas de champ à dire.
export function phraseChangement(operation, lignes) {
  if (operation !== 'UPDATE') return '';
  const mots = champsChanges(lignes);
  if (!mots.length) return '';
  return `${listeEnMots(mots)} ${mots.length > 1 ? 'changés' : 'changé'}`;
}

// Le mot d'une action selon le nombre : « modifications » (7 modifications),
// « Modification » (une seule). Le nombre s'écrit à part, dans son nœud.
export function motAction(operation, n) {
  const nom = OPERATIONS_JOURNAL[operation] || operation || 'Action';
  return n > 1 ? `${nom.toLowerCase()}s` : nom;
}

export const libelleActeur = (l) => l?.acteur_nom || (l?.acteur_id ? 'Compte inconnu' : 'Système');
const clePersonne = (l) => l?.acteur_id || (l?.acteur_nom ? `nom:${l.acteur_nom}` : 'systeme');

// Les personnes présentes dans les lignes, triées par nom : options du filtre.
export function personnesDuJournal(lignes) {
  const par = new Map();
  (lignes || []).forEach((l) => {
    const cle = clePersonne(l);
    if (!par.has(cle)) par.set(cle, libelleActeur(l));
  });
  return [...par.entries()]
    .map(([id, label]) => ({ id, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

// Les modules présents, dans l'ordre du journal.
export function modulesDuJournal(lignes) {
  const presents = new Set((lignes || []).map((l) => l.module).filter(Boolean));
  const connus = Object.keys(MODULES_JOURNAL).filter((m) => presents.has(m));
  const autres = [...presents].filter((m) => !MODULES_JOURNAL[m]).sort();
  return [...connus, ...autres].map((id) => ({ id, label: MODULES_JOURNAL[id] || id }));
}

export const FILTRES_VIDES = { personne: TOUS, module: TOUS, action: TOUS };

// Filtre gardé (user_settings) : une valeur mal formée vaut « tous ».
export function lireFiltres(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const valeur = (x, max = 80) => (typeof x === 'string' && x && x.length <= max ? x : TOUS);
  const action = valeur(o.action);
  return {
    personne: valeur(o.personne),
    module: valeur(o.module, 40),
    action: action === TOUS || OPERATIONS_JOURNAL[action] ? action : TOUS,
  };
}

export const filtresPoses = (f) => Boolean(f && (f.personne !== TOUS || f.module !== TOUS || f.action !== TOUS));

export function filtrerJournal(lignes, { recherche = '', personne = TOUS, module = TOUS, action = TOUS } = {}) {
  const trouve = makeSearchMatcher(recherche);
  return (lignes || []).filter((l) => (
    (personne === TOUS || clePersonne(l) === personne)
    && (module === TOUS || l.module === module)
    && (action === TOUS || l.operation === action)
    && trouve(l.libelle, libelleActeur(l), MODULES_JOURNAL[l.module] || l.module, OPERATIONS_JOURNAL[l.operation], champsChanges(l))
  ));
}

// Lignes datées (jour et heure de Zurich déjà posés : { jour, heure }), du
// plus récent au plus ancien. Rend les jours, chacun avec ses entrées ; une
// entrée porte `lignes` (une ou plusieurs) et `n`. Regrouper = false : une
// entrée par ligne (vue détaillée).
export function regrouperJournal(lignes, { regrouper = true } = {}) {
  const jours = [];
  (lignes || []).forEach((l) => {
    let j = jours[jours.length - 1];
    if (!j || j.jour !== l.jour) { j = { jour: l.jour, entrees: [] }; jours.push(j); }
    const prec = j.entrees[j.entrees.length - 1];
    const meme = regrouper && prec
      && clePersonne(prec.lignes[0]) === clePersonne(l)
      && prec.lignes[0].module === l.module
      && prec.lignes[0].operation === l.operation
      && (prec.lignes[0].libelle || '') === (l.libelle || '');
    if (meme) prec.lignes.push(l);
    else j.entrees.push({ id: l.id, lignes: [l] });
  });
  jours.forEach((j) => j.entrees.forEach((e) => {
    e.n = e.lignes.length;
    // Du plus récent au plus ancien : la première ligne est la dernière heure.
    e.heureFin = e.lignes[0].heure;
    e.heureDebut = e.lignes[e.lignes.length - 1].heure;
  }));
  return jours;
}

