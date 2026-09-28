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
 * Photo finale = photo haute définition uniquement (2000 px et plus sur le
 * grand côté, les photos d'appareil). Elle reste affichée : une photo de
 * téléphone (1200-1600 px) y est agrandie ×2 sur un téléphone récent et
 * paraît floue. Ces photos-là servent en transition, vues en mouvement, et
 * jamais en première bande (la seule qui reste un moment seule à l'écran).
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
};

export const BOOT_THEMES = [
  {
    layers: [P.poisson, P.canardJus, P.ardoiseSombre, P.saumonCru, P.chefMains],
    hero: P.brioche,
    focus: '50% 52%',
    dim: 0.34,
  },
  {
    layers: [P.dessertCacao, P.chefDressage, P.cailleRotie, P.bolSombre, P.burger],
    hero: P.canardJus,
    focus: '50% 50%',
    dim: 0.26,
  },
  {
    layers: [P.granitBleu, P.chefMains, P.poisson, P.pavlova, P.saumonCru],
    hero: P.ardoiseSombre,
    focus: '50% 36%',
    dim: 0.3,
  },
  {
    layers: [P.burger, P.mainBol, P.ardoiseProfil, P.croquetteOrge, P.dessertCacao],
    hero: P.bolSombre,
    focus: '50% 45%',
    dim: 0.34,
  },
  {
    layers: [P.granitVin, P.ardoiseSombre, P.cailleRotie, P.chefDressage, P.poisson],
    hero: P.poireauBrule,
    focus: '50% 45%',
    dim: 0.34,
  },
  {
    layers: [P.poisson, P.pavlova, P.brioche, P.chefMains, P.saumonCru],
    hero: P.mainBol,
    focus: '50% 45%',
    dim: 0.3,
  },
  {
    layers: [P.dessertCacao, P.bolSombre, P.croquetteOrge, P.canardJus, P.cailleRotie],
    hero: P.ardoiseProfil,
    focus: '50% 36%',
    dim: 0.3,
  },
  {
    layers: [P.burger, P.poireauBrule, P.granitBleu, P.saumonCru, P.chefMains],
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
