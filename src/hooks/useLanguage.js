import { useEffect, useState } from 'react';
import { getLanguage, initTranslator, setLanguage, subscribe } from '../i18n/domTranslator.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

// Le moteur n'est initialisé qu'une fois par chargement de page, même si
// plusieurs composants montent le hook.
let bootstrapped = false;

function readInitialLang() {
  return readText(UI_STORAGE_KEYS.lang, 'fr') === 'en' ? 'en' : 'fr';
}

/**
 * Mode d'affichage « Original » (français, tel que saisi) ou « English »
 * (traduction à la volée du DOM). Voir src/i18n/domTranslator.js
 */
export function useLanguage() {
  const [state, setState] = useState(() => ({ lang: getLanguage(), translating: false }));

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    if (!bootstrapped) {
      bootstrapped = true;
      initTranslator(readInitialLang());
    }
    return unsubscribe;
  }, []);

  function changeLang(next) {
    const lang = next === 'en' ? 'en' : 'fr';
    writeText(UI_STORAGE_KEYS.lang, lang);
    setLanguage(lang);
  }

  return {
    lang: state.lang,
    isEnglish: state.lang === 'en',
    translating: state.translating,
    setLang: changeLang,
    toggleLang: () => changeLang(state.lang === 'en' ? 'fr' : 'en'),
  };
}

export default useLanguage;
