import React from 'react';
import { useLanguage } from '../hooks/useLanguage.js';
import { notify } from './toast/index.js';

const DEGRADED_MSG = 'Traduction partielle : le service de traduction est injoignable. '
  + "Seuls les libellés courants sont traduits, le contenu des fiches reste en français.";

// Chaque mode s'annonce dans sa propre langue : un cuisinier hispanophone doit
// reconnaître « Español » sans lire le français.
const MODES = [
  { id: 'fr', label: 'Original', code: 'FR', title: 'Afficher le texte original, tel que saisi' },
  { id: 'en', label: 'English', code: 'EN', title: 'Translate this app to English' },
  { id: 'es', label: 'Español', code: 'ES', title: 'Traducir la aplicación al español' },
];

// Sélecteur de langue d'affichage : Original (français, tel que saisi),
// English ou Español (traduction à la volée du DOM). Le composant porte
// data-no-translate : ses propres libellés ne doivent jamais être traduits,
// sinon on ne sait plus dans quel mode on est.
//
// Desktop : segments explicites, en codes FR / EN / ES sous 1280 px (app.css).
// Mobile : bouton 44×44 comme le thème et la cloche, qui ouvre la liste des
// trois modes. Le header n'a pas la place d'un segment complet (et la page ne
// doit jamais pouvoir défiler horizontalement).
export default function LanguageToggle({ compact = false, etablissementId = null }) {
  const { lang, translating, degraded, setLang } = useLanguage(etablissementId);
  const current = MODES.find((m) => m.id === lang) || MODES[0];
  const translated = current.id !== 'fr';

  // Alerte une seule fois par bascule en dégradé : sans ce signal, l'app a
  // l'air à moitié traduite sans qu'on sache pourquoi.
  const wasDegraded = React.useRef(false);
  React.useEffect(() => {
    if (degraded && !wasDegraded.current) notify(DEGRADED_MSG, 'warning');
    wasDegraded.current = degraded;
  }, [degraded]);

  const titleFor = (mode) => (mode.id === lang && translated && degraded
    ? 'Traduction partielle : service injoignable'
    : mode.title);

  if (compact) {
    return <CompactPicker current={current} translating={translating} degraded={degraded} onPick={setLang} titleFor={titleFor} />;
  }

  return (
    <div style={s.group} data-no-translate="" role="group" aria-label="Langue d'affichage">
      {MODES.map((mode) => {
        const active = mode.id === lang;
        return (
          <button
            key={mode.id}
            type="button"
            lang={mode.id}
            style={{
              ...s.seg,
              ...(active ? s.segActive : null),
              ...(active && translated && degraded ? s.segDegraded : null),
            }}
            onClick={(e) => { e.stopPropagation(); setLang(mode.id); }}
            aria-pressed={active}
            aria-label={mode.label}
            title={titleFor(mode)}
          >
            {/* Libellé complet ou code selon la largeur (app.css, .lang-seg-*). */}
            <span className="lang-seg-full" aria-hidden="true">{mode.label}</span>
            <span className="lang-seg-code" aria-hidden="true">{mode.code}</span>
            {active && translated && translating && <span style={s.dot} />}
          </button>
        );
      })}
    </div>
  );
}

function CompactPicker({ current, translating, degraded, onPick, titleFor }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);
  const translated = current.id !== 'fr';

  // Fermeture au tap hors de la liste et sur Échap. Capture : le tap ne doit
  // pas d'abord déclencher le bouton qu'il vise sous la liste.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={s.compactWrap} data-no-translate="">
      <button
        type="button"
        style={{
          ...s.compact,
          ...(translated ? s.compactActive : null),
          ...(translated && degraded ? s.compactDegraded : null),
        }}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Langue d'affichage : ${current.label}`}
        title={titleFor(current)}
      >
        {current.code}
        {translating && <span style={s.dot} />}
      </button>
      {open && (
        <div style={s.menu} role="menu" aria-label="Langue d'affichage">
          {MODES.map((mode) => {
            const active = mode.id === current.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                lang={mode.id}
                style={{ ...s.menuItem, ...(active ? s.menuItemActive : null) }}
                onClick={(e) => { e.stopPropagation(); setOpen(false); onPick(mode.id); }}
                title={titleFor(mode)}
              >
                <span style={s.menuCode}>{mode.code}</span>
                <span style={s.menuLabel}>{mode.label}</span>
                {active && <span style={s.menuCheck} aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
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
  compactWrap: { position: 'relative', flexShrink: 0 },
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
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--border)',
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
  // Ancrée au bord droit du bouton : elle s'ouvre vers la gauche, donc reste
  // dans l'écran même sur un téléphone étroit.
  menu: {
    position: 'absolute',
    top: 'calc(100% + 6px)',
    right: 0,
    minWidth: 168,
    padding: 4,
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--r)',
    boxShadow: 'var(--sh-lg)',
    zIndex: 120,
    display: 'flex',
    flexDirection: 'column',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    minHeight: 44,
    flexShrink: 0,
    padding: '0 12px',
    background: 'transparent',
    border: 'none',
    borderRadius: 6,
    color: 'var(--text)',
    fontFamily: 'var(--font)',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'left',
    cursor: 'pointer',
  },
  menuItemActive: { background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 600 },
  menuCode: { width: 22, fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', color: 'var(--text3)' },
  menuLabel: { flex: 1 },
  menuCheck: { fontSize: 14, fontWeight: 700 },
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
