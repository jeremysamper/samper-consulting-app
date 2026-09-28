/**
 * Thèmes de l'écran de chargement « Bienvenue » (BootScreen.jsx) : un par
 * semaine, en rotation.
 *
 * Un thème = cinq photos de transition (`layers`, dans l'ordre d'apparition)
 * puis la photo finale (`hero`) qui porte le mot. Les transitions alternent
 * clair / sombre pour que chaque bande qui s'ouvre se détache de la
 * précédente, et la dernière contraste avec la photo finale.
 *
 * `focus` : object-position de la photo finale. Sur ordinateur, une photo en
 * portrait n'en montre qu'une bande horizontale : le focus choisit laquelle.
 * `dim` : voile sombre sous le mot, plus fort sur les photos claires.
 *
 * Pour ajouter des photos : node scripts/gen-boot-photos.mjs <dossier>, puis
 * les importer ici avec la teinte (`tone`) affichée par le script.
 */
import ardoiseProfil from './boot-photos/bienvenue-ardoise-profil.webp';
import ardoiseSombre from './boot-photos/bienvenue-ardoise-sombre.webp';
import bolSombre from './boot-photos/bienvenue-bol-sombre.webp';
import brioche from './boot-photos/bienvenue-brioche.webp';
import burger from './boot-photos/bienvenue-burger.webp';
import cailleRotie from './boot-photos/bienvenue-caille-rotie.webp';
import canardJus from './boot-photos/bienvenue-canard-jus.webp';
import chefDressage from './boot-photos/bienvenue-chef-dressage.webp';
import chefMains from './boot-photos/bienvenue-chef-mains.webp';
import croquetteOrge from './boot-photos/bienvenue-croquette-orge.webp';
import dessertCacao from './boot-photos/bienvenue-dessert-cacao.webp';
import granitBleu from './boot-photos/bienvenue-granit-bleu.webp';
import granitVin from './boot-photos/bienvenue-granit-vin.webp';
import mainBol from './boot-photos/bienvenue-main-bol.webp';
import pavlova from './boot-photos/bienvenue-pavlova.webp';
import poireauBrule from './boot-photos/bienvenue-poireau-brule.webp';
import poisson from './boot-photos/bienvenue-poisson.webp';
import saumonCru from './boot-photos/bienvenue-saumon-cru.webp';
import saumonValence from './boot-photos/bienvenue-saumon-valence.webp';

// `tone` : teinte moyenne de la photo, couleur du calque tant qu'elle charge.
const P = {
  ardoiseProfil: { src: ardoiseProfil, tone: '#39342d' },
  ardoiseSombre: { src: ardoiseSombre, tone: '#39342d' },
  bolSombre: { src: bolSombre, tone: '#4a3e38' },
  brioche: { src: brioche, tone: '#725639' },
  burger: { src: burger, tone: '#6b5032' },
  cailleRotie: { src: cailleRotie, tone: '#948771' },
  canardJus: { src: canardJus, tone: '#694c30' },
  chefDressage: { src: chefDressage, tone: '#64574a' },
  chefMains: { src: chefMains, tone: '#314f3c' },
  croquetteOrge: { src: croquetteOrge, tone: '#8d7968' },
  dessertCacao: { src: dessertCacao, tone: '#8f7454' },
  granitBleu: { src: granitBleu, tone: '#798085' },
  granitVin: { src: granitVin, tone: '#777474' },
  mainBol: { src: mainBol, tone: '#694e34' },
  pavlova: { src: pavlova, tone: '#312e3a' },
  poireauBrule: { src: poireauBrule, tone: '#5e4a2c' },
  poisson: { src: poisson, tone: '#a27d53' },
  saumonCru: { src: saumonCru, tone: '#9a8f77' },
  // 498 px seulement : jamais en photo finale, jamais en première bande (la
  // seule qui reste longtemps seule à l'écran). En milieu de séquence, son
  // flou passe pour un effet, comme le portrait flou du modèle.
  saumonValence: { src: saumonValence, tone: '#93856f' },
};

export const BOOT_THEMES = [
  {
    layers: [P.saumonCru, P.canardJus, P.ardoiseSombre, P.poisson, P.chefMains],
    hero: P.brioche,
    focus: '50% 52%',
    dim: 0.34,
  },
  {
    layers: [P.cailleRotie, P.bolSombre, P.dessertCacao, P.pavlova, P.burger],
    hero: P.chefDressage,
    focus: '50% 42%',
    dim: 0.2,
  },
  {
    layers: [P.granitBleu, P.chefMains, P.poisson, P.bolSombre, P.saumonCru],
    hero: P.ardoiseSombre,
    focus: '50% 36%',
    dim: 0.3,
  },
  {
    layers: [P.burger, P.mainBol, P.ardoiseProfil, P.saumonValence, P.granitVin],
    hero: P.pavlova,
    focus: '50% 12%',
    dim: 0.4,
  },
  {
    layers: [P.saumonCru, P.chefDressage, P.dessertCacao, P.ardoiseProfil, P.cailleRotie],
    hero: P.canardJus,
    focus: '50% 50%',
    dim: 0.26,
  },
  {
    layers: [P.poisson, P.croquetteOrge, P.bolSombre, P.saumonValence, P.granitBleu],
    hero: P.chefMains,
    focus: '50% 50%',
    dim: 0.18,
  },
  {
    layers: [P.cailleRotie, P.pavlova, P.brioche, P.chefDressage, P.saumonCru],
    hero: P.bolSombre,
    focus: '50% 45%',
    dim: 0.34,
  },
  {
    layers: [P.granitVin, P.ardoiseSombre, P.dessertCacao, P.chefMains, P.burger],
    hero: P.poireauBrule,
    focus: '50% 45%',
    dim: 0.34,
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

/** Numéro de semaine ISO 8601 (celle du calendrier suisse). */
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY_MS + 1) / 7);
}

/**
 * Thème de la semaine de `date`. Tout le monde voit le même la même semaine,
 * il change le lundi. `index` force un thème (aperçu en dev).
 */
export function bootThemeFor(date = new Date(), index = null) {
  const count = BOOT_THEMES.length;
  const weeks = Math.round((mondayOf(date) - ROTATION_START) / (7 * DAY_MS));
  const i = index ?? weeks;
  return { ...BOOT_THEMES[((i % count) + count) % count], week: isoWeek(date) };
}
