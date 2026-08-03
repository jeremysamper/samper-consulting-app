import { MARK_SECTORS, MARK_VIEWBOX, sectorPoints, BRAND_COLORS } from './markGeometry.js';

/**
 * Logo Samper Consulting, rendu en SVG inline.
 *
 * Inline et non `<img src="/icons/...">` : aucune requête réseau, aucun risque
 * de cache navigateur périmé, et le logo s'affiche donc immédiatement, hors
 * ligne comme après une mise à jour. C'est aussi ce qui rend le changement de
 * logo instantané dans l'app pour tout le monde, la home screen iOS mise à part
 * (voir public/manifest.json).
 *
 * @param {number} size       côté en px
 * @param {string} background fond du carré, ou 'none' pour ne rendre que les pales
 * @param {number} radius     arrondi des coins en px (ignoré si background 'none')
 * @param {number} scale      agrandissement du motif (utile quand il n'y a pas de fond)
 */
export default function SamperMark({
  size = 40,
  background = BRAND_COLORS.petrol,
  radius = Math.round(size * 0.22),
  scale = 1,
  className,
  style,
  title = 'Samper Consulting',
}) {
  const V = MARK_VIEWBOX;
  const hasBackground = background && background !== 'none';
  // Rayon exprimé en px converti dans le repère de la viewBox.
  const rx = hasBackground ? (radius * V) / size : 0;
  // `title={null}` = marque décorative : le nom est déjà écrit à côté, inutile
  // de le faire annoncer deux fois par un lecteur d'écran.
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true' };

  return (
    <svg
      // xmlns explicite : sans lui, un SVG inline sérialisé (html2canvas, donc
      // exportElementToPdf) est illisible et le logo disparaît de l'export.
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox={`0 0 ${V} ${V}`}
      data-no-translate=""
      {...a11y}
    >
      {hasBackground && <rect width={V} height={V} rx={rx} ry={rx} fill={background} />}
      {MARK_SECTORS.map((sector) => (
        <polygon
          key={`${sector.from}-${sector.to}`}
          points={sectorPoints(sector, scale)}
          fill={sector.color}
        />
      ))}
    </svg>
  );
}
