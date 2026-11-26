import { useEffect, useState } from 'react';
import { getBrowserWindow } from '../legacy/legacyApi.js';
import { readText } from '../utils/storage.js';
import { useIsMobile } from './useIsMobile.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mode de présentation de la COQUE (barre latérale ou page d'accueil tactile).
// Décision distincte du seuil des modules : useIsMobile (768 px) reste le
// contrat des 17 modules qui en tirent leur présentation interne, ce hook ne le
// déplace pas, il l'ajoute.
//
//   ordinateur : barre latérale et header de bureau, inchangés
//   tablette   : 768 à 1399 px avec un écran tactile (any-pointer: coarse) :
//                tout iPad, clavier et trackpad branchés compris (le pointeur
//                principal devient alors fin, l'écran reste tactile). Borne
//                haute : un portable tactile de 1400 px et plus garde la coque
//                d'ordinateur ; le plus grand iPad fait 1376 px en paysage.
//   telephone  : moins de 768 px, même media query que useIsMobile
//
// Media queries seulement, jamais innerWidth (piège iPad décrit dans
// useIsMobile). Le navigateur intégré n'émule pas le pointeur tactile à la
// taille tablette : forçage de test et de dépannage, lu au chargement de la
// page (recharger après l'avoir posé) :
//   localStorage.sc_shell = 'ordinateur' | 'tablette' | 'telephone'
// ─────────────────────────────────────────────────────────────────────────────

export const MODES_COQUE = ['ordinateur', 'tablette', 'telephone'];
const QUERY_TABLETTE = '(min-width: 768px) and (max-width: 1399.98px) and (any-pointer: coarse)';

function lireForcage() {
  const valeur = readText('sc_shell', '');
  return MODES_COQUE.includes(valeur) ? valeur : null;
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    const browserWindow = getBrowserWindow();
    return Boolean(browserWindow?.matchMedia?.(query).matches);
  });

  useEffect(() => {
    const browserWindow = getBrowserWindow();
    if (!browserWindow?.matchMedia) return undefined;
    const mq = browserWindow.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    // addEventListener n'existe sur MediaQueryList qu'à partir de Safari 14.
    if (mq.addEventListener) {
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
    mq.addListener(handler);
    return () => mq.removeListener(handler);
  }, [query]);

  return matches;
}

export function useShellMode() {
  const [forcage] = useState(lireForcage);
  const telephone = useIsMobile();
  const tablette = useMediaQuery(QUERY_TABLETTE);
  if (forcage) return forcage;
  if (telephone) return 'telephone';
  if (tablette) return 'tablette';
  return 'ordinateur';
}

export const estTactile = (mode) => mode === 'tablette' || mode === 'telephone';
