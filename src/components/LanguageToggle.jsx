import React from 'react';
import { useLanguage } from '../hooks/useLanguage.js';

// Bascule « Original » (français, tel que saisi) ↔ « English » (traduction à la
// volée du DOM). Le composant porte data-no-translate : ses propres libellés ne
// doivent jamais être traduits, sinon on ne sait plus dans quel mode on est.
//
// Desktop : segments explicites. Mobile : bouton 44×44 comme le thème et la
// cloche, le header n'a pas la place d'un segment complet (et la page ne doit
// jamais pouvoir défiler horizontalement).
export default function LanguageToggle({ compact = false }) {
  const { lang, translating, setLang, toggleLang } = useLanguage();
  const isEn = lang === 'en';

  if (compact) {
    return (
      <button
        type="button"
        data-no-translate=""
        style={{ ...s.compact, ...(isEn ? s.compactActive : null) }}
        onClick={(e) => { e.stopPropagation(); toggleLang(); }}
        aria-label={isEn ? 'Afficher le texte original (français)' : 'Translate this app to English'}
        title={isEn ? 'Afficher le texte original' : 'Translate to English'}
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
        style={{ ...s.seg, ...(isEn ? s.segActive : null) }}
        onClick={(e) => { e.stopPropagation(); setLang('en'); }}
        aria-pressed={isEn}
        title="Translate this app to English"
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
