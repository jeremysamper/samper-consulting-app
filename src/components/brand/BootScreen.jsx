import { useEffect, useState } from 'react';
import { BRAND_COLORS, MARK_PATH } from './markGeometry.js';

/**
 * Écran de chargement : le logo Jouanet sur le bleu le plus sombre de la
 * marque (BRAND_COLORS.abysse).
 *
 * Déroulé de l'intro (phase 'play', une fois par onglet) :
 *  - le contour du logo se trace en traits fins, couleur sable ;
 *  - l'aplat apparaît en gris puis monte au crème, le logo respire à peine ;
 *  - le logo tient, deux lueurs très faibles dérivent dans les coins ;
 *  - l'intro finie ET l'app prête : le logo s'efface, puis l'écran.
 * Phase 'static' : le logo déjà plein. C'est le cas d'un rechargement dans le
 * même onglet (sessionStorage), du mouvement réduit, et d'un démarrage lent
 * où le pré-splash de vite-index.html montrait déjà le logo.
 *
 * Les animations vivent dans app.css (classes jl-*). Toucher l'écran passe
 * l'intro. L'app se monte dessous pendant ce temps.
 *
 * @param {boolean}  loading    démarrage encore en cours (auth, modules)
 * @param {string}   title      étape en cours, annoncée aux lecteurs d'écran
 *                              et affichée si le chargement s'éternise
 * @param {Function} onFinished appelé à la fin du fondu de sortie (stable)
 */

// Fin de l'intro : le logo est plein depuis 0,6 s.
const INTRO_MS = 1800;
// Sortie : le logo s'efface (320 ms), l'écran suit à 280 ms (340 ms). Doit
// rester égal à la fin de jlSortie dans app.css.
const EXIT_MS = 620;
// Délai d'apparition du logo du pré-splash (animation-delay de
// vite-index.html) : au-delà, le logo est déjà à l'écran, on ne le retrace pas.
const PRE_SPLASH_LOGO_MS = 900;
const SEEN_KEY = 'sc_intro_logo_vue';

// Les trois pièces du logo (crochet du haut, crochet du bas, losange), une par
// tracé : chacune porte son propre pointillé, donc son propre dessin.
const PIECES = MARK_PATH.split(/(?=M)/);

// Aperçu en dev : /vite-index.html?intro rejoue l'intro à chaque chargement.
const preview = (() => {
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(location.search).has('intro');
  } catch {
    return false;
  }
})();

function introSeen() {
  if (preview) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markIntroSeen() {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // Stockage indisponible (navigation privée) : l'intro rejouera, sans gravité.
  }
}

function prefersReducedMotion() {
  try {
    return matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function preSplashShowedLogo() {
  if (preview) return false;
  try {
    return Boolean(document.getElementById('pre-splash')) && performance.now() >= PRE_SPLASH_LOGO_MS;
  } catch {
    return false;
  }
}

function initialPhase() {
  return introSeen() || prefersReducedMotion() || preSplashShowedLogo() ? 'static' : 'play';
}

export default function BootScreen({ loading = true, title = 'Connexion à votre espace', onFinished }) {
  const [phase, setPhase] = useState(initialPhase);
  const [introDone, setIntroDone] = useState(() => phase === 'static');
  const leaving = introDone && !loading;

  useEffect(() => {
    if (phase !== 'play') return undefined;
    markIntroSeen();
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [phase]);

  // Sortie : fondu, puis démontage. Un chargement qui repart pendant le fondu
  // l'annule (leaving repasse à false, la minuterie est effacée).
  useEffect(() => {
    if (!leaving) return undefined;
    const timer = setTimeout(() => onFinished?.(), EXIT_MS);
    return () => clearTimeout(timer);
  }, [leaving, onFinished]);

  function skip() {
    if (phase === 'static') return;
    markIntroSeen();
    setPhase('static');
    setIntroDone(true);
  }

  return (
    <div
      className={`jl-root jl-${phase}${leaving ? ' jl-leaving' : ''}`}
      style={s.root}
      onPointerDown={skip}
      data-no-translate=""
    >
      <div className="jl-lueur jl-lueur-chaude" aria-hidden="true" />
      <div className="jl-lueur jl-lueur-froide" aria-hidden="true" />

      <svg
        className="jl-logo"
        style={s.logo}
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Jouanet"
      >
        {PIECES.map((d) => (
          <path key={d} className="jl-piece" d={d} pathLength="1" />
        ))}
      </svg>

      <div className="jl-status" style={s.status} role="status" aria-live="polite">
        <span>{title}</span>
        <span style={s.track} aria-hidden="true">
          <span className="jl-sweep" style={s.sweep} />
        </span>
      </div>
    </div>
  );
}

// Même taille que le logo du pré-splash (vite-index.html) : le relais entre
// les deux ne bouge pas d'un pixel.
const LOGO_SIZE = 'clamp(76px, 21vw, 116px)';

const s = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: BRAND_COLORS.abysse,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  logo: {
    position: 'relative',
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    display: 'block',
    overflow: 'visible',
  },
  status: {
    position: 'absolute',
    left: 'max(24px, env(safe-area-inset-left))',
    right: 'max(24px, env(safe-area-inset-right))',
    bottom: 'calc(24px + env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    fontFamily: 'var(--font)',
    fontSize: 12,
    letterSpacing: '0.02em',
    color: 'rgba(239, 232, 221, 0.62)',
  },
  track: {
    width: 64,
    flexShrink: 0,
    height: 1,
    background: 'rgba(239, 232, 221, 0.18)',
    overflow: 'hidden',
  },
  sweep: {
    display: 'block',
    height: '100%',
    width: '40%',
    background: BRAND_COLORS.cream,
  },
};
