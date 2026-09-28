/**
 * Thèmes de l'écran de chargement « Bienvenue » (BootScreen.jsx), en rotation
 * hebdomadaire.
 *
 * Un thème = cinq calques de transition (`layers`, dans l'ordre d'apparition)
 * puis la photo finale (`hero`) qui porte le mot. Sélection de Jérémy : cinq
 * photos seulement, intercalées avec des panneaux de direction artistique
 * (aplat de marque + monogramme) : photo, DA, photo, DA, photo, photo finale.
 *
 * Photo finale = photo haute définition uniquement (canard, dessert cacao :
 * photos d'appareil, 2400 px). Elle reste affichée : les trois photos de
 * téléphone (1170-1600 px) y seraient agrandies ×2 et paraîtraient floues ;
 * elles servent en transition, vues en mouvement.
 *
 * `focus` : object-position de la photo finale. Sur ordinateur, une photo en
 * portrait n'en montre qu'une bande horizontale : le focus choisit laquelle.
 * `dim` : voile sombre sous le mot, plus fort sur les photos claires.
 *
 * Pour ajouter des photos : node scripts/gen-boot-photos.mjs <dossier>, puis
 * les importer ici avec la teinte (`tone`) affichée par le script.
 */
import { BRAND_COLORS } from './markGeometry.js';
import canardJus from './boot-photos/bienvenue-canard-jus.webp';
import chefDressage from './boot-photos/bienvenue-chef-dressage.webp';
import chefMains from './boot-photos/bienvenue-chef-mains.webp';
import dessertCacao from './boot-photos/bienvenue-dessert-cacao.webp';
import pavlova from './boot-photos/bienvenue-pavlova.webp';

// `tone` : teinte moyenne de la photo, couleur du calque tant qu'elle charge.
const P = {
  canardJus: { src: canardJus, tone: '#694c30' },
  chefDressage: { src: chefDressage, tone: '#64574a' },
  chefMains: { src: chefMains, tone: '#314f3c' },
  dessertCacao: { src: dessertCacao, tone: '#8f7454' },
  pavlova: { src: pavlova, tone: '#312e3a' },
};

// Panneaux de direction artistique : les deux fonds de la marque.
const DA = {
  petrol: {
    tone: BRAND_COLORS.petrol,
    background: 'radial-gradient(120% 95% at 50% 45%, #00394c 0%, #003042 38%, #001620 100%)',
  },
  cream: {
    tone: BRAND_COLORS.cream,
    background: 'radial-gradient(120% 95% at 50% 45%, #f6f1e9 0%, #efe8dd 45%, #ddd2c1 100%)',
  },
};

export const BOOT_THEMES = [
  {
    layers: [P.chefMains, DA.petrol, P.pavlova, DA.cream, P.chefDressage],
    hero: P.canardJus,
    focus: '50% 50%',
    dim: 0.26,
  },
  {
    layers: [P.chefDressage, DA.cream, P.chefMains, DA.petrol, P.pavlova],
    hero: P.dessertCacao,
    focus: '50% 50%',
    dim: 0.36,
  },
];

const DAY_MS = 24 * 60 * 60 * 1000;

// Lundi 28 septembre 2026 : semaine de mise en ligne, premier thème.
const ROTATION_START = Date.UTC(2026, 8, 28);

/** Lundi de la semaine de `date` (date locale), en ms UTC à minuit. */
function mondayOf(date) {
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate() - daysSinceMonday);
}

/**
 * Thème de la semaine de `date`. Tout le monde voit le même la même semaine,
 * il change le lundi. `index` force un thème (aperçu en dev).
 */
export function bootThemeFor(date = new Date(), index = null) {
  const count = BOOT_THEMES.length;
  const weeks = Math.round((mondayOf(date) - ROTATION_START) / (7 * DAY_MS));
  const i = index ?? weeks;
  return BOOT_THEMES[((i % count) + count) % count];
}
