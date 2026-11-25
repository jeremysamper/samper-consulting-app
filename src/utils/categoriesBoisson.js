import { normalizeSearch } from './searchText.js';

// ─────────────────────────────────────────────────────────────
// Rubriques de la Carte des boissons (22.11.2026).
// Référentiel à part de celui de Cartes & Recettes (categoriesPlat.js) :
// une boisson reste une ligne de plats, sa rubrique vit dans
// plats.categorie. Texte libre permis : une rubrique hors liste
// s'affiche après les rubriques connues, jamais perdue.
//
// `caisse` : la catégorie de caisse où la boisson tombe quand la
// maison n'en a pas choisi une pour elle (caisse_boutons) et qu'une
// catégorie de ce nom existe ; sinon « Boissons à trier »
// (src/modules/caisse/categories.js).
//
// Util pur (ni React ni DOM).
// ─────────────────────────────────────────────────────────────

export const RUBRIQUES_BOISSON = [
  { nom: 'Vins blancs', caisse: 'Vins' },
  { nom: 'Vins rosés', caisse: 'Vins' },
  { nom: 'Vins rouges', caisse: 'Vins' },
  { nom: 'Bulles', caisse: 'Vins' },
  { nom: 'Cocktails', caisse: 'Alcools' },
  { nom: 'Spiritueux', caisse: 'Alcools' },
  { nom: 'Bières', caisse: 'Alcools' },
  { nom: 'Softs', caisse: 'Softs' },
  { nom: 'Boissons chaudes', caisse: 'Boissons chaudes' },
  { nom: 'Sans alcool', caisse: 'Softs' },
];

export const NOMS_RUBRIQUES = RUBRIQUES_BOISSON.map((r) => r.nom);

// Rubrique d'une boisson sans rubrique (et des boissons d'avant le
// module, toutes rangées en « Boissons »).
export const RUBRIQUE_DEFAUT = 'Boissons';

const cle = (s) => normalizeSearch(s).trim();
const parCle = new Map(RUBRIQUES_BOISSON.map((r, i) => [cle(r.nom), { ...r, rang: i }]));

export const rubriqueDe = (boisson) => String(boisson?.categorie || '').trim() || RUBRIQUE_DEFAUT;

// Rang de tri : le référentiel d'abord, le texte libre ensuite.
export const rangRubrique = (rubrique) => parCle.get(cle(rubrique))?.rang ?? RUBRIQUES_BOISSON.length;

// Catégorie de caisse d'une rubrique, ou null (rubrique libre ou « Boissons »).
export const categorieCaisseDeRubrique = (rubrique) => parCle.get(cle(rubrique))?.caisse || null;

// Regroupe des boissons par rubrique, dans l'ordre du référentiel.
// Rend [[rubrique, boissons], ...].
export function grouperParRubrique(boissons = []) {
  const m = new Map();
  boissons.forEach((b) => {
    const r = rubriqueDe(b);
    if (!m.has(r)) m.set(r, []);
    m.get(r).push(b);
  });
  return [...m.entries()].sort((a, b) => rangRubrique(a[0]) - rangRubrique(b[0]) || a[0].localeCompare(b[0], 'fr'));
}
