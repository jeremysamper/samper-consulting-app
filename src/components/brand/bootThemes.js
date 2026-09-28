/**
 * Séquence de l'écran de chargement « Bienvenue » (BootScreen.jsx).
 *
 * `shots` : les photos, dans l'ordre des coupes ; la dernière reste affichée.
 * Choix et ordre de Jérémy : dressage aux gants verts, dressage au gant,
 * puis le canard en image de fin (photo d'appareil, 2400 px).
 *
 * BOOT_THEMES reste une liste pour pouvoir remettre une rotation
 * hebdomadaire plus tard, en ajoutant des entrées.
 *
 * `focus` : object-position des photos. `dim` : bande sombre sous le texte.
 *
 * Pour changer les photos : node scripts/gen-boot-photos.mjs <dossier>, puis
 * les importer ici avec la teinte (`tone`) affichée par le script.
 */
import canardJus from './boot-photos/bienvenue-canard-jus.webp';
import chefDressage from './boot-photos/bienvenue-chef-dressage.webp';
import chefMains from './boot-photos/bienvenue-chef-mains.webp';

// `tone` : teinte moyenne de la photo, fond tant qu'elle charge.
const P = {
  canardJus: { src: canardJus, tone: '#694c30' },
  chefDressage: { src: chefDressage, tone: '#64574a' },
  chefMains: { src: chefMains, tone: '#314f3c' },
};

export const BOOT_THEMES = [
  {
    shots: [P.chefMains, P.chefDressage, P.canardJus],
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
