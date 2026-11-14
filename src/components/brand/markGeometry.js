// Géométrie du logo Jouanet.
//
// Source de vérité UNIQUE : ce fichier est lu à la fois par le composant React
// (src/components/brand/SamperMark.jsx, affiché dans l'app) et par le script de
// génération des assets (scripts/gen-icons.mjs, qui fabrique les PNG du
// manifest, le favicon.svg et le favicon.ico). Modifier le tracé ou une couleur
// ici, relancer `npm run brand:icons`, et tout reste cohérent. Le pré-splash de
// vite-index.html recopie le même tracé en dur (il s'affiche avant tout
// JavaScript) : le mettre à jour à la main quand ce fichier change.
//
// Construction : un losange plein aux coins arrondis, tenu par deux crochets
// pleins qui se répondent par une symétrie centrale. Chaque crochet a un grand
// côté épais terminé par un petit retour, et un petit côté plus fin qui
// s'effile vers son bout rond. Redessiné le 14.11.2026 en aplats, mesuré sur le
// modèle de Jérémy (losange tourné de 45° pour relever épaisseurs et rayons,
// puis remis droit) ; il remplace le losange à pales au trait du 29.10.2026.
// Le tracé occupe toute la grille 24 : MARK_INSET le ramène dans la tuile.

// Version des fichiers d'icônes (suffixe des PNG : icon-192-v4.png).
// Incrémenter à chaque changement de logo : c'est le changement d'URL dans le
// manifest qui déclenche la mise à jour de la vignette chez les utilisateurs
// déjà installés (voir scripts/gen-icons.mjs). Le front la lit aussi, pour
// savoir s'il doit encore rappeler aux appareils iOS de rafraîchir leur
// raccourci (src/components/HomeScreenIconBanner.jsx).
// v4 (14.11.2026) : nom Jouanet, logo en aplats. Les PNG -v2 et -v3 restent
// servis tant que des installations peuvent encore les demander.
export const ICON_VERSION = 'v4';

export const BRAND_COLORS = {
  petrol: '#003042', // fond de marque (tuile, carte de visite)
  blade: '#175C82', // bleu des anciennes pales
  sand: '#C9BCA3', // sable
  cream: '#EFE8DD', // logo sur le fond pétrole
  shadow: '#04222D', // presque le fond, donne la profondeur
  // Le bleu le plus sombre de la marque, dans la teinte du pétrole : fond de
  // l'écran de chargement (BootScreen.jsx), du pré-splash de vite-index.html
  // et du lancement natif (background_color de public/manifest.json).
  abysse: '#000D13',
};

// Grille de référence de tous les tracés : 24 x 24 (viewBox « 0 0 24 24 »).
export const MARK_GRID = 24;

// Alias gardé pour les lecteurs qui raisonnent en « côté de la viewBox ».
export const MARK_VIEWBOX = MARK_GRID;

// Tracé du logo, à remplir (aucun trait) : crochet du haut, crochet du bas,
// losange central.
export const MARK_PATH =
  'M2.069 14.137L0.953 13.021A2.711 2.711 0 0 1 0.953 9.187L8.967 1.173A4.044 4.044 0 0 1 14.687 1.173L17.751 4.238A1.2 1.2 0 0 1 16.208 6.065L13.891 4.421C13.075 3.842 11.403 4.018 10.539 4.882L4.295 11.125A3.333 3.333 0 0 0 3.321 13.594A0.733 0.733 0 0 1 2.069 14.137Z' +
  'M21.931 9.863L23.047 10.979A2.711 2.711 0 0 1 23.047 14.813L15.033 22.827A4.044 4.044 0 0 1 9.313 22.827L6.249 19.762A1.2 1.2 0 0 1 7.792 17.935L10.109 19.579C10.925 20.158 12.597 19.982 13.461 19.118L19.705 12.875A3.333 3.333 0 0 0 20.679 10.406A0.733 0.733 0 0 1 21.931 9.863Z' +
  'M7.38 11.057L11.057 7.38A1.733 1.733 0 0 1 13.508 7.38L16.62 10.492A1.733 1.733 0 0 1 16.62 12.943L12.943 16.62A1.733 1.733 0 0 1 10.492 16.62L7.38 13.508A1.733 1.733 0 0 1 7.38 11.057Z';

// Part de la boîte occupée par le motif sur une tuile : 66 %, comme sur le
// modèle (marge maskable d'Android et d'iOS respectée : les pointes du losange
// restent dans le cercle de sécurité).
export const MARK_INSET = 0.66;

/**
 * Transformation qui inscrit le motif dans la boîte : réduction à MARK_INSET
 * (fois `scale`) autour du centre de la grille.
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
 * @param {string}  color      couleur du logo : crème par défaut sur un fond,
 *                             currentColor sans fond
 */
export function buildMarkSvg({
  size = 512,
  background = BRAND_COLORS.petrol,
  radius = 0,
  scale = 1,
  color,
} = {}) {
  const V = MARK_GRID;
  const hasBackground = Boolean(background) && background !== 'none';
  const bg = hasBackground
    ? `<rect width="${V}" height="${V}"${radius ? ` rx="${radius}" ry="${radius}"` : ''} fill="${background}"/>`
    : '';
  const fill = color || (hasBackground ? BRAND_COLORS.cream : 'currentColor');
  const mark = `<g transform="${markTransform(scale)}"><path d="${MARK_PATH}" fill="${fill}"/></g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}">${bg}${mark}</svg>`;
}
