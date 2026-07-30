import React from 'react';
import { useLanguage } from '../hooks/useLanguage.js';
import { notify } from './toast/index.js';

const DEGRADED_MSG = 'Traduction partielle : le service de traduction est injoignable. '
  + "Seuls les libellés courants sont traduits, le contenu des fiches reste en français.";

// Bascule « Original » (français, tel que saisi) ↔ « English » (traduction à la
// volée du DOM). Le composant porte data-no-translate : ses propres libellés ne
// doivent jamais être traduits, sinon on ne sait plus dans quel mode on est.
//
// Desktop : segments explicites. Mobile : bouton 44×44 comme le thème et la
// cloche, le header n'a pas la place d'un segment complet (et la page ne doit
// jamais pouvoir défiler horizontalement).
export default function LanguageToggle({ compact = false }) {
  const { lang, translating, degraded, setLang, toggleLang } = useLanguage();
  const isEn = lang === 'en';

  // Alerte une seule fois par bascule en dégradé : sans ce signal, l'app a
  // l'air à moitié traduite sans qu'on sache pourquoi.
  const wasDegraded = React.useRef(false);
  React.useEffect(() => {
    if (degraded && !wasDegraded.current) notify(DEGRADED_MSG, 'warning');
    wasDegraded.current = degraded;
  }, [degraded]);

  const enTitle = degraded
    ? 'Traduction partielle : service injoignable'
    : 'Translate this app to English';

  if (compact) {
    return (
      <button
        type="button"
        data-no-translate=""
        style={{ ...s.compact, ...(isEn ? s.compactActive : null), ...(isEn && degraded ? s.compactDegraded : null) }}
        onClick={(e) => { e.stopPropagation(); toggleLang(); }}
        aria-label={isEn ? 'Afficher le texte original (français)' : 'Translate this app to English'}
        title={isEn ? (degraded ? enTitle : 'Afficher le texte original') : 'Translate to English'}
      >
        {isEn ? 'EN' : 'FR'}
        {translating && <span style={s.dot} />}
      </button>
    );
  }

  return (
    <div style={s.group} data-no-translate="" role="group" aria-label="Langue d'affichage">
      <button
        type="button"
        style={{ ...s.seg, ...(isEn ? null : s.segActive) }}
        onClick={(e) => { e.stopPropagation(); setLang('fr'); }}
        aria-pressed={!isEn}
        title="Afficher le texte original, tel que saisi"
      >
        Original
      </button>
      <button
        type="button"
        style={{ ...s.seg, ...(isEn ? s.segActive : null), ...(isEn && degraded ? s.segDegraded : null) }}
        onClick={(e) => { e.stopPropagation(); setLang('en'); }}
        aria-pressed={isEn}
        title={enTitle}
      >
        English
        {translating && <span style={s.dot} />}
      </button>
    </div>
  );
}

const s = {
  group: {
    display: 'flex',
    alignItems: 'stretch',
    border: '1px solid var(--border)',
    borderRadius: 8,
    overflow: 'hidden',
    flexShrink: 0,
    background: 'var(--surface)',
  },
  seg: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 12px',
    height: 42,
    flexShrink: 0,
    background: 'transparent',
    border: 'none',
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  segActive: { background: 'var(--accent)', color: '#fff' },
  // Traduction dégradée : l'ambre dit « ça marche, mais pas complètement ».
  segDegraded: { background: 'var(--warning-bg-soft)', color: 'var(--warning-text)' },
  compact: {
    position: 'relative',
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    flexShrink: 0,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 8,
    color: 'var(--text2)',
    fontFamily: 'var(--font)',
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: '0.02em',
    cursor: 'pointer',
  },
  compactActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: '#fff' },
  compactDegraded: {
    background: 'var(--warning-bg-soft)',
    borderColor: 'var(--warning-bd)',
    color: 'var(--warning-text)',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    background: 'currentColor',
    opacity: 0.75,
    position: 'absolute',
    top: 6,
    right: 6,
    animation: 'scLangPulse 1s ease-in-out infinite',
  },
};
