/**
 * Prépare les photos de l'écran de chargement « Bienvenue »
 * (src/components/brand/BootScreen.jsx, thèmes dans bootThemes.js).
 *
 * Usage : node scripts/gen-boot-photos.mjs <dossier-des-photos>
 *
 * Chaque .jpg / .jpeg / .png / .webp du dossier devient
 * src/components/brand/boot-photos/bienvenue-<nom-du-fichier>.webp :
 * 1600 px sur le grand côté (jamais agrandie), WebP qualité 70 (moins pour
 * les textures, plafond 150 Ko), orientation EXIF appliquée.
 * Nommer les fichiers source d'après le plat (canard-jus.jpg) : c'est ce nom
 * qu'on retrouve dans bootThemes.js.
 *
 * Le préfixe « bienvenue- » n'est pas décoratif : c'est lui que la route de
 * cache du service worker reconnaît (vite.config.js) pour garder les photos
 * hors-ligne. Les .webp ne sont pas dans le précache, volontairement : seules
 * les six photos de la semaine sont téléchargées.
 *
 * Le script affiche aussi la teinte moyenne de chaque photo : c'est la
 * valeur `tone` de bootThemes.js, la couleur du calque tant que sa photo
 * n'est pas encore arrivée.
 */
import sharp from 'sharp';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'src', 'components', 'brand', 'boot-photos');
const srcDir = process.argv[2];

if (!srcDir) {
  console.error('Usage : node scripts/gen-boot-photos.mjs <dossier-des-photos>');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const slugify = (name) => name
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '');

const MAX_BYTES = 150 * 1024;

const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const files = readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

for (const file of files) {
  const slug = slugify(path.parse(file).name);
  const target = path.join(outDir, `bienvenue-${slug}.webp`);
  const source = sharp(path.join(srcDir, file)).rotate();
  const { channels } = await source.clone().stats();
  // Les textures (granit, pierre) se compressent mal : on baisse la qualité,
  // puis la taille, par paliers jusqu'à passer sous 150 Ko. Le grain masque
  // la perte, et ces photos-là servent de transition, vues en mouvement.
  let buffer;
  let quality;
  search:
  for (const side of [1600, 1400, 1200, 1000]) {
    for (quality of [70, 60, 50, 40]) {
      buffer = await source.clone()
        .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .webp({ quality, effort: 6 })
        .toBuffer();
      if (buffer.length <= MAX_BYTES) break search;
    }
  }
  writeFileSync(target, buffer);
  const { width, height } = await sharp(buffer).metadata();
  const tone = toHex({ r: channels[0].mean, g: channels[1].mean, b: channels[2].mean });
  console.log(`${slug.padEnd(18)} ${String(width).padStart(4)}×${String(height).padEnd(4)} q${quality} ${String(Math.round(buffer.length / 1024)).padStart(4)} Ko  tone ${tone}`);
}
