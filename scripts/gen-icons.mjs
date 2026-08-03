/**
 * Génère les icônes PWA + favicons de Samper Consulting à partir de la
 * géométrie du logo (src/components/brand/markGeometry.js), qui est aussi
 * celle rendue par le composant React. Un seul endroit à modifier.
 *
 * Usage : npm run brand:icons
 *
 * VERSIONNAGE DES FICHIERS (ICON_VERSION)
 * Les PNG portent un suffixe de version (icon-192-v2.png). C'est ce qui rend la
 * mise à jour automatique chez les utilisateurs qui ont déjà installé l'app :
 * Chrome ne compare pas les octets des icônes, il compare le manifest. Tant que
 * l'URL reste identique, l'icône installée ne bouge jamais. En changeant l'URL,
 * le manifest diffère, Chrome planifie une mise à jour du WebAPK (Android) ou
 * de l'app installée (desktop) et l'icône se met à jour toute seule.
 * Au prochain changement de logo : incrémenter ICON_VERSION et relancer.
 *
 * Ce que ce versionnage ne peut PAS faire : iOS et iPadOS figent l'icône au
 * moment de l'ajout à l'écran d'accueil et ne relisent jamais le manifest ni
 * les apple-touch-icon ensuite. Sur iPad, la seule façon de voir le nouveau
 * logo sur l'écran d'accueil est de retirer la vignette et de la rajouter.
 * Tout le reste (logo dans l'app, écran de démarrage, favicon) se met à jour
 * tout seul, y compris sur iOS, puisque le logo est un SVG inline du bundle.
 *
 * Les PNG sont en plein cadre (pas de coins arrondis) : Android et iOS
 * appliquent eux-mêmes leur masque. Des coins arrondis transparents dans le
 * fichier donneraient un arrondi dans l'arrondi, avec des coins parasites.
 * Seuls les favicons (onglet du navigateur, jamais masqués) sont arrondis.
 */
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildMarkSvg, BRAND_COLORS } from '../src/components/brand/markGeometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const iconsDir = path.join(rootDir, 'public', 'icons');
mkdirSync(iconsDir, { recursive: true });

export const ICON_VERSION = 'v2';

// 180 = apple-touch-icon iOS ; 192 et 512 sont les tailles maskable du manifest.
const SIZES = [72, 96, 128, 144, 180, 192, 512];

// Motif un peu agrandi sur les favicons : à 16 px, chaque pale ne fait que
// quelques pixels, le logo a besoin d'occuper davantage la boîte pour rester
// lisible dans l'onglet.
const FAVICON_SCALE = 1.12;
const FAVICON_RADIUS = 192; // sur la viewBox 1024, soit ~19 % du côté

const appIconSvg = (size) => buildMarkSvg({ size, background: BRAND_COLORS.petrol, radius: 0 });
const faviconSvg = (size) =>
  buildMarkSvg({ size, background: BRAND_COLORS.petrol, radius: FAVICON_RADIUS, scale: FAVICON_SCALE });

// ─── PNG du manifest + apple-touch-icon ───
for (const size of SIZES) {
  const outPath = path.join(iconsDir, `icon-${size}-${ICON_VERSION}.png`);
  await sharp(Buffer.from(appIconSvg(size))).png({ compressionLevel: 9 }).toFile(outPath);
  console.log(`✓ icons/icon-${size}-${ICON_VERSION}.png`);
}

// ─── favicon.svg (onglet, source vectorielle) ───
writeFileSync(path.join(rootDir, 'favicon.svg'), `${faviconSvg(64)}\n`, 'utf8');
console.log('✓ favicon.svg');

// ─── favicon.ico : conteneur ICO avec PNG embarqués (16/32/48) ───
// Format Vista+ : ICONDIR + ICONDIRENTRY[n] + blobs PNG bruts.
const ICO_SIZES = [16, 32, 48];
const pngs = [];
for (const size of ICO_SIZES) {
  pngs.push(await sharp(Buffer.from(faviconSvg(size))).png({ compressionLevel: 9 }).toBuffer());
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
  e.writeUInt8(0, 2); // palette
  e.writeUInt8(0, 3); // réservé
  e.writeUInt16LE(1, 4); // plans
  e.writeUInt16LE(32, 6); // bits/pixel
  e.writeUInt32LE(pngs[i].length, 8);
  e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  entries.push(e);
});
writeFileSync(path.join(rootDir, 'favicon.ico'), Buffer.concat([header, ...entries, ...pngs]));
console.log('✓ favicon.ico  [16+32+48]');

console.log(`\nTermine : ${SIZES.length} PNG (${ICON_VERSION}) + favicon.svg + favicon.ico`);
