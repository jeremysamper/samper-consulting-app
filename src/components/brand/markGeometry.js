// Géométrie du logo Ritmo (« Losange à pales », au trait).
//
// Source de vérité UNIQUE : ce fichier est lu à la fois par le composant React
// (src/components/brand/SamperMark.jsx, affiché dans l'app) et par le script de
// génération des assets (scripts/gen-icons.mjs, qui fabrique les PNG du
// manifest, le favicon.svg et le favicon.ico). Modifier le tracé ou une couleur
// ici, relancer `npm run brand:icons`, et tout reste cohérent. Le pré-splash de
// vite-index.html recopie le même tracé en dur (il s'affiche avant tout
// JavaScript) : le mettre à jour à la main quand ce fichier change.
//
// Construction : le contour du losange (carré tourné à 45°) mordu par deux
// encoches carrées opposées, en un seul tracé fermé, sur la grille 24 des
// pictos lucide de l'app, trait 1,75, bouts et jointures ronds, sans
// remplissage. Choisi le 29.10.2026 ; il remplace le moulin à six secteurs
// du 03.08.2026.

// Version des fichiers d'icônes (suffixe des PNG : icon-192-v3.png).
// Incrémenter à chaque changement de logo : c'est le changement d'URL dans le
// manifest qui déclenche la mise à jour de la vignette chez les utilisateurs
// déjà installés (voir scripts/gen-icons.mjs). Le front la lit aussi, pour
// savoir s'il doit encore rappeler aux appareils iOS de rafraîchir leur
// raccourci (src/components/HomeScreenIconBanner.jsx).
// v3 (29.10.2026) : losange à pales au trait. Les PNG -v2 restent servis tant
// que des installations peuvent encore les demander ; à retirer plus tard.
export const ICON_VERSION = 'v3';

export const BRAND_COLORS = {
  petrol: '#003042', // fond de marque (tuile, carte de visite)
  blade: '#175C82', // bleu des anciennes pales
  sand: '#C9BCA3', // sable
  cream: '#EFE8DD', // trait du logo sur le fond pétrole
  shadow: '#04222D', // presque le fond, donne la profondeur
};

// Grille de référence de tous les tracés : 24 x 24 (viewBox « 0 0 24 24 »).
export const MARK_GRID = 24;

// Alias gardé pour les lecteurs qui raisonnent en « côté de la viewBox ».
export const MARK_VIEWBOX = MARK_GRID;

// Tracé unique du losange à pales, sur la grille 24.
export const MARK_PATH =
  'M12 4.41L12 7A1.5 1.5 0 0 0 13.5 8.5L17.88 8.5A1.5 1.5 0 0 1 18.94 8.94' +
  'L20.94 10.94A1.5 1.5 0 0 1 20.94 13.06L13.06 20.94A1.5 1.5 0 0 1 10.94 20.94' +
  'L8.94 18.94A1.5 1.5 0 0 1 8.5 17.88L8.5 13.5A1.5 1.5 0 0 0 7 12L4.41 12' +
  'A1 1 0 0 1 3.71 10.29L10.29 3.71A1 1 0 0 1 12 4.41Z';

// Épaisseur du trait, en unités de la grille (celle des pictos lucide).
export const MARK_STROKE = 1.75;

// Part de la boîte occupée par le motif sur une tuile : 66 % (marge maskable
// d'Android et d'iOS respectée).
export const MARK_INSET = 0.66;

/**
 * Transformation qui inscrit le motif dans la boîte : réduction à MARK_INSET
 * (fois `scale`) autour du centre de la grille. Le trait suit l'échelle.
 */
export function markTransform(scale = 1) {
  // Arrondi au millième : évite les 4.080000000000001 dans le SVG généré.
  const round = (v) => Math.round(v * 1000) / 1000;
  const s = round(MARK_INSET * scale);
  const t = round((MARK_GRID - MARK_GRID * s) / 2);
  return `translate(${t} ${t}) scale(${s})`;
}

/**
 * Rend le logo en chaîne SVG autonome (utilisé côté Node pour fabriquer les
 * PNG et le favicon ; le composant React rend le même rect, le même groupe et
 * le même tracé en JSX).
 *
 * @param {number}  size       côté du SVG en px
 * @param {string}  background couleur du fond, ou null / 'none' pour un fond transparent
 * @param {number}  radius     rayon des coins, en unités de la grille 24
 * @param {number}  scale      agrandissement du motif autour du centre
 * @param {string}  stroke     couleur du trait : crème par défaut sur un fond,
 *                             currentColor sans fond
 */
export function buildMarkSvg({
  size = 512,
  background = BRAND_COLORS.petrol,
  radius = 0,
  scale = 1,
  stroke,
} = {}) {
  const V = MARK_GRID;
  const hasBackground = Boolean(background) && background !== 'none';
  const bg = hasBackground
    ? `<rect width="${V}" height="${V}"${radius ? ` rx="${radius}" ry="${radius}"` : ''} fill="${background}"/>`
    : '';
  const color = stroke || (hasBackground ? BRAND_COLORS.cream : 'currentColor');
  const mark =
    `<g transform="${markTransform(scale)}">` +
    `<path d="${MARK_PATH}" fill="none" stroke="${color}" stroke-width="${MARK_STROKE}"` +
    ' stroke-linecap="round" stroke-linejoin="round"/></g>';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}">${bg}${mark}</svg>`;
}
