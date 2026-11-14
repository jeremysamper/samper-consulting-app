import { useEffect, useSyncExternalStore } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Thème de l'app. Trois préférences, gardées dans sc_theme :
//   'light' | 'dark' : choisi par la personne, sur cet appareil ;
//   'system'         : comme l'appareil (prefers-color-scheme), suivi en direct.
// Sans préférence enregistrée, l'app suit l'appareil.
//
// Un seul état pour toute l'app : le bouton de la barre du haut, la palette et
// la section « Apparence » des réglages lisent et écrivent la même valeur, les
// trois sont toujours d'accord. Le bouton de la barre du haut bascule entre
// clair et sombre : il pose une préférence explicite.
// ─────────────────────────────────────────────────────────────────────────────

const PREFERENCES = new Set(['light', 'dark', 'system']);
const REQUETE_SOMBRE = '(prefers-color-scheme: dark)';

function appareilSombre() {
  try {
    return Boolean(getBrowserWindow()?.matchMedia?.(REQUETE_SOMBRE)?.matches);
  } catch (_) {
    return false;
  }
}

const resoudre = (preference) => (
  preference === 'light' || preference === 'dark' ? preference : (appareilSombre() ? 'dark' : 'light')
);

function lirePreferenceInitiale() {
  const stored = readText(UI_STORAGE_KEYS.theme, '');
  return PREFERENCES.has(stored) ? stored : 'system';
}

let etat = null; // { preference, theme }
const abonnes = new Set();
const lire = () => {
  if (etat === null) {
    const preference = lirePreferenceInitiale();
    etat = { preference, theme: resoudre(preference) };
  }
  return etat;
};
const ETAT_SERVEUR = { preference: 'system', theme: 'light' };
const lireServeur = () => ETAT_SERVEUR;

function ecrire(preference) {
  const valeur = PREFERENCES.has(preference) ? preference : 'system';
  const theme = resoudre(valeur);
  const courant = lire();
  if (valeur === courant.preference && theme === courant.theme) return;
  etat = { preference: valeur, theme };
  abonnes.forEach((fn) => fn());
}

// L'appareil change de thème (réglage du système, passage automatique du
// soir) : suivi seulement sous la préférence « comme l'appareil ».
let ecouteInstallee = false;
function installerEcoute() {
  if (ecouteInstallee) return;
  ecouteInstallee = true;
  try {
    const mq = getBrowserWindow()?.matchMedia?.(REQUETE_SOMBRE);
    if (!mq) return;
    const surChangement = () => { if (lire().preference === 'system') ecrire('system'); };
    // addEventListener n'existe sur MediaQueryList qu'à partir de Safari 14.
    if (mq.addEventListener) mq.addEventListener('change', surChangement);
    else mq.addListener?.(surChangement);
  } catch (_) { /* pas de matchMedia : le thème reste celui du démarrage */ }
}

const sAbonner = (fn) => {
  installerEcoute();
  abonnes.add(fn);
  return () => abonnes.delete(fn);
};

// Pose data-theme avant le premier rendu (main.jsx) : un appareil réglé en
// clair dont le système est sombre ne voit plus un écran sombre au démarrage.
export function appliquerThemeInitial() {
  const documentElement = getBrowserWindow()?.document?.documentElement;
  documentElement?.setAttribute('data-theme', lire().theme);
}

export function useTheme() {
  const { preference, theme } = useSyncExternalStore(sAbonner, lire, lireServeur);

  useEffect(() => {
    const documentElement = getBrowserWindow()?.document?.documentElement;
    if (!documentElement) return;

    documentElement.setAttribute('data-theme', theme);
    writeText(UI_STORAGE_KEYS.theme, preference);
  }, [theme, preference]);

  function setTheme(nextTheme) {
    ecrire(nextTheme);
  }

  function toggleTheme() {
    ecrire(lire().theme === 'dark' ? 'light' : 'dark');
  }

  return {
    theme,
    preference,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme
  };
}
