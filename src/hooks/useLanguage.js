import { useEffect, useState } from 'react';
import {
  getLanguage, initTranslator, setEtablissement, setLanguage, subscribe, TARGET_LANGS,
} from '../i18n/domTranslator.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

// Le moteur n'est initialisé qu'une fois par chargement de page, même si
// plusieurs composants montent le hook.
let bootstrapped = false;

// 'fr' = mode Original ; toute valeur inconnue y retombe.
const normalizeLang = (lang) => (TARGET_LANGS.includes(lang) ? lang : 'fr');

function readInitialLang() {
  return normalizeLang(readText(UI_STORAGE_KEYS.lang, 'fr'));
}

/**
 * Mode d'affichage « Original » (français, tel que saisi), « English » ou
 * « Español » (traduction à la volée du DOM). Voir src/i18n/domTranslator.js
 */
export function useLanguage(etablissementId) {
  const [state, setState] = useState(() => ({ lang: getLanguage(), translating: false, degraded: false }));

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    if (!bootstrapped) {
      bootstrapped = true;
      initTranslator(readInitialLang());
    }
    return unsubscribe;
  }, []);

  // Périmètre du cache partagé. Changer d'établissement resynchronise.
  useEffect(() => {
    setEtablissement(etablissementId || null);
  }, [etablissementId]);

  function changeLang(next) {
    const lang = normalizeLang(next);
    writeText(UI_STORAGE_KEYS.lang, lang);
    setLanguage(lang);
  }

  return {
    lang: state.lang,
    translating: state.translating,
    // true = service de traduction injoignable : seul le glossaire s'applique.
    degraded: state.degraded,
    setLang: changeLang,
  };
}

export default useLanguage;
