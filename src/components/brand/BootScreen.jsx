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
 * même onglet (sessionStorage) et du mouvement réduit. Le pré-splash de
 * vite-index.html ne montre que le fond : ce composant est le seul à dessiner
 * le logo.
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

function initialPhase() {
  return introSeen() || prefersReducedMotion() ? 'static' : 'play';
}

// Mise en page stable. À l'ouverture de l'app installée sur iPad, la page est
// d'abord mise en page à une taille fausse (plus grande que l'écran, barre
// d'état non recouverte) pendant environ 0,3 s : un logo centré dans cette
// boîte apparaissait en bas à droite, puis sautait au centre (vidéo du
// 14.11.2026). Le logo reste caché et son animation en pause tant que la page
// n'a pas la taille de l'écran. Seulement pour l'app installée sur iOS
// (navigator.standalone) : ailleurs, la fenêtre fait la taille qu'elle veut.
// Une fenêtre d'iPadOS plus petite que l'écran ne correspond jamais : un
// redimensionnement suivi d'un court calme, ou le délai maximal, débloque.
const SETTLE_MAX_MS = 900;
const SETTLE_QUIET_MS = 200;
const SETTLE_POLL_MS = 80;

function layoutMatchesScreen() {
  try {
    if (!navigator.standalone) return true;
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    const long = Math.max(screen.width, screen.height);
    const short = Math.min(screen.width, screen.height);
    const near = (a, b) => Math.abs(a - b) <= 2;
    return (near(w, long) && near(h, short)) || (near(w, short) && near(h, long));
  } catch {
    return true;
  }
}

function useLayoutSettled() {
  const [settled, setSettled] = useState(layoutMatchesScreen);

  useEffect(() => {
    if (settled) return undefined;
    let quiet;
    const done = () => setSettled(true);
    const poll = setInterval(() => {
      if (layoutMatchesScreen()) done();
    }, SETTLE_POLL_MS);
    const onResize = () => {
      clearTimeout(quiet);
      if (layoutMatchesScreen()) done();
      else quiet = setTimeout(done, SETTLE_QUIET_MS);
    };
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const max = setTimeout(done, SETTLE_MAX_MS);
    return () => {
      clearInterval(poll);
      clearTimeout(quiet);
      clearTimeout(max);
      window.removeEventListener('resize', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
    };
  }, [settled]);

  return settled;
}

export default function BootScreen({ loading = true, title = 'Connexion à votre espace', onFinished }) {
  const [phase, setPhase] = useState(initialPhase);
  const [introDone, setIntroDone] = useState(() => phase === 'static');
  const settled = useLayoutSettled();
  const leaving = introDone && !loading;

  // L'intro ne compte qu'à partir d'une mise en page stable : c'est là que le
  // tracé démarre (les animations restent en pause avant, voir jl-attente).
  useEffect(() => {
    if (phase !== 'play' || !settled) return undefined;
    markIntroSeen();
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [phase, settled]);

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
      className={`jl-root jl-${phase}${settled ? '' : ' jl-attente'}${leaving ? ' jl-leaving' : ''}`}
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

// Environ un cinquième de la largeur au téléphone, plafonné sur tablette.
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
