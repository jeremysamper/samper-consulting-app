import React from 'react';
import { ChevronLeft, Menu } from 'lucide-react';
import { canGoBack, goBack } from '../services/historyNav.js';
import { readText } from '../utils/storage.js';

// ─────────────────────────────────────────────────────────────────────────────
// Glisser depuis le bord gauche = retour, comme dans une app iOS.
//
// Actif uniquement dans l'app INSTALLÉE sur l'écran d'accueil d'un iPad/iPhone :
// c'est le seul contexte sans geste natif. Safari (navigateur) et Android ont
// déjà le leur, qui passe par l'historique (historyNav) : doubler le geste y
// déclencherait deux retours. Forçage possible pour tester ou désactiver :
// localStorage sc_edge_swipe = 'on' | 'off'.
//
// Au premier niveau (rien derrière), le même geste ouvre le menu : le doigt
// n'arrive jamais sur un geste mort.
//
// Écouteurs tactiles natifs (pas de Pointer Events) : touchmove doit être non
// passif pour bloquer le défilement vertical une fois le geste engagé.
// Une zone peut refuser le geste avec l'attribut data-no-edge-swipe.
// ─────────────────────────────────────────────────────────────────────────────

const EDGE = 24;          // largeur de la zone de départ, en px
const ENGAGE = 12;        // déplacement avant de décider horizontal / vertical
const TRIGGER = 72;       // distance qui valide le retour
const FAST_VELOCITY = 0.45; // px/ms : un coup sec suffit même sous TRIGGER
const MAX_PULL = 110;

function isInstalledIos() {
  if (typeof window === 'undefined') return false;
  const nav = window.navigator || {};
  if (nav.standalone === true) return true;
  // iPadOS se présente comme un Mac : on reconnaît le tactile en plus.
  const isApple = /iPad|iPhone|iPod|Macintosh/.test(nav.userAgent || '') && (nav.maxTouchPoints || 0) > 1;
  return isApple && window.matchMedia?.('(display-mode: standalone)')?.matches === true;
}

export function isEdgeSwipeEnabled() {
  const forced = readText('sc_edge_swipe', '');
  if (forced === 'on') return true;
  if (forced === 'off') return false;
  return isInstalledIos();
}

export default function EdgeSwipeBack({ onRootSwipe }) {
  const [drag, setDrag] = React.useState(null); // { x, y, back }
  const onRootRef = React.useRef(onRootSwipe);
  onRootRef.current = onRootSwipe;

  React.useEffect(() => {
    if (!isEdgeSwipeEnabled()) return undefined;
    let g = null;

    const start = (e) => {
      if (e.touches.length !== 1) { g = null; return; }
      const t = e.touches[0];
      if (t.clientX > EDGE) return;
      if (e.target?.closest?.('[data-no-edge-swipe], input[type="range"], [aria-modal="true"]')) return;
      g = { x0: t.clientX, y0: t.clientY, t0: e.timeStamp, engaged: false, dx: 0, lastX: t.clientX, lastT: e.timeStamp, v: 0 };
    };

    const move = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.engaged) {
        if (Math.abs(dx) < ENGAGE && Math.abs(dy) < ENGAGE) return;
        // Geste vertical (défilement) ou vers la gauche : on laisse faire.
        if (Math.abs(dy) > Math.abs(dx) || dx < 0) { g = null; return; }
        g.engaged = true;
        g.back = canGoBack();
      }
      if (e.cancelable) e.preventDefault();
      const dt = e.timeStamp - g.lastT;
      if (dt > 0) g.v = (t.clientX - g.lastX) / dt;
      g.lastX = t.clientX;
      g.lastT = e.timeStamp;
      const crossed = dx >= TRIGGER;
      if (crossed && !g.crossed) navigator.vibrate?.(8);
      g.crossed = crossed;
      g.dx = dx;
      setDrag({ x: Math.max(0, Math.min(dx, MAX_PULL)), y: t.clientY, back: g.back, ready: crossed });
    };

    const end = () => {
      if (!g) return;
      const done = g.engaged && (g.dx >= TRIGGER || (g.dx > TRIGGER / 2 && g.v > FAST_VELOCITY));
      const back = g.back;
      g = null;
      setDrag(null);
      if (!done) return;
      if (back && goBack()) return;
      onRootRef.current?.();
    };

    document.addEventListener('touchstart', start, { passive: true });
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end, { passive: true });
    document.addEventListener('touchcancel', end, { passive: true });
    return () => {
      document.removeEventListener('touchstart', start);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', end);
    };
  }, []);

  if (!drag) return null;
  const progress = Math.min(drag.x / TRIGGER, 1);
  const Icon = drag.back ? ChevronLeft : Menu;
  return (
    <div
      className={`edge-swipe-indicator${drag.ready ? ' is-ready' : ''}`}
      aria-hidden="true"
      style={{
        top: drag.y,
        transform: `translate(${drag.x * 0.55 - 44}px, -50%) scale(${0.7 + progress * 0.3})`,
        opacity: 0.35 + progress * 0.65,
      }}
    >
      <Icon size={22} strokeWidth={2.4} />
    </div>
  );
}
