import { useEffect, useState } from 'react';
import { bootThemeFor } from './bootThemes.js';

/**
 * Écran de chargement « Bienvenue » — modèle « Ripple ».
 *
 * La photo est vue à travers des anneaux concentriques centrés sur l'écran :
 * chaque anneau est la même photo, très légèrement agrandie ou réduite, et
 * les anneaux « respirent » en décalé, ce qui fait courir une onde de verre
 * du centre vers les bords. Les photos s'enchaînent en coupe franche
 * (bootThemes.js), la dernière reste. Texte fixe à mi-hauteur : « Bienvenue »
 * à gauche, la signature à droite, comme dans le modèle vidéo.
 *
 * Fluidité : chaque anneau est un disque (border-radius + overflow hidden)
 * dont seule la photo intérieure est animée en transform, que le GPU anime
 * seul. Aucun repeint pendant l'onde ; un repeint des disques à chaque coupe.
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

// Coupes franches : départ de chaque photo, en ms (rythme du modèle, ~0,8 s).
const SHOT_STARTS = [0, 800, 1600];
// Fin de l'intro : la dernière photo a eu le temps d'être vue.
const INTRO_MS = 2400;
// Attente maximale des photos avant de lancer l'intro quand même.
const PHOTO_WAIT_MS = 1200;
const EXIT_MS = 380;
const SEEN_KEY = 'sc_bienvenue_vue';
// Nombre d'anneaux de l'onde. Le modèle en montre une dizaine, mais chaque
// anneau se redessine à chaque image : mesuré CPU ×4, 6 anneaux perdent
// 7 images sur 2,2 s, 8 en perdent 35, 12 en perdent 70. Ne pas monter
// sans remesurer.
const RINGS = 6;

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

// Téléchargement lancé dès l'import du module, avant le premier rendu React.
// L'intro déjà vue dans cet onglet n'a besoin que de la dernière photo.
const photosReady = typeof Image === 'undefined'
  ? Promise.resolve()
  : Promise.all((initialPhase() === 'wait' ? theme.shots : [theme.shots[lastShot]]).map((p) => decode(p.src)));

/**
 * L'onde : la photo en plein écran, puis des disques de plus en plus petits
 * posés dessus, chacun portant la même photo alignée sur l'écran. Chaque
 * disque ne laisse voir que son anneau (le disque suivant couvre le centre).
 */
function Ripple({ shot, focus, animated }) {
  return (
    <div style={s.fill} aria-hidden="true">
      <div style={{ ...s.fill, background: shot.tone }}>
        <img src={shot.src} alt="" draggable={false} style={{ ...s.photo, objectPosition: focus }} />
      </div>
      {Array.from({ length: RINGS }, (_, i) => {
        // Du plus grand (i = 0) au plus petit, en fraction de la diagonale.
        const size = `calc(var(--bv-diag) * ${((RINGS - i) / RINGS).toFixed(4)})`;
        return (
          <div key={i} style={{ ...s.disc, width: size, height: size }}>
            <img
              className={animated ? 'bv-ring' : undefined}
              src={shot.src}
              alt=""
              draggable={false}
              style={{
                ...s.photo,
                ...s.ringPhoto,
                objectPosition: focus,
                // Onde qui part du centre : les petits anneaux d'abord.
                animationDelay: `${-(RINGS - i) * 220}ms`,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}

export default function BootScreen({ loading = true, title = 'Connexion à votre espace', onFinished }) {
  const [phase, setPhase] = useState(initialPhase);
  const [introDone, setIntroDone] = useState(() => phase === 'static');
  const [shotIndex, setShotIndex] = useState(() => (phase === 'static' ? lastShot : 0));
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
          <Ripple shot={theme.shots[shotIndex]} focus={theme.focus} animated={phase === 'play'} />
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
    // Diagonale de l'écran : le plus grand anneau couvre les coins.
    '--bv-diag': 'calc(max(100vw, 100vh) * 1.42)',
  },
  fill: {
    position: 'absolute',
    inset: 0,
  },
  photo: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    objectFit: 'cover',
    display: 'block',
  },
  disc: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    borderRadius: '50%',
    overflow: 'hidden',
    // Liseré clair au bord de chaque anneau : l'effet « verre » du modèle.
    // Fixe, peint une seule fois.
    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.16), inset 0 0 18px rgba(255,255,255,0.06)',
  },
  // Dans un disque, la photo reste alignée sur l'écran : son coin haut-gauche
  // est ramené au coin de l'écran, et elle grossit autour du centre de l'écran.
  ringPhoto: {
    top: 'calc(50% - 50vh)',
    left: 'calc(50% - 50vw)',
    transformOrigin: '50vw 50vh',
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
