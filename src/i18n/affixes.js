// ════════════════════════════════════════════════════════════════
// Affixes d'une chaîne affichée : ce qui entoure ses premiers et derniers
// caractères alphanumériques (emoji, flèches, « + », « … », « . », « : »,
// parenthèse fermante…).
//
// Une seule définition pour le moteur (domTranslator.js), qui traduit le cœur
// puis rend les affixes tels quels, et pour le glossaire (glossary.js), qui
// indexe ses clés sur ce même cœur. Deux définitions finissent par diverger :
// c'est ce qui laissait « Chargement… » ou « Base de données indisponible. »
// dans le glossaire sans qu'aucun texte affiché ne les atteigne jamais.
// ════════════════════════════════════════════════════════════════
const WORDISH = /[\p{L}\p{N}]/u;

/**
 * Découpe « 🗑 Supprimer… » en { pre:'🗑 ', core:'Supprimer', post:'…' }.
 *
 * Isoler le cœur de la chaîne fait que « Supprimer », « 🗑 Supprimer » et
 * « Supprimer… » partagent la même entrée de glossaire et de cache : une seule
 * traduction au lieu de trois. Balayage linéaire volontaire - une version regex
 * backtrackait en O(n²) sur les textes longs (étapes de recette, notes).
 */
export function splitAffixes(text) {
  let start = 0;
  let end = text.length;
  while (start < end && !WORDISH.test(text[start])) start += 1;
  while (end > start && !WORDISH.test(text[end - 1])) end -= 1;
  return { pre: text.slice(0, start), core: text.slice(start, end), post: text.slice(end) };
}
