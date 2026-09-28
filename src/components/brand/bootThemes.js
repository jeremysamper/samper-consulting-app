/**
 * Photo de l'écran de chargement « Bienvenue » (BootScreen.jsx).
 *
 * `shots` : les photos, dans l'ordre des coupes ; la dernière reste affichée.
 * Choix de Jérémy : une seule photo, le dressage au gant, agrandie en 4K
 * (node scripts/gen-boot-photos.mjs <dossier> --4k ; l'original ne fait que
 * 1179×1468). Remplacer par le fichier d'appareil si on le retrouve.
 *
 * BOOT_THEMES reste une liste pour pouvoir remettre une rotation
 * hebdomadaire plus tard, en ajoutant des entrées.
 *
 * `focus` : object-position de la photo. `dim` : bande sombre sous le texte.
 */
import chefDressage from './boot-photos/bienvenue-chef-dressage-4k.webp';

// `tone` : teinte moyenne de la photo, fond tant qu'elle charge.
const P = {
  chefDressage: { src: chefDressage, tone: '#64574a' },
};

export const BOOT_THEMES = [
  {
    shots: [P.chefDressage],
    focus: '50% 50%',
    dim: 0.28,
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
