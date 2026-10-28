export const DATA_VERSION = '4';

export const UI_STORAGE_KEYS = {
  page: 'sc_page',
  consultantToolsTab: 'sc_consultant_tools_tab',
  // Dernier onglet des Outils consultant (préférence locale).
  consultantToolsLastTab: 'sc_consultant_tools_last_tab',
  // Onglet de l'espace Compte à ouvrir (clé ponctuelle, lue puis effacée), et
  // dernier onglet visité.
  compteTab: 'sc_compte_tab',
  compteLastTab: 'sc_compte_last_tab',
  // Fiche à ouvrir dans l'éditeur de Cartes & Recettes (clé ponctuelle posée
  // par « Modifier la fiche » du Chiffrage, lue puis effacée à l'arrivée).
  recettesEditer: 'sc_recettes_editer',
  theme: 'sc_theme',
  lang: 'sc_lang',
  // Version d'icônes pour laquelle l'appareil a lu le rappel « rafraîchir la
  // vignette de l'écran d'accueil » (iOS uniquement).
  iconTipAck: 'sc_icon_tip_ack'
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
