// ─────────────────────────────────────────────────────────────
// prixResolution - prix retenu pour un produit, et prix d'un ingrédient de recette.
//
// Deux règles fondent ce module :
//
//  1. Le prix vit au catalogue, pas dans la recette. `ingredient.prixUnit` est
//     une copie figée au moment de la liaison ; elle ne sert plus que de repli
//     (ingrédient non lié, produit supprimé, lecture catalogue en échec). Le
//     coût matière se calcule à la lecture depuis `produitId`, sinon changer un
//     prix au catalogue obligerait à réenregistrer les 477 recettes.
//
//  2. Quand un produit a plusieurs références fournisseurs, la stratégie du
//     produit tranche. Défaut « max » : on chiffre au plus cher, ce qui évite
//     d'annoncer une marge qu'on ne fera pas. Un produit verrouillé
//     (`prixVerrouille`) n'est jamais touché par un scan ou un import.
//
// Les fonctions ne lèvent jamais : elles renvoient toujours un nombre fini.
// ─────────────────────────────────────────────────────────────

import { convertFactor } from '../modules/consultant-tools/ConsultantTools.constants.js';

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Convertit un PRIX de `CHF par uniteSource` vers `CHF par uniteCible`.
//
// Attention au sens : convertFactor('kg','g') vaut 1000 parce qu'un kg contient
// 1000 g. Une quantité se multiplie par ce facteur (2 kg = 2000 g), mais un prix
// est une grandeur inverse et se divise (52 CHF/kg = 0,052 CHF/g). D'où le
// facteur pris dans l'autre sens.
//
// Renvoie null quand les unités ne se convertissent pas (g vers pcs) : on ne
// devine jamais une densité, ça fausserait le food cost en silence.
export function convertPrix(prix, uniteSource, uniteCible) {
  if (!uniteSource || !uniteCible || uniteSource === uniteCible) return prix;
  const factor = convertFactor(uniteCible, uniteSource);
  if (factor === null) return null;
  return prix * factor;
}

// Indexe le catalogue par id. À construire une fois par rendu, pas par ingrédient :
// 2 763 ingrédients × 803 produits en recherche linéaire fait 2,2 million de tours.
export function buildProduitIndex(produits) {
  const index = new Map();
  (produits || []).forEach(p => {
    if (p && p.id) index.set(p.id, p);
  });
  return index;
}

// Prix retenu pour un produit, en CHF par `produit.uniteRef`.
// Applique `strategiePrix` sur les références fournisseurs ; retombe sur le prix
// saisi à la main quand il n'y en a aucune.
export function resolvePrixProduit(produit) {
  if (!produit) return 0;

  // Le prix manuel du produit. `prixUnitaireManuel` porte la colonne brute ;
  // `prixUnitaire` est déjà pré-résolu par mapProduitFromDB (fournisseur
  // principal d'abord), il ne sert donc que de dernier repli.
  const manuel = produit.prixUnitaireManuel != null
    ? num(produit.prixUnitaireManuel)
    : num(produit.prixUnitaire);

  const strategie = produit.strategiePrix || 'max';
  if (strategie === 'manuel') return manuel;

  const refs = (produit.fournisseurs || [])
    .map(f => num(f.prixUnitaire))
    .filter(v => v > 0);

  if (!refs.length) return manuel;

  if (strategie === 'principal') {
    const principal = (produit.fournisseurs || []).find(f => f.estPrincipal && num(f.prixUnitaire) > 0);
    if (principal) return num(principal.prixUnitaire);
    return Math.max(...refs); // pas de principal désigné : on ne descend pas sous le plus cher
  }
  if (strategie === 'moyenne') {
    return refs.reduce((s, v) => s + v, 0) / refs.length;
  }
  return Math.max(...refs); // 'max', le défaut
}

// Détail du prix d'un ingrédient : d'où il vient, et si la conversion d'unité a pu se faire.
// `index` : Map produite par buildProduitIndex.
//
// `source` :
//   'catalogue'    prix vivant, converti dans l'unité de l'ingrédient
//   'fige'         repli sur ingredient.prixUnit (non lié, ou produit introuvable)
//   'incompatible' lié, mais les unités ne se convertissent pas (g vers pcs) : repli figé
//   'aucun'        rien de chiffrable
export function describePrixIngredient(ing, index) {
  const fige = num(ing?.prixUnit);
  if (!ing) return { prix: 0, source: 'aucun', produit: null };

  const produit = ing.produitId && index ? index.get(ing.produitId) : null;
  if (!produit) {
    return { prix: fige, source: fige > 0 ? 'fige' : 'aucun', produit: null };
  }

  const prixCatalogue = resolvePrixProduit(produit);
  const uniteCat = produit.uniteRef || 'g';
  const uniteIng = ing.unite || uniteCat;

  const converti = convertPrix(prixCatalogue, uniteCat, uniteIng);
  if (converti === null) {
    return { prix: fige, source: 'incompatible', produit };
  }
  return { prix: converti, source: 'catalogue', produit };
}

// Prix d'un ingrédient en CHF par `ing.unite`. Version courte pour les boucles de calcul.
export function resolvePrixIngredient(ing, index) {
  return describePrixIngredient(ing, index).prix;
}

// Coût matière d'une recette, en CHF pour la totalité des portions.
export function computeCoutMatiere(ingredients, index) {
  return (ingredients || []).reduce(
    (s, i) => s + num(i.quantite) * resolvePrixIngredient(i, index),
    0,
  );
}

// Lie un produit du catalogue à un ingrédient existant.
//
// Le nom de l'ingrédient n'est JAMAIS écrasé : « Filet de boeuf » reste
// « Filet de boeuf » même si le produit s'appelle « FILET BOEUF IRL 2KG VAC ».
// Un nom de recette est du vocabulaire de cuisine, pas une référence fournisseur.
//
// L'unité de l'ingrédient est conservée quand elle est convertible, et `prixUnit`
// est aligné dessus comme repli hors-ligne. Le calcul de coût, lui, repasse par
// le catalogue via `produitId`.
export function applyProductToIngredient(ing, product) {
  if (!product) return ing;
  const uniteCat = product.uniteRef || 'g';
  const prixCat = resolvePrixProduit(product);

  let unite = uniteCat;
  let prixUnit = prixCat;
  if (ing?.unite && ing.unite !== uniteCat) {
    const converti = convertPrix(prixCat, uniteCat, ing.unite);
    if (converti !== null) {
      unite = ing.unite;
      prixUnit = converti;
    }
  }

  const next = {
    ...ing,
    unite,
    prixUnit: Math.round(prixUnit * 1e6) / 1e6,
    produitId: product.id,
  };
  delete next.needsReview;
  delete next.matchSuggestions;
  return next;
}
