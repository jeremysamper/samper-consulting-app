import { useEffect, useSyncExternalStore } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

const THEMES = new Set(['light', 'dark']);

function readInitialTheme() {
  // 1. Préférence enregistrée par l'utilisateur → toujours prioritaire
  const stored = readText(UI_STORAGE_KEYS.theme, '');
  if (THEMES.has(stored)) return stored;

  // 2. data-theme déjà posé sur <html> (rendu serveur ou init précoce)
  const documentElement = getBrowserWindow()?.document?.documentElement;
  const current = documentElement?.getAttribute('data-theme');
  if (THEMES.has(current)) return current;

  // 3. Aucune préférence sauvegardée → respecter le thème système (prefers-color-scheme)
  //    Évite le flash blanc au premier lancement en dark system.
  //    Le CSS @media (prefers-color-scheme: dark) :root:not([data-theme="light"]) a déjà appliqué
  //    les variables en dark - on doit aligner l'état JS en conséquence.
  try {
    const prefersDark = getBrowserWindow()?.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    if (prefersDark) return 'dark';
  } catch (_) {}

  return 'light';
}

// Un seul état pour toute l'app : le bouton de la barre du haut, la palette et
// la section « Apparence » des réglages lisent et écrivent la même valeur, les
// trois sont toujours d'accord.
let themeCourant = null;
const abonnes = new Set();
const lire = () => {
  if (themeCourant === null) themeCourant = readInitialTheme();
  return themeCourant;
};
const sAbonner = (fn) => { abonnes.add(fn); return () => abonnes.delete(fn); };
function ecrire(next) {
  const valeur = THEMES.has(next) ? next : 'light';
  if (valeur === lire()) return;
  themeCourant = valeur;
  abonnes.forEach((fn) => fn());
}

export function useTheme() {
  const theme = useSyncExternalStore(sAbonner, lire, () => 'light');

  useEffect(() => {
    const documentElement = getBrowserWindow()?.document?.documentElement;
    if (!documentElement) return;

    documentElement.setAttribute('data-theme', theme);
    writeText(UI_STORAGE_KEYS.theme, theme);
  }, [theme]);

  function setTheme(nextTheme) {
    ecrire(nextTheme);
  }

  function toggleTheme() {
    ecrire(lire() === 'dark' ? 'light' : 'dark');
  }

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme
  };
}
