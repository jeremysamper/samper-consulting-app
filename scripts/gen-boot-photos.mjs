/**
 * Prépare les photos de l'écran de chargement « Bienvenue »
 * (src/components/brand/BootScreen.jsx, thèmes dans bootThemes.js).
 *
 * Usage : node scripts/gen-boot-photos.mjs <dossier-des-photos> [--4k]
 *
 * --4k : agrandit chaque photo à 3840 px sur le grand côté (Lanczos +
 * accentuation douce, qualité 82) et ajoute « -4k » au nom. Un agrandissement
 * ne recrée pas le détail absent de l'original : c'est un pis-aller quand
 * seule une photo de téléphone existe. Mieux encore : un agrandissement ×4
 * par IA (Real-ESRGAN, voir bootThemes.js), ramené ensuite à 3840 px.
 *
 * Chaque .jpg / .jpeg / .png / .webp du dossier devient
 * src/components/brand/boot-photos/bienvenue-<nom-du-fichier>.webp :
 * 2400 px sur le grand côté (jamais agrandie), WebP qualité 80 (moins pour
 * les textures, plafond 420 Ko), orientation EXIF appliquée. 2400 px parce
 * qu'un téléphone récent affiche ~2500 pixels physiques en hauteur : à
 * 1600 px la photo était agrandie ×1,6 et paraissait molle.
 * Une photo source de moins de 1100 px sur son grand côté est refusée. Sous
 * ~2000 px, elle reste utilisable en bande de transition (vue en mouvement),
 * jamais en photo finale : voir bootThemes.js.
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
const upscale4k = process.argv.includes('--4k');

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

const MAX_BYTES = 420 * 1024;
const MIN_SOURCE_SIDE = 1100;

const toHex = ({ r, g, b }) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

const files = readdirSync(srcDir).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();

for (const file of files) {
  const slug = slugify(path.parse(file).name);
  const target = path.join(outDir, `bienvenue-${slug}${upscale4k ? '-4k' : ''}.webp`);
  if (upscale4k) {
    const info = await sharp(path.join(srcDir, file))
      .rotate()
      .resize({ width: 3840, height: 3840, fit: 'inside', kernel: 'lanczos3' })
      .sharpen({ sigma: 0.8, m1: 0.6, m2: 1.2 })
      .modulate({ saturation: 1.03 })
      .webp({ quality: 82, effort: 6 })
      .toFile(target);
    console.log(`${slug.padEnd(18)} ${info.width}×${info.height} 4k ${Math.round(info.size / 1024)} Ko`);
    continue;
  }
  // Étalonnage commun cuit dans le fichier (rien à calculer à l'affichage) :
  // +7 % de contraste, +10 % de saturation, 4 % plus sombre. Unifie des
  // photos d'origines différentes et adoucit la perte de détail.
  const source = sharp(path.join(srcDir, file))
    .rotate()
    .modulate({ saturation: 1.1 })
    .linear(1.07 * 0.96, -128 * 0.07 * 0.96);
  const meta = await sharp(path.join(srcDir, file)).rotate().metadata();
  if (Math.max(meta.width, meta.height) < MIN_SOURCE_SIDE) {
    console.warn(`${file} : ${meta.width}×${meta.height}, trop petite pour le plein écran, ignorée`);
    continue;
  }
  const { channels } = await source.clone().stats();
  // Les textures (granit, pierre) se compressent mal : on baisse la qualité,
  // puis la taille, par paliers jusqu'à passer sous 420 Ko. Le grain masque
  // la perte, et ces photos-là servent de transition, vues en mouvement.
  let buffer;
  let quality;
  search:
  for (const side of [2400, 2000, 1800, 1600]) {
    for (quality of [80, 74, 68, 62]) {
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
