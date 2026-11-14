/**
 * Images de lancement iOS (apple-touch-startup-image) : un aplat du bleu
 * abysse (BRAND_COLORS.abysse), sans logo.
 *
 * Sans elles, l'ouverture de l'app installée montre l'icône là où elle est
 * posée sur l'écran d'accueil (souvent dans un coin) jusqu'au premier rendu de
 * la page, puis le logo apparaît au centre : le logo semble sauter. Avec un
 * aplat, iOS agrandit un panneau sombre, la page prend le relais sur la même
 * couleur et l'écran de chargement (BootScreen.jsx) trace le logo au centre.
 * Pas de logo dans l'image : il serait effacé puis retracé.
 *
 * iOS ne prend une image que si sa taille en pixels est exactement celle de
 * l'écran, d'où une image par taille d'appareil. Téléphones en portrait
 * seulement (leur écran d'accueil ne tourne pas), tablettes dans les deux sens.
 *
 * Usage : node scripts/gen-splash.mjs
 * Écrit public/splash/*.png et réécrit le bloc compris entre les marqueurs
 * splash:debut et splash:fin de vite-index.html. Chaque aplat pèse moins
 * d'un demi-ko : le précache du service worker les prend sans frais.
 */
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { BRAND_COLORS } from '../src/components/brand/markGeometry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'public', 'splash');
const htmlPath = path.join(root, 'vite-index.html');

// [largeur, hauteur] en points CSS (portrait), densité, appareils.
const PHONES = [
  [440, 956, 3, 'iPhone 16 et 17 Pro Max'],
  [420, 912, 3, 'iPhone Air'],
  [402, 874, 3, 'iPhone 16 Pro, 17 et 17 Pro'],
  [430, 932, 3, 'iPhone 14 Pro Max, 15 Plus et Pro Max, 16 Plus'],
  [393, 852, 3, 'iPhone 14 Pro, 15, 15 Pro, 16, 16e'],
  [428, 926, 3, 'iPhone 12 et 13 Pro Max, 14 Plus'],
  [390, 844, 3, 'iPhone 12, 13, 14 et leurs Pro'],
  [375, 812, 3, 'iPhone X, XS, 11 Pro, 12 et 13 mini'],
  [414, 896, 3, 'iPhone XS Max, 11 Pro Max'],
  [414, 896, 2, 'iPhone XR, 11'],
  [414, 736, 3, 'iPhone 8 Plus'],
  [375, 667, 2, 'iPhone 8, SE 2 et 3'],
  [320, 568, 2, 'iPhone SE 1'],
];

const TABLETS = [
  [1032, 1376, 2, 'iPad Pro 13 M4 et M5'],
  [1024, 1366, 2, 'iPad Pro 12,9, iPad Air 13'],
  [834, 1210, 2, 'iPad Pro 11 M4 et M5'],
  [834, 1194, 2, 'iPad Pro 11, iPad Air 11'],
  [820, 1180, 2, 'iPad Air 4 et 5, iPad 10 et 11'],
  [834, 1112, 2, 'iPad Air 3, iPad Pro 10,5'],
  [810, 1080, 2, 'iPad 7, 8 et 9'],
  [768, 1024, 2, 'iPad mini 5, iPad 9,7'],
  [744, 1133, 2, 'iPad mini 6 et 7'],
];

function entries() {
  const list = [];
  for (const [w, h, dpr, nom] of PHONES) list.push({ w, h, dpr, nom, orientation: 'portrait' });
  for (const [w, h, dpr, nom] of TABLETS) {
    list.push({ w, h, dpr, nom, orientation: 'portrait' });
    list.push({ w, h, dpr, nom, orientation: 'landscape' });
  }
  return list;
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const links = [];
  for (const e of entries()) {
    const portrait = e.orientation === 'portrait';
    const pxW = (portrait ? e.w : e.h) * e.dpr;
    const pxH = (portrait ? e.h : e.w) * e.dpr;
    const file = `lancement-${pxW}x${pxH}.png`;
    await sharp({ create: { width: pxW, height: pxH, channels: 3, background: BRAND_COLORS.abysse } })
      .png({ palette: true, colours: 2, compressionLevel: 9 })
      .toFile(path.join(outDir, file));
    const media = `(device-width: ${e.w}px) and (device-height: ${e.h}px) and (-webkit-device-pixel-ratio: ${e.dpr}) and (orientation: ${e.orientation})`;
    links.push(`    <link rel="apple-touch-startup-image" media="${media}" href="/splash/${file}" />`);
  }

  const html = readFileSync(htmlPath, 'utf8');
  const nl = html.includes('\r\n') ? '\r\n' : '\n';
  const start = '<!-- splash:debut -->';
  const end = '<!-- splash:fin -->';
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < a) throw new Error(`Marqueurs ${start} et ${end} introuvables dans vite-index.html`);
  const block = [start, ...links, `    ${end}`].join(nl);
  writeFileSync(htmlPath, html.slice(0, a) + block + html.slice(b + end.length));
  console.log(`${links.length} images écrites dans public/splash, vite-index.html mis à jour.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
