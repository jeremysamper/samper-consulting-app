/**
 * normalize-string.js — Normalisation française pour le matching Dice
 *
 * Pipeline :
 *   1. Lowercase
 *   2. Ligatures françaises (œ→oe, æ→ae)
 *   3. NFD + suppression diacritiques (accents)
 *   4. Ponctuation / apostrophes → espace
 *   5. Tokenisation + suppression stop-words FR
 *   6. Rejoindre par espace
 *
 * Exemples :
 *   "Risotto au safran"            → "risotto safran"
 *   "Tartare de bœuf à l'italienne" → "tartare boeuf italienne"
 *   "BOUILLABAISSE"                → "bouillabaisse"
 */

/** Mots-outils français supprimés avant le calcul Dice */
const STOP_WORDS = new Set([
  'le', 'la', 'les', 'l',
  'de', 'du', 'des', 'd',
  'un', 'une',
  'au', 'aux',
  'et', 'ou', 'en',
  'à', 'a',
  'avec', 'sur', 'par', 'pour', 'sans', 'dans',
]);

/**
 * @param {string | null | undefined} str
 * @returns {string}  Tokens normalisés séparés par des espaces simples
 */
export function normalizeString(str) {
  if (!str || typeof str !== 'string') return '';

  return str
    .trim()
    .toLowerCase()
    // Ligatures non décomposables par NFD
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    // Décomposition NFD → suppression des diacritiques (combining marks)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // Tout caractère non alphanumérique → espace (apostrophes, tirets, virgules…)
    .replace(/[^a-z0-9\s]/g, ' ')
    // Tokeniser, filtrer les stop-words et les tokens vides
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w))
    .join(' ')
    .trim();
}
