import { useEffect, useState } from 'react';
import { bootThemeFor } from './bootThemes.js';

/**
 * Écran de chargement « Bienvenue ».
 *
 * Une photo plein écran (bootThemes.js ; s'il y en a plusieurs, elles
 * s'enchaînent en coupe franche). Elle bouge à peine, comme filmée caméra à
 * la main : dérive lente, micro-zoom et infime rotation (.bv-drift dans
 * app.css, transform seul, animé par le GPU). Texte fixe à mi-hauteur :
 * « Bienvenue » à gauche, la signature à droite.
 *
 * Déroulé :
 *  - 'wait'   : noir le temps que les photos soient décodées (1,2 s au plus) ;
 *  - 'play'   : l'enchaînement, une fois par onglet (sessionStorage). Un
 *               rechargement dans la même session passe directement à
 *               'static' ;
 *  - 'static' : la dernière photo, fixe (aussi en mouvement réduit).
 *
 * L'écran reste au moins jusqu'à la fin de l'enchaînement, puis s'efface en
 * fondu dès que l'app est prête. Toucher l'écran passe l'intro. L'app se
 * monte dessous pendant ce temps.
 *
 * @param {boolean}  loading    démarrage encore en cours (auth, modules)
 * @param {string}   title      étape en cours, annoncée aux lecteurs d'écran
 *                              et affichée si le chargement s'éternise
 * @param {Function} onFinished appelé à la fin du fondu de sortie (stable)
 */

// Coupes franches : départ de chaque photo, en ms (s'il y en a plusieurs).
const SHOT_STARTS = [0, 800, 1600];
// Fin de l'intro : le mot et la photo ont eu le temps d'être vus.
const INTRO_MS = 1800;
// Attente maximale des photos avant de lancer l'intro quand même.
const PHOTO_WAIT_MS = 1200;
const EXIT_MS = 380;
const SEEN_KEY = 'sc_bienvenue_vue';

function readPreviewIndex() {
  if (!import.meta.env.DEV) return null;
  try {
    const value = new URLSearchParams(location.search).get('bienvenue');
    return value === null ? null : Number(value) || 0;
  } catch {
    return null;
  }
}

// Aperçu en dev : /vite-index.html?bienvenue=0 rejoue l'intro à chaque
// chargement.
const previewIndex = readPreviewIndex();
const theme = bootThemeFor(new Date(), previewIndex);
const lastShot = theme.shots.length - 1;

function introSeen() {
  if (previewIndex !== null) return false;
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
  return introSeen() || prefersReducedMotion() ? 'static' : 'wait';
}

function decode(src) {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  return (img.decode ? img.decode() : new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; }))
    .catch(() => {});
}

// Satoshi chargée avant le texte : sans ça, « Bienvenue » s'affiche d'abord
// dans la police de secours puis saute à l'arrivée de Satoshi.
function fontsReady() {
  try {
    return Promise.all([
      document.fonts.load('700 56px Satoshi'),
      document.fonts.load('500 12px Satoshi'),
    ]).catch(() => {});
  } catch {
    return Promise.resolve();
  }
}

// Téléchargement lancé dès l'import du module, avant le premier rendu React.
// L'intro déjà vue dans cet onglet n'a besoin que de la dernière photo.
const photosReady = typeof Image === 'undefined'
  ? Promise.resolve()
  : Promise.all([
    ...(initialPhase() === 'wait' ? theme.shots : [theme.shots[lastShot]]).map((p) => decode(p.src)),
    fontsReady(),
  ]);

// Hauteur de la photo figée au montage, sur mobile, à la hauteur de l'écran.
// Au lancement de l'app installée, la fenêtre se recale souvent d'une barre
// (statut, navigation) juste après le premier affichage : une photo calée sur
// la fenêtre se recentrait alors d'un coup. Calée en haut sur la hauteur de
// l'écran, elle ne bouge plus ; le surplus éventuel est rogné en bas.
function stablePhotoHeight() {
  try {
    if (!matchMedia('(pointer: coarse)').matches) return null;
    const landscape = window.innerWidth > window.innerHeight;
    const screenHeight = landscape
      ? Math.min(window.screen.width, window.screen.height)
      : Math.max(window.screen.width, window.screen.height);
    return Math.max(window.innerHeight, screenHeight);
  } catch {
    return null;
  }
}

/**
 * La photo en plein écran, fond dans sa teinte tant qu'elle charge. Elle
 * n'apparaît (fondu court) qu'une fois entièrement chargée : jamais d'image
 * partielle ni de premier cadre mal cadré.
 */
function Shot({ shot, focus, height }) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div style={{ ...s.fill, background: shot.tone }} aria-hidden="true">
      <div style={{ ...s.photoBox, height: height ?? '100%' }}>
        <img
          ref={(el) => { if (el?.complete && el.naturalWidth) setLoaded(true); }}
          className={`bv-drift bv-photo${loaded ? ' bv-photo-in' : ''}`}
          src={shot.src}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
          style={{ ...s.photo, objectPosition: focus }}
        />
      </div>
    </div>
  );
}

export default function BootScreen({ loading = true, title = 'Connexion à votre espace', onFinished }) {
  const [phase, setPhase] = useState(initialPhase);
  const [introDone, setIntroDone] = useState(() => phase === 'static');
  const [shotIndex, setShotIndex] = useState(() => (phase === 'static' ? lastShot : 0));
  const [photoHeight] = useState(stablePhotoHeight);
  const leaving = introDone && !loading;

  // Photos décodées (ou délai écoulé) : l'intro démarre.
  useEffect(() => {
    if (phase !== 'wait') return undefined;
    let alive = true;
    const start = () => {
      if (alive) setPhase((current) => (current === 'wait' ? 'play' : current));
    };
    photosReady.then(start);
    const timer = setTimeout(start, PHOTO_WAIT_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') return undefined;
    markIntroSeen();
    const timers = SHOT_STARTS.slice(1, theme.shots.length)
      .map((at, i) => setTimeout(() => setShotIndex(i + 1), at));
    timers.push(setTimeout(() => setIntroDone(true), INTRO_MS));
    return () => timers.forEach(clearTimeout);
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
    setShotIndex(lastShot);
    setIntroDone(true);
  }

  return (
    <div
      className={`bv-root bv-${phase}${leaving ? ' bv-leaving' : ''}`}
      style={s.root}
      onPointerDown={skip}
      data-no-translate=""
    >
      {phase !== 'wait' && (
        <>
          <Shot shot={theme.shots[shotIndex]} focus={theme.focus} height={photoHeight} />
          <div style={s.scrim(theme.dim)} aria-hidden="true" />
          <div className="bv-text" style={s.textRow}>
            <p style={s.word}>Bienvenue</p>
            <p style={s.sign} aria-hidden="true">
              Samper Consulting
              <br />
              Gestion culinaire
            </p>
          </div>
        </>
      )}

      <div className="bv-status" style={s.status} role="status" aria-live="polite">
        <span>{title}</span>
        <span style={s.track} aria-hidden="true">
          <span className="bv-sweep" style={s.sweep} />
        </span>
      </div>
    </div>
  );
}

// Satoshi, la police de l'app (jeton --font de app.css), pour tout l'écran.
const FONT = 'var(--font)';

const s = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    overflow: 'hidden',
    background: '#000',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  fill: {
    position: 'absolute',
    inset: 0,
  },
  photoBox: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
  },
  scrim: (dim) => ({
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    // Bande sombre douce à mi-hauteur, sous le texte, et bords assombris.
    background: `linear-gradient(to bottom, rgba(0,0,0,0) 30%, rgba(0,0,0,${dim}) 50%, rgba(0,0,0,0) 70%), radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.3) 100%)`,
  }),
  textRow: {
    position: 'absolute',
    top: '50%',
    left: 'max(20px, env(safe-area-inset-left))',
    right: 'max(20px, env(safe-area-inset-right))',
    transform: 'translateY(-50%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    pointerEvents: 'none',
    color: '#fff',
    textShadow: '0 1px 2px rgba(0,0,0,0.25), 0 4px 24px rgba(0,0,0,0.35)',
  },
  word: {
    margin: 0,
    fontFamily: FONT,
    fontSize: 'clamp(26px, 7vw, 56px)',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.035em',
    whiteSpace: 'nowrap',
  },
  sign: {
    margin: 0,
    fontFamily: FONT,
    fontSize: 'clamp(9px, 1.6vw, 12px)',
    fontWeight: 500,
    lineHeight: 1.35,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  },
  status: {
    position: 'absolute',
    left: 'max(20px, env(safe-area-inset-left))',
    right: 'max(20px, env(safe-area-inset-right))',
    bottom: 'calc(20px + env(safe-area-inset-bottom))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    fontFamily: FONT,
    fontSize: 10.5,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.8)',
  },
  track: {
    width: 96,
    flexShrink: 0,
    height: 1,
    background: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  sweep: {
    display: 'block',
    height: '100%',
    width: '40%',
    background: '#fff',
  },
};
