// ─────────────────────────────────────────────────────────────
// Pictogrammes des fiches en vitrine : lucide au trait, jamais d'émoji.
// - iconeCategorie : le picto du visuel de remplacement d'une fiche sans
//   photo, tiré de sa catégorie (null : on affiche l'initiale du nom).
// - ICONES_ALLERGENES : le picto posé devant le libellé d'un allergène
//   (jamais seul : le libellé est toujours écrit à côté).
// ─────────────────────────────────────────────────────────────
import {
  Salad, UtensilsCrossed, Fish, Beef, CookingPot, Milk, CakeSlice, Wine, BookOpen,
  Soup, ChefHat, Croissant, Wheat, Egg, Shrimp, Nut, Bean, LeafyGreen, Droplet,
  Sprout, Shell, Flower2,
} from 'lucide-react';
import { normalizeSearch } from '../../utils/searchText.js';

// Comparaison sur le nom normalisé, au début d'un mot : « Pâtes & Risottos »
// trouve « pate », « Fonds & sauces » trouve « fond ». Premier trouvé, premier
// servi : l'ordre de la table compte.
const PICTOS_CATEGORIE = [
  ['entree', Salad],
  ['plat', UtensilsCrossed],
  ['poisson', Fish],
  ['viande', Beef],
  ['pate', CookingPot],
  ['risotto', CookingPot],
  ['fromage', Milk],
  ['dessert', CakeSlice],
  ['boisson', Wine],
  ['menu', BookOpen],
  ['sauce', Soup],
  ['fond', Soup],
  ['base', ChefHat],
  ['garniture', ChefHat],
  ['preparation', ChefHat],
  ['petit-dejeuner', Croissant],
  ['brunch', Croissant],
];

const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MOTIFS = PICTOS_CATEGORIE.map(([cle, Icone]) => [new RegExp(`(^|[^a-z0-9])${echappe(cle)}`), Icone]);

export function iconeCategorie(categorie) {
  const c = normalizeSearch(categorie).trim();
  if (!c) return null;
  const trouve = MOTIFS.find(([re]) => re.test(c));
  return trouve ? trouve[1] : null;
}

export const ICONES_ALLERGENES = {
  gluten: Wheat,
  lactose: Milk,
  oeufs: Egg,
  poissons: Fish,
  crustaces: Shrimp,
  fruits_coque: Nut,
  sulfites: Wine,
  arachides: Nut,
  soja: Bean,
  celeri: LeafyGreen,
  moutarde: Droplet,
  sesame: Sprout,
  mollusques: Shell,
  lupin: Flower2,
};
