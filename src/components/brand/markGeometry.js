// Géométrie du logo Samper Consulting (moulin à 6 secteurs).
//
// Source de vérité UNIQUE : ce fichier est lu à la fois par le composant React
// (src/components/brand/SamperMark.jsx, affiché dans l'app) et par le script de
// génération des assets (scripts/generate-brand-assets.mjs, qui fabrique les PNG
// du manifest, le favicon.svg et le favicon.ico). Modifier une couleur ou un
// secteur ici, relancer `npm run brand:icons`, et tout reste cohérent.
//
// Construction : le motif est inscrit dans un losange (carré tourné à 45°) de
// demi-diagonale R centré dans la boîte. Ses 8 points de contour sont les 4
// sommets (N, E, S, O) et les 4 milieux d'arêtes (NE, SE, SO, NO). Chaque
// secteur est un triangle « centre + deux points de contour consécutifs ».
// Deux secteurs sur huit restent vides : c'est ce vide qui donne la rotation
// visuelle du moulin.

export const BRAND_COLORS = {
  petrol: '#003042', // fond de marque (carte de visite)
  blade: '#175C82', // pales bleues
  sand: '#C9BCA3', // pale sable
  cream: '#EFE8DD', // pale crème
  shadow: '#04222D', // pale d'ombre (presque le fond, donne la profondeur)
};

// Boîte de référence de tous les tracés : 1024 x 1024.
export const MARK_VIEWBOX = 1024;

const C = 512; // centre
const R = 341; // demi-diagonale du losange (66 % de la largeur, marge maskable OK)
const M = 171; // composante des points médians (R / 2, arrondi)

// Points de contour, nommés par leur orientation.
const P = {
  n: [C, C - R],
  ne: [C + M, C - M],
  e: [C + R, C],
  se: [C + M, C + M],
  s: [C, C + R],
  sw: [C - M, C + M],
  w: [C - R, C],
  nw: [C - M, C - M],
};

// Secteurs pleins, dans le sens horaire en partant du nord.
// L'ordre est signifiant : l'animation du splash les révèle dans cet ordre,
// ce qui dessine un balayage horaire.
// (les secteurs n -> ne et sw -> w sont volontairement laissés vides)
export const MARK_SECTORS = [
  { from: 'ne', to: 'e', color: BRAND_COLORS.blade },
  { from: 'e', to: 'se', color: BRAND_COLORS.cream },
  { from: 'se', to: 's', color: BRAND_COLORS.shadow },
  { from: 's', to: 'sw', color: BRAND_COLORS.blade },
  { from: 'w', to: 'nw', color: BRAND_COLORS.sand },
  { from: 'nw', to: 'n', color: BRAND_COLORS.blade },
];

/**
 * Points d'un secteur, en coordonnées de la viewBox 1024.
 * `scale` agrandit le motif autour du centre (1 = taille de référence).
 */
export function sectorPoints(sector, scale = 1) {
  // Arrondi au centième : évite les 893.9200000000001 dans le SVG généré.
  const round = (v) => Math.round(v * 100) / 100;
  const at = (key) => {
    const [x, y] = P[key];
    return `${round(C + (x - C) * scale)},${round(C + (y - C) * scale)}`;
  };
  return `${C},${C} ${at(sector.from)} ${at(sector.to)}`;
}

/**
 * Rend le logo en chaîne SVG autonome (utilisé côté Node pour fabriquer les
 * PNG et le favicon ; le composant React rend les mêmes polygones en JSX).
 *
 * @param {number}  size       côté du SVG en px
 * @param {string}  background couleur du fond, ou null pour un fond transparent
 * @param {number}  radius     rayon des coins, en unités de la viewBox 1024
 * @param {number}  scale      agrandissement du motif autour du centre
 */
export function buildMarkSvg({ size = 512, background = BRAND_COLORS.petrol, radius = 0, scale = 1 } = {}) {
  const V = MARK_VIEWBOX;
  const bg = background
    ? `<rect width="${V}" height="${V}"${radius ? ` rx="${radius}" ry="${radius}"` : ''} fill="${background}"/>`
    : '';
  const blades = MARK_SECTORS
    .map((sector) => `<polygon points="${sectorPoints(sector, scale)}" fill="${sector.color}"/>`)
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${V} ${V}">${bg}${blades}</svg>`;
}
