/**
 * dice-coefficient.js - Score de similarité Dice sur bigrammes
 *
 * Algorithme :
 *   1. Normaliser les deux chaînes (normalizeString)
 *   2. Construire l'ensemble des bigrammes de chaque chaîne
 *   3. Dice = 2 × |A ∩ B| / (|A| + |B|) × 100
 *
 * Seuils (validés dans le brief J3) :
 *   ≥ 85 → 'auto'      (badge vert  🟢)
 *   50–84 → 'suggested' (badge jaune 🟡)
 *   < 50  → 'manual'   (badge gris  ⚪)
 */

import { normalizeString } from './normalize-string.js';

/** Score minimum pour un auto-match */
export const THRESHOLD_AUTO      = 85;
/** Score minimum pour une suggestion */
export const THRESHOLD_SUGGESTED = 50;

/**
 * Construit l'ensemble des bigrammes d'une chaîne normalisée.
 * "risotto" → Set { "ri","is","so","ot","tt","to" }
 *
 * @param {string} str
 * @returns {Set<string>}
 */
function bigrams(str) {
  const set = new Set();
  for (let i = 0; i < str.length - 1; i++) {
    set.add(str.slice(i, i + 2));
  }
  return set;
}

/**
 * Coefficient Dice entre deux chaînes DÉJÀ normalisées.
 * Retourne un entier 0–100.
 *
 * @param {string} a  Chaîne normalisée
 * @param {string} b  Chaîne normalisée
 * @returns {number}  0–100
 */
export function diceCoefficient(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;

  const bgA = bigrams(a);
  const bgB = bigrams(b);

  if (bgA.size === 0 || bgB.size === 0) return 0;

  let intersection = 0;
  for (const bg of bgA) {
    if (bgB.has(bg)) intersection++;
  }

  return Math.round((2 * intersection / (bgA.size + bgB.size)) * 100);
}

/**
 * Score Dice entre un nom de plat POS et un nom de recette,
 * avec normalisation automatique des deux chaînes.
 *
 * @param {string} posName     Nom du plat côté POS
 * @param {string} recipeName  Nom de la recette
 * @returns {number}           0–100
 */
export function diceScore(posName, recipeName) {
  return diceCoefficient(normalizeString(posName), normalizeString(recipeName));
}

/**
 * Statut de matching basé sur le score.
 *
 * @param {number} score  0–100
 * @returns {'auto'|'suggested'|'manual'}
 */
export function getMatchStatus(score) {
  if (score >= THRESHOLD_AUTO)      return 'auto';
  if (score >= THRESHOLD_SUGGESTED) return 'suggested';
  return 'manual';
}
