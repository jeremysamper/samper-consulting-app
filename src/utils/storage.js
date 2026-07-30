export const DATA_VERSION = '4';

export const UI_STORAGE_KEYS = {
  page: 'sc_page',
  consultantToolsTab: 'sc_consultant_tools_tab',
  theme: 'sc_theme',
  lang: 'sc_lang'
};

export function readJson(key, fallback = null) {
  if (typeof localStorage === 'undefined') return fallback;

  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota or privacy mode. UI should remain usable.
  }
}

export function readText(key, fallback = '') {
  if (typeof localStorage === 'undefined') return fallback;

  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeText(key, value) {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage quota or privacy mode. UI should remain usable.
  }
}

export function removeStorageKeys(keys) {
  if (typeof localStorage === 'undefined') return;

  keys.forEach((key) => {
    try {
      localStorage.removeItem(key);
    } catch {
      // Best effort cleanup.
    }
  });
}
