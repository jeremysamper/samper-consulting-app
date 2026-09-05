// ─────────────────────────────────────────────────────────────
// Recalcul des quantités d'une recette (mise à l'échelle).
//
// SOURCE UNIQUE des règles d'affichage et de saisie du recalcul, partagée
// par la fiche recette (Cartes & Recettes) et l'éditeur de recette (Outils
// consultant). Les deux surfaces avaient chacune leur modale « Calculateur »
// avec leur propre formatage : à chiffres égaux elles n'affichaient pas la
// même chose, et le facteur ne s'arrondissait pas pareil.
//
// Les deux entrées du recalcul restent celles d'origine :
//   · un nombre de portions voulu ;
//   · la quantité réelle d'un ingrédient, sur laquelle toute la recette se cale.
// L'une comme l'autre se ramènent à un nombre de portions, seule grandeur
// conservée par les modules appelants (le ratio en découle, et l'export PDF
// reflète alors exactement ce qui est à l'écran).
//
// Util pur (ni React ni DOM).
// ─────────────────────────────────────────────────────────────

/**
 * Quantité recalculée → texte court.
 * Les traces (0,4 g d'épice ÷ 3) doivent rester lisibles, les grosses
 * productions ne pas traîner de décimales inutiles.
 */
export function fmtQte(q) {
  if (!Number.isFinite(q)) return '';
  if (q === 0) return '0';
  if (Number.isInteger(q)) return String(q);
  if (Math.abs(q) < 1) return String(Math.round(q * 1000) / 1000);
  if (Math.abs(q) < 10) return String(Math.round(q * 100) / 100);
  return String(Math.round(q * 10) / 10);
}

/**
 * « 6 » ou « 6,67 » : les portions deviennent décimales dès que l'échelle est
 * posée depuis une quantité d'ingrédient plutôt que depuis un nombre rond.
 */
export function fmtPortions(p) {
  return String(Math.round(p * 100) / 100);
}

/**
 * Facteur affiché à côté de « Recalculé ». Sous 1 on garde trois décimales :
 * une division par trois vaut 0,333 et non « 0,33 ».
 */
export function fmtFacteur(ratio) {
  if (!Number.isFinite(ratio)) return '× 1';
  if (ratio < 1) return `× ${ratio.toFixed(3)}`;
  return `× ${Number.isInteger(ratio) ? ratio : ratio.toFixed(2)}`;
}

/**
 * Virgule décimale acceptée : c'est ce que la brigade tape sur un pavé iPad.
 * Renvoie NaN si la saisie n'est pas un nombre — les appelants testent `> 0`.
 */
export function parseNombre(txt) {
  return parseFloat(String(txt).replace(',', '.'));
}

/** Base de portions exploitable : jamais 0 ni undefined (division). */
export function basePortionsDe(recette) {
  const n = Number(recette?.portions);
  return n > 0 ? n : 1;
}

/**
 * L'échelle est-elle réellement posée ? Comparaison tolérante : un ratio
 * reconstruit depuis une quantité (750 / 500 × 4 / 4) ne retombe pas
 * exactement sur 1 en flottant.
 */
export function estRecalcule(ratio) {
  return Number.isFinite(ratio) && Math.abs(ratio - 1) > 1e-6;
}
