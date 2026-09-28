/**
 * Séquence de l'écran de chargement « Bienvenue » (BootScreen.jsx).
 *
 * Choix et ordre de Jérémy : quatre photos défilent (`layers`, dans l'ordre
 * d'apparition), la cinquième est l'image de fin (`hero`) qui porte le mot.
 * Une seule séquence : BOOT_THEMES reste une liste pour pouvoir remettre une
 * rotation hebdomadaire plus tard, en ajoutant des entrées.
 *
 * Image de fin = photo haute définition (le canard, fichier d'appareil,
 * 2400 px) : elle reste affichée, une photo de téléphone y paraîtrait floue.
 *
 * `focus` : object-position de l'image de fin. Sur ordinateur, une photo en
 * portrait n'en montre qu'une bande horizontale : le focus choisit laquelle.
 * `dim` : voile sombre sous le mot, plus fort sur les photos claires.
 *
 * Pour changer les photos : node scripts/gen-boot-photos.mjs <dossier>, puis
 * les importer ici avec la teinte (`tone`) affichée par le script.
 */
import assietteBleue from './boot-photos/bienvenue-assiette-bleue.webp';
import canardJus from './boot-photos/bienvenue-canard-jus.webp';
import chefDressage from './boot-photos/bienvenue-chef-dressage.webp';
import chefMains from './boot-photos/bienvenue-chef-mains.webp';
import pavlova from './boot-photos/bienvenue-pavlova.webp';

// `tone` : teinte moyenne de la photo, couleur du calque tant qu'elle charge.
const P = {
  assietteBleue: { src: assietteBleue, tone: '#5d656c' },
  canardJus: { src: canardJus, tone: '#694c30' },
  chefDressage: { src: chefDressage, tone: '#64574a' },
  chefMains: { src: chefMains, tone: '#314f3c' },
  pavlova: { src: pavlova, tone: '#312e3a' },
};

export const BOOT_THEMES = [
  {
    layers: [P.chefDressage, P.pavlova, P.chefMains, P.assietteBleue],
    hero: P.canardJus,
    focus: '50% 50%',
    dim: 0.26,
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
