import { useEffect, useState } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

const THEMES = new Set(['light', 'dark']);

function readInitialTheme() {
  const stored = readText(UI_STORAGE_KEYS.theme, '');
  if (THEMES.has(stored)) return stored;

  const documentElement = getBrowserWindow()?.document?.documentElement;
  const current = documentElement?.getAttribute('data-theme');
  return THEMES.has(current) ? current : 'light';
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
