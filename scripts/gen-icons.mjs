/**
 * Génère les icônes PWA pour Samper Consulting.
 * Logo : initiales "SC" blanches sur fond bleu pétrole #003042 (couleur carte de visite).
 *
 * Usage : node scripts/gen-icons.mjs
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
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

const BG    = '#003042'; // bleu pétrole Samper, signature couleur (carte de visite)
const FG    = '#ffffff';

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

// ─── favicon.ico (racine) : conteneur ICO avec PNG embarqués (16/32/48) ───
// Format Vista+ : ICONDIR + ICONDIRENTRY[n] + blobs PNG bruts.
const ICO_SIZES = [16, 32, 48];
const pngs = [];
for (const size of ICO_SIZES) {
  pngs.push(await sharp(Buffer.from(makeSvgRegular(size))).png({ compressionLevel: 9 }).toBuffer());
}
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // réservé
header.writeUInt16LE(1, 2); // type 1 = icône
header.writeUInt16LE(ICO_SIZES.length, 4);
const entries = [];
let offset = 6 + 16 * ICO_SIZES.length;
ICO_SIZES.forEach((size, i) => {
  const e = Buffer.alloc(16);
  e.writeUInt8(size >= 256 ? 0 : size, 0); // largeur
  e.writeUInt8(size >= 256 ? 0 : size, 1); // hauteur
  e.writeUInt8(0, 2);  // palette
  e.writeUInt8(0, 3);  // réservé
  e.writeUInt16LE(1, 4);  // plans
  e.writeUInt16LE(32, 6); // bits/pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
writeFileSync(path.join(__dirname, '..', 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log('✓ favicon.ico  [16+32+48]');

console.log(`\nDone — ${ALL.length} icons in public/icons/ + favicon.ico`);
