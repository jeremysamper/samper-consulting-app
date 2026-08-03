import { useState } from 'react';
import { ICON_VERSION } from './brand/markGeometry.js';
import { readText, UI_STORAGE_KEYS, writeText } from '../utils/storage.js';

/**
 * HomeScreenIconBanner
 *
 * iOS et iPadOS recopient l'icône dans le raccourci au moment de l'ajout à
 * l'écran d'accueil et ne relisent plus jamais le manifest ni les
 * apple-touch-icon. Un changement de logo est donc invisible sur la vignette
 * de ces appareils, et c'est le seul cas : Android et desktop se mettent à
 * jour seuls, et l'intérieur de l'app suit le bundle partout.
 *
 * La seule chose automatisable est donc le rappel. Ce bandeau ne s'affiche
 * qu'aux appareils concernés (iOS + app lancée depuis l'écran d'accueil),
 * une seule fois, et se tait dès qu'on l'a lu. Le repère stocké est la
 * version d'icônes en cours : un futur changement de logo (ICON_VERSION
 * incrémenté) le fera réapparaître tout seul.
 */
export default function HomeScreenIconBanner() {
  const [dismissed, setDismissed] = useState(
    () => readText(UI_STORAGE_KEYS.iconTipAck, '') === ICON_VERSION
  );
  const [concerned] = useState(() => isIos() && isStandalone());

  if (dismissed || !concerned) return null;

  const acknowledge = () => {
    writeText(UI_STORAGE_KEYS.iconTipAck, ICON_VERSION);
    setDismissed(true);
  };

  return (
    <div role="status" style={s.band}>
      <span style={s.text}>
        Nouveau logo Samper. Sur l&apos;écran d&apos;accueil, la vignette garde l&apos;ancien :
        iOS la fige au moment de l&apos;ajout. Pour l&apos;actualiser, appui long sur
        l&apos;icône pour la supprimer, puis rouvrir l&apos;app dans Safari et
        « Partager » puis « Sur l&apos;écran d&apos;accueil ».
      </span>
      <button type="button" onClick={acknowledge} style={s.button}>
        J&apos;ai compris
      </button>
    </div>
  );
}

// iPadOS 13+ se présente comme un Mac : le tactile est ce qui l'en distingue.
function isIos() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

// Lancée depuis l'écran d'accueil : `standalone` est le drapeau iOS, la
// media query couvre les autres cas. Dans un onglet Safari, il n'y a pas de
// vignette à rafraîchir, donc rien à dire.
function isStandalone() {
  if (typeof window === 'undefined') return false;
  if (window.navigator?.standalone === true) return true;
  return window.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

const s = {
  band: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: '8px 16px',
    background: 'var(--info-bg-soft, var(--info-bg))',
    borderBottom: '1.5px solid var(--info-bd, var(--info-text))',
    flexShrink: 0,
  },
  text: {
    fontSize: 12.5,
    fontWeight: 600,
    color: 'var(--info-text)',
    fontFamily: 'var(--font)',
    lineHeight: 1.4,
    textAlign: 'center',
  },
  button: {
    padding: '4px 12px',
    borderRadius: 6,
    border: '1.5px solid var(--info-text)',
    background: 'transparent',
    color: 'var(--info-text)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    fontFamily: 'var(--font)',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
};
