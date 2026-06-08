/**
 * Génère les icônes PWA pour Samper Consulting.
 * Logo : initiales "SC" sur fond vert très foncé (#0f1a12), lettres vert sauge (#82b27f).
 *
 * Usage : node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

// Tailles standard : 72, 96, 128, 144 → icônes classiques (fond arrondi)
// 192, 512 → maskable (plein cadre, contenu dans les 80% centraux)
const REGULAR = [72, 96, 128, 144];
const MASKABLE = [192, 512];
const ALL = [...REGULAR, ...MASKABLE];

const BG    = '#0f1a12';
const FG    = '#82b27f'; // vert Samper, signature couleur

/**
 * SVG pour icône classique (fond arrondi, adapté standalone).
 * Le radius = 22% de la taille pour un look "app icon" iOS/Android.
 */
function makeSvgRegular(size) {
  const r     = Math.round(size * 0.22);
  const fs    = Math.round(size * 0.40);
  const y     = Math.round(size * 0.645);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" fill="${BG}"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="700" font-size="${fs}" fill="${FG}">SC</text>
</svg>`;
}

/**
 * SVG pour icône maskable (plein cadre — Android applique sa propre forme).
 * Le contenu doit tenir dans les 80% centraux (safe zone).
 * On met le texte à ~36% de la taille pour être bien dans la safe zone.
 */
function makeSvgMaskable(size) {
  const fs = Math.round(size * 0.36);
  const y  = Math.round(size * 0.62);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text x="${size / 2}" y="${y}" text-anchor="middle"
    font-family="Georgia, 'Times New Roman', serif"
    font-weight="700" font-size="${fs}" fill="${FG}">SC</text>
</svg>`;
}

for (const size of ALL) {
  const isMaskable = MASKABLE.includes(size);
  const svg        = isMaskable ? makeSvgMaskable(size) : makeSvgRegular(size);
  const outPath    = path.join(iconsDir, `icon-${size}.png`);

  await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9 })
    .toFile(outPath);

  console.log(`✓ icon-${size}.png  [${isMaskable ? 'maskable' : 'regular'}]`);
}

console.log(`\nDone — ${ALL.length} icons in public/icons/`);
