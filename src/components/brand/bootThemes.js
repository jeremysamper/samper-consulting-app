/**
 * Séquence de l'écran de chargement « Bienvenue » (BootScreen.jsx, modèle
 * « Ripple »).
 *
 * `shots` : les photos, dans l'ordre des coupes ; la dernière reste affichée.
 * Choisies pour ce modèle : sujet centré (l'onde part du centre), fond calme,
 * et une seule famille de couleur (ambre 29-32°, même séance photo, du clair
 * au sombre) pour que les coupes ne heurtent pas l'œil. Photos d'appareil
 * haute définition.
 *
 * BOOT_THEMES reste une liste pour pouvoir remettre une rotation
 * hebdomadaire plus tard, en ajoutant des entrées.
 *
 * `focus` : object-position des photos. `dim` : bande sombre sous le texte.
 *
 * Pour changer les photos : node scripts/gen-boot-photos.mjs <dossier>, puis
 * les importer ici avec la teinte (`tone`) affichée par le script.
 */
import brioche from './boot-photos/bienvenue-brioche.webp';
import canardJus from './boot-photos/bienvenue-canard-jus.webp';
import dessertCacao from './boot-photos/bienvenue-dessert-cacao.webp';

// `tone` : teinte moyenne de la photo, fond tant qu'elle charge.
const P = {
  brioche: { src: brioche, tone: '#725639' },
  canardJus: { src: canardJus, tone: '#694c30' },
  dessertCacao: { src: dessertCacao, tone: '#8f7454' },
};

export const BOOT_THEMES = [
  {
    shots: [P.dessertCacao, P.brioche, P.canardJus],
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
