import { useSyncExternalStore } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readText, writeText, removeStorageKeys } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Préférences de l'appareil (page Réglages, espace « Cet appareil ») : taille
// du texte, densité, couleur des actions, animations, contraste, page de
// démarrage, présentation de la coque, geste de retour par le bord.
//
// Chaque préférence est une clé du localStorage, valable pour ce poste. Les
// préférences d'apparence se posent en attributs sur <html> (data-texte,
// data-densite, data-accent, data-mouvement, data-contraste), seulement quand
// elles diffèrent de la valeur d'origine : sans attribut, l'app est celle
// d'avant, au pixel. Les règles qui les lisent sont dans app.css, section
// « Préférences de l'appareil » ; elles ne changent que des jetons (--t1 à
// --t6, --controle, --ligne, --accent...), jamais un écran, et une vue capturée
// en PDF les ignore.
//
// appliquerPreferences() est appelée au démarrage (main.jsx), avant le premier
// rendu : aucun écran ne s'affiche avec la mauvaise taille.
//
// Deux clés existaient avant, sans interface, et gardent leurs valeurs et
// leurs lecteurs : sc_shell (useShellMode) et sc_edge_swipe (EdgeSwipeBack).
// ─────────────────────────────────────────────────────────────────────────────

export const PREFERENCES = {
  texte: { cle: 'sc_pref_texte', attribut: 'data-texte', valeurs: ['petite', 'normale', 'grande', 'tres-grande'], origine: 'normale' },
  densite: { cle: 'sc_pref_densite', attribut: 'data-densite', valeurs: ['compacte', 'normale', 'aeree'], origine: 'normale' },
  accent: { cle: 'sc_pref_accent', attribut: 'data-accent', valeurs: ['petrole', 'bleu', 'vert', 'brique', 'prune', 'graphite'], origine: 'petrole' },
  mouvement: { cle: 'sc_pref_mouvement', attribut: 'data-mouvement', valeurs: ['normal', 'reduit'], origine: 'normal' },
  contraste: { cle: 'sc_pref_contraste', attribut: 'data-contraste', valeurs: ['normal', 'renforce'], origine: 'normal' },
  // Coque : 'auto' = choisie par la taille de l'écran (useShellMode).
  coque: { cle: 'sc_shell', valeurs: ['auto', 'ordinateur', 'tablette', 'telephone'], origine: 'auto' },
  // Geste de retour par le bord : 'auto' = seulement dans l'app installée sur
  // iPhone et iPad (EdgeSwipeBack).
  gesteBord: { cle: 'sc_edge_swipe', valeurs: ['auto', 'on', 'off'], origine: 'auto' },
  // Page ouverte au démarrage : 'derniere' = la dernière page visitée (comme
  // avant), sinon l'id d'une page (normalisé par App.jsx).
  demarrage: { cle: 'sc_pref_demarrage', origine: 'derniere' },
};

// Les préférences d'apparence, remises à leur origine par « Réinitialiser
// l'apparence ».
export const APPARENCE = ['texte', 'densite', 'accent', 'mouvement', 'contraste'];

function lireUne(nom) {
  const def = PREFERENCES[nom];
  const valeur = readText(def.cle, '');
  if (!valeur) return def.origine;
  if (def.valeurs && !def.valeurs.includes(valeur)) return def.origine;
  return valeur;
}

function lireToutes() {
  const res = {};
  Object.keys(PREFERENCES).forEach((nom) => { res[nom] = lireUne(nom); });
  return res;
}

// Une valeur à l'écran par changement : useSyncExternalStore exige le même
// objet tant que rien n'a changé.
let instantane = null;
const abonnes = new Set();
const lire = () => {
  if (instantane === null) instantane = lireToutes();
  return instantane;
};
const sAbonner = (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); };

export function appliquerPreferences() {
  const html = getBrowserWindow()?.document?.documentElement;
  if (!html) return;
  const prefs = lire();
  APPARENCE.forEach((nom) => {
    const def = PREFERENCES[nom];
    if (prefs[nom] === def.origine) html.removeAttribute(def.attribut);
    else html.setAttribute(def.attribut, prefs[nom]);
  });
}

function prevenir() {
  instantane = lireToutes();
  appliquerPreferences();
  abonnes.forEach((fn) => fn());
}

export function ecrirePreference(nom, valeur) {
  const def = PREFERENCES[nom];
  if (!def) return;
  if (def.valeurs && !def.valeurs.includes(valeur)) return;
  // La valeur d'origine retire la clé : un poste jamais réglé reste sans clé.
  if (!valeur || valeur === def.origine) removeStorageKeys([def.cle]);
  else writeText(def.cle, valeur);
  prevenir();
}

export function reinitialiserPreferences(noms) {
  removeStorageKeys(noms.map((nom) => PREFERENCES[nom]?.cle).filter(Boolean));
  prevenir();
}

export function usePreferences() {
  return useSyncExternalStore(sAbonner, lire, lire);
}

export const lirePreference = (nom) => lire()[nom];

// Page de démarrage, lue une fois au chargement de l'app (App.jsx). Un
// rechargement dans le même onglet (mise à jour, chunk perdu) garde la page où
// l'on était : seul un vrai démarrage ouvre la page choisie. Le marqueur vit
// dans sessionStorage, qui survit au rechargement et pas à la fermeture.
const MARQUEUR_SESSION = 'sc_session_demarree';
export function pageDeDemarrage() {
  const page = lireUne('demarrage');
  let dejaDemarree = false;
  try {
    const session = getBrowserWindow()?.sessionStorage;
    dejaDemarree = session?.getItem(MARQUEUR_SESSION) === '1';
    session?.setItem(MARQUEUR_SESSION, '1');
  } catch (e) { /* stockage de session indisponible : traité comme un démarrage */ }
  if (dejaDemarree || !page || page === 'derniere') return null;
  return page;
}
