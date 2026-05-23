/**
 * useMatchSuggestions — Calcul des suggestions de matching côté client
 *
 * Pour chaque pos_item NON mappé, calcule le meilleur match Dice
 * parmi toutes les recettes disponibles.
 *
 * Retourne :
 *   { [pos_item_id]: { recipeId, recipeName, score } }
 *
 * Le calcul est synchrone (pas d'appel réseau) et mémorisé.
 * Re-calcul automatique si posItems, recettes ou mappings changent.
 */

import { useMemo } from 'react';
import { diceScore } from '../lib/dice-coefficient.js';
import { normalizeString } from '../lib/normalize-string.js';

/**
 * @param {Array<{ id: string, name: string }>} posItems
 * @param {Array<{ id: string, nom: string }>}  recettes
 * @param {{ [pos_item_id: string]: object }}   mappings  (items déjà mappés → ignorés)
 *
 * @returns {{ [pos_item_id: string]: { recipeId: string, recipeName: string, score: number } }}
 */
export function useMatchSuggestions(posItems, recettes, mappings) {
  return useMemo(() => {
    // Pas de données → retourne vide sans calcul
    if (!posItems.length || !recettes.length) return {};

    // Pré-normaliser les recettes une seule fois
    const normalizedRecipes = recettes.map((r) => ({
      id:         r.id,
      nom:        r.nom,
      normalized: normalizeString(r.nom),
    }));

    const result = {};

    for (const item of posItems) {
      // Plat déjà mappé → on calcule quand même (score affiché comme info)
      // mais on marque si le mapping existe
      const normalizedItem = normalizeString(item.name);

      let bestScore  = -1;
      let bestRecipe = null;

      for (const recipe of normalizedRecipes) {
        // Utilise diceCoefficient sur les chaînes déjà normalisées
        // (évite de re-normaliser item N fois)
        const score = diceScore(item.name, recipe.nom);
        if (score > bestScore) {
          bestScore  = score;
          bestRecipe = recipe;
        }
      }

      if (bestRecipe !== null) {
        result[item.id] = {
          recipeId:   bestRecipe.id,
          recipeName: bestRecipe.nom,
          score:      bestScore,
        };
      }
    }

    return result;
  }, [posItems, recettes, mappings]);
}
