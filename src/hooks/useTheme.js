import { useEffect, useState } from 'react';
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

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    const documentElement = getBrowserWindow()?.document?.documentElement;
    if (!documentElement) return;

    documentElement.setAttribute('data-theme', theme);
    writeText(UI_STORAGE_KEYS.theme, theme);
  }, [theme]);

  function setTheme(nextTheme) {
    setThemeState(THEMES.has(nextTheme) ? nextTheme : 'light');
  }

  function toggleTheme() {
    setThemeState((current) => (current === 'dark' ? 'light' : 'dark'));
  }

  return {
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme
  };
}
