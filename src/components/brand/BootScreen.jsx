import { useEffect, useState } from 'react';
import { bootThemeFor } from './bootThemes.js';
import grainUrl from './boot-photos/grain.png';

/**
 * Écran de chargement « Bienvenue ».
 *
 * Reprend le modèle vidéo fourni : sur fond noir, six calques s'ouvrent
 * chacun depuis une fine bande verticale au centre, le suivant naissant dans
 * le précédent ; la photo zoome légèrement pendant qu'elle s'ouvre. Le
 * dernier calque, plein écran, porte « Bienvenue » qui monte depuis une ligne
 * de masque. Tout est posé à ~2,8 s. Photos et ordre : bootThemes.js, un
 * thème par semaine.
 *
 * Fluidité : l'ouverture d'un calque ne repeint rien. Chaque calque est coupé
 * en deux moitiés ; dans chacune, un volet glisse vers le centre pendant que
 * la photo glisse en sens inverse (même durée, même courbe : les deux
 * déplacements s'annulent, la photo reste immobile à l'écran). Que des
 * translations, que le GPU anime seul, même quand le processeur est pris par
 * le démarrage de l'app en dessous. Une version à clip-path repeignait
 * l'écran à chaque image (~350 repeints en 2,4 s) et saccadait sur téléphone.
 * Les deux moitiés se chevauchent d'1 px pour qu'aucun fil ne passe au
 * centre. Seul le voile et le mot du dernier calque (sans photo, légers à
 * peindre) s'ouvrent encore par clip-path.
 *
 * Déroulé :
 *  - 'wait'   : noir (la première image du modèle) le temps que les photos
 *               de la semaine soient décodées, 1,2 s au plus ;
 *  - 'play'   : l'animation, une fois par onglet (sessionStorage). Un
 *               rechargement dans la même session saute directement à
 *               'static' : la brigade ne revoit pas l'intro à chaque retour
 *               sur l'app ;
 *  - 'static' : l'image finale, mot en place (aussi en mouvement réduit).
 *
 * L'écran reste au moins jusqu'à la fin de l'intro (le mot doit se lire),
 * puis s'efface en fondu dès que l'app est prête. Toucher l'écran passe
 * l'intro. L'app se monte dessous pendant ce temps : elle charge ses données
 * au lieu d'attendre.
 *
 * @param {boolean}  loading    démarrage encore en cours (auth, modules)
 * @param {string}   title      étape en cours, annoncée aux lecteurs d'écran
 *                              et affichée si le chargement s'éternise
 * @param {Function} onFinished appelé à la fin du fondu de sortie (stable)
 */

// Départ de chaque calque, en ms : le rythme du modèle, ralenti de 40 %.
// La durée d'ouverture d'un calque (1100 ms) est dans app.css.
const LAYER_STARTS = [40, 460, 700, 940, 1220, 1440];
const OPEN_MS = 1100;
const heroAt = LAYER_STARTS[LAYER_STARTS.length - 1];
// Fin de l'intro : le mot est posé (~2,8 s) et lisible.
const INTRO_MS = 3000;
// Attente maximale des photos avant de lancer l'intro quand même (les calques
// sans photo s'ouvrent alors dans la teinte de leur photo).
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

// Aperçu en dev : /vite-index.html?bienvenue=3 force le thème 3 et rejoue
// l'intro à chaque chargement.
const previewIndex = readPreviewIndex();
const theme = bootThemeFor(new Date(), previewIndex);

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
// L'intro déjà vue dans cet onglet n'a besoin que de la photo finale.
const photosReady = typeof Image === 'undefined'
  ? Promise.resolve()
  : Promise.all((initialPhase() === 'wait' ? [...theme.layers, theme.hero] : [theme.hero]).map((p) => decode(p.src)));

/**
 * Un calque : deux moitiés (gauche, droite), chacune volet + cadre. Le cadre
 * porte la photo alignée sur l'écran entier ; seule la partie de sa moitié
 * est visible.
 */
function Layer({ photo, at, focus }) {
  return (
    <div style={{ ...s.layer, '--bv-at': `${at}ms` }} aria-hidden="true">
      {['l', 'r'].map((side) => (
        <div key={side} className={`bv-half bv-half-${side}`} style={side === 'l' ? s.halfL : s.halfR}>
          <div className="bv-slide" style={s.fill}>
            <div className="bv-frame" style={{ ...s.fill, background: photo.tone }}>
              <img
                className="bv-photo"
                src={photo.src}
                alt=""
                draggable={false}
                style={{ ...s.photo, ...(side === 'l' ? s.screenL : s.screenR), objectPosition: focus }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BootScreen({ loading = true, title = 'Connexion à votre espace', onFinished }) {
  const [phase, setPhase] = useState(initialPhase);
  const [introDone, setIntroDone] = useState(() => phase === 'static');
  // Les bandes, recouvertes une fois la photo finale ouverte, sont retirées :
  // moins de calques à garder en mémoire graphique pendant la suite.
  const [stripsGone, setStripsGone] = useState(false);
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
    const stripsTimer = setTimeout(() => setStripsGone(true), heroAt + OPEN_MS + 100);
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => {
      clearTimeout(stripsTimer);
      clearTimeout(timer);
    };
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
      className={`bv-root bv-${phase}${leaving ? ' bv-leaving' : ''}`}
      style={s.root}
      onPointerDown={skip}
      data-no-translate=""
    >
      {phase === 'play' && !stripsGone && theme.layers.map((photo, i) => (
        <Layer key={`${i}-${photo.src}`} photo={photo} at={LAYER_STARTS[i]} />
      ))}

      {phase !== 'wait' && <Layer photo={theme.hero} at={heroAt} focus={theme.focus} />}

      {/* Finition « pellicule » sur les photos, sous le texte : grain fin +
          vignettage. Le mot et les mentions restent nets par-dessus.
          Le grain redonne de la matière là où une photo manque de détail
          (compression, photo de téléphone agrandie) ; il est fixe, peint une
          seule fois, et ne coûte rien pendant l'animation. */}
      {phase !== 'wait' && (
        <>
          <div style={s.vignette} aria-hidden="true" />
          <div style={s.grain} aria-hidden="true" />
        </>
      )}

      {phase !== 'wait' && (
        <div className="bv-extras" style={{ ...s.layer, '--bv-at': `${heroAt}ms` }}>
          <div style={s.scrim(theme.dim)} aria-hidden="true" />

          <div style={s.labels} aria-hidden="true">
            <span>Samper Consulting</span>
            <span>Semaine {theme.week}</span>
          </div>

          <div style={s.wordZone}>
            <div style={s.wordMask}>
              <p className="bv-word" style={s.word}>Bienvenue</p>
            </div>
          </div>
        </div>
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
    top: 0,
    left: 0,
    bottom: 0,
    // En vw, comme les moitiés et leurs décalages : tout le calcul des volets
    // part de la même largeur.
    width: '100vw',
    zIndex: 9999,
    overflow: 'hidden',
    background: '#000',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    WebkitTapHighlightColor: 'transparent',
  },
  layer: {
    position: 'absolute',
    inset: 0,
  },
  // Moitiés de 50vw + 1px : elles se chevauchent sur 2 px au centre (même
  // photo, mêmes pixels), ce qui évite un fil entre les deux.
  halfL: { position: 'absolute', top: 0, bottom: 0, left: 0, width: 'calc(50vw + 1px)', overflow: 'hidden' },
  halfR: { position: 'absolute', top: 0, bottom: 0, left: 'calc(50vw - 1px)', width: 'calc(50vw + 1px)', overflow: 'hidden' },
  fill: { position: 'absolute', inset: 0, overflow: 'hidden' },
  photo: {
    position: 'absolute',
    top: 0,
    height: '100%',
    width: '100vw',
    objectFit: 'cover',
    display: 'block',
    // Pas de filtre CSS ici : l'étalonnage est cuit dans les fichiers
    // (scripts/gen-boot-photos.mjs). Un filtre en direct coûtait des images
    // pendant les glissements.
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    background: 'radial-gradient(ellipse 120% 90% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.38) 100%)',
  },
  grain: {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    backgroundImage: `url(${grainUrl})`,
    // Tuile de 160 px affichée à 80 px : grain fin, net sur écran dense.
    // Texture transparente ordinaire : pas de mode de fusion, qui obligeait
    // à recomposer le grain avec les photos à chaque image.
    backgroundSize: '80px 80px',
  },
  // La photo couvre l'écran entier, alignée sur lui quelle que soit la moitié.
  screenL: { left: 0 },
  screenR: { left: 'calc(1px - 50vw)' },
  scrim: (dim) => ({
    position: 'absolute',
    inset: 0,
    // Voile centré sous le mot + haut assombri pour les deux mentions.
    background: `linear-gradient(to bottom, rgba(0,0,0,0.32) 0%, rgba(0,0,0,0) 16%), radial-gradient(ellipse 85% 55% at 50% 50%, rgba(0,0,0,${dim}) 0%, rgba(0,0,0,${dim * 0.4}) 100%)`,
  }),
  labels: {
    position: 'absolute',
    top: 'max(18px, env(safe-area-inset-top))',
    left: 'max(20px, env(safe-area-inset-left))',
    right: 'max(20px, env(safe-area-inset-right))',
    display: 'flex',
    justifyContent: 'space-between',
    gap: 16,
    fontFamily: FONT,
    fontSize: 10.5,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.86)',
  },
  wordZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  wordMask: {
    // La ligne de masque : le bas de cette boîte. Le mot en sort par le bas ;
    // seul ce bord coupe (les insets négatifs laissent passer haut et côtés).
    fontSize: 'min(16vw, 26vh)',
    paddingBottom: '0.28em',
    clipPath: 'inset(-100vh -100vw 0 -100vw)',
  },
  word: {
    margin: 0,
    fontFamily: FONT,
    fontSize: '1em',
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: '-0.045em',
    color: '#fff',
    whiteSpace: 'nowrap',
    // Ombre serrée + halo large : le mot reste lisible sur une purée ou une
    // meringue blanche, là où le modèle posait sur un mur uni.
    textShadow: '0 1px 3px rgba(0,0,0,0.25), 0 6px 44px rgba(0,0,0,0.42)',
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
