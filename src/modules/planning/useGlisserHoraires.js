import React from 'react';
import { lireCase } from './planningGlisser.js';

// ─────────────────────────────────────────────────────────────────────────────
// Glisser-déposer des horaires dans la grille semaine (ordinateur et iPad).
//
// Pointer Events seulement, jamais l'API HTML5 (morte sur iPad). Les écouteurs
// sont posés sur window DANS le pointerdown (un effet arriverait après le
// premier pointermove d'un geste vif) et retirés au lâcher ; window plutôt que
// setPointerCapture, parce que l'écriture optimiste démonte l'horaire traîné.
// La case visée se lit sous le pointeur (elementFromPoint + data-planning-case)
// et la valeur déposée est portée par le geste (ref), jamais relue dans l'état
// React au lâcher.
//
// - souris : le glisser démarre après 6 px ; sans mouvement, le clic ouvre
//   « Modifier l'horaire » comme avant. Alt ou Ctrl au lâcher : copie (suivi
//   en direct pour que le fantôme le dise) ;
// - doigt et stylet : appui long de 450 ms sans bouger de plus de 10 px. Un
//   mouvement avant, c'est un défilement : le geste est abandonné. Pendant le
//   glisser seulement, le touchmove de la zone est annulé (écouteur non passif
//   posé au montage : posé pendant le geste, il arriverait trop tard).
//
// Aucun setState par mouvement : le fantôme est placé par le DOM dans un
// requestAnimationFrame ; l'état React ne change que quand la case visée, la
// règle, le mode copie ou la phase changent. Le hook n'écrit rien : il appelle
// onDeposer({ horaire, cible, copie, regle }).
// ─────────────────────────────────────────────────────────────────────────────

// Repli : false coupe le glisser au doigt et au stylet sans toucher au reste.
export const GLISSER_TACTILE = true;

const SEUIL_SOURIS = 6;
const APPUI_LONG = 450;
const TOLERANCE_TACTILE = 10;
const BORD = 48;
const PAS = 12;
const CLIC_IGNORE = 400;

const caseSous = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const c = el && el.closest ? el.closest('[data-planning-case]') : null;
  return c ? c.getAttribute('data-planning-case') : null;
};

// Premier ancêtre qui défile verticalement (main dans la coque tactile),
// sinon la page.
const defileurVertical = (depart) => {
  for (let el = depart ? depart.parentElement : null; el && el !== document.body; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return document.scrollingElement || document.documentElement;
};

export function useGlisserHoraires({ actif, attrapable, horaireDe, evaluer, onDeposer }) {
  const [glisse, setGlisse] = React.useState(null);
  const gRef = React.useRef(null);
  const finRef = React.useRef(-Infinity);
  const zoneNodeRef = React.useRef(null);
  const fantomeNodeRef = React.useRef(null);
  const publieRef = React.useRef('');
  // Les écouteurs posés au pointerdown lisent toujours les fonctions du
  // dernier rendu (état le plus récent).
  const propsRef = React.useRef(null);
  propsRef.current = { actif, attrapable, horaireDe, evaluer, onDeposer };

  // L'état React du geste, publié seulement quand il change.
  const publier = (g) => {
    if (!g || g.phase === 'attente') {
      if (publieRef.current) { publieRef.current = ''; setGlisse(null); }
      return;
    }
    const r = g.regle;
    const empreinte = [g.phase, g.cle, g.copie, r && r.effet, r && r.bloque, r && r.absence, r && r.conflit && r.conflit.id].join('|');
    if (empreinte === publieRef.current) return;
    publieRef.current = empreinte;
    setGlisse({ horaireId: g.horaire.id, horaire: g.horaire, cle: g.cle || null, etat: r ? r.etat : null, copie: g.copie, regle: r, phase: g.phase, tactile: g.tactile });
  };

  // Case visée et règle, réévaluées seulement quand la case ou le mode copie change.
  const viser = (g) => {
    const cle = caseSous(g.x, g.y);
    if (cle !== g.cle || g.copie !== g.copieEvaluee) {
      g.cle = cle;
      g.copieEvaluee = g.copie;
      const p = propsRef.current;
      const h = p.horaireDe(g.horaire.id) || g.horaire;
      g.regle = cle ? p.evaluer(h, cle, g.copie) : null;
    }
    publier(g);
  };

  const placer = () => {
    const g = gRef.current;
    const n = fantomeNodeRef.current;
    if (!g || !n) return;
    // Au doigt, le fantôme passe au-dessus du doigt pour rester lisible ; il
    // ne sort jamais de l'écran (bord droit de la grille, bas de page).
    const x = Math.max(8, Math.min(g.tactile ? g.x - 24 : g.x + 14, window.innerWidth - n.offsetWidth - 8));
    const y = Math.max(8, Math.min(g.tactile ? g.y - 84 : g.y + 14, window.innerHeight - n.offsetHeight - 8));
    n.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  };

  // Une image : fantôme, puis défilement automatique près d'un bord (12 px
  // par image à moins de 48 px) : la grille horizontalement, l'ancêtre qui
  // défile verticalement.
  const boucle = () => {
    const g = gRef.current;
    if (!g || g.phase === 'attente') return;
    g.raf = 0;
    placer();
    if (g.phase === 'glisse') {
      let bouge = false;
      const z = zoneNodeRef.current;
      if (z && z.scrollWidth > z.clientWidth + 1) {
        const r = z.getBoundingClientRect();
        const avant = z.scrollLeft;
        if (g.x < r.left + BORD) z.scrollLeft = avant - PAS;
        else if (g.x > r.right - BORD) z.scrollLeft = avant + PAS;
        if (z.scrollLeft !== avant) bouge = true;
      }
      const v = g.defileur;
      if (v) {
        const racine = v === document.scrollingElement || v === document.documentElement;
        const r = racine ? null : v.getBoundingClientRect();
        const haut = r ? r.top : 0;
        const bas = r ? r.bottom : window.innerHeight;
        const avant = v.scrollTop;
        if (g.y < haut + BORD) v.scrollTop = avant - PAS;
        else if (g.y > bas - BORD) v.scrollTop = avant + PAS;
        if (v.scrollTop !== avant) bouge = true;
      }
      if (bouge) viser(g);
    }
    g.raf = requestAnimationFrame(boucle);
  };

  const demarrer = (g, phase) => {
    g.phase = phase;
    g.defileur = defileurVertical(zoneNodeRef.current);
    try { window.getSelection && window.getSelection().removeAllRanges(); } catch { /* rien à vider */ }
    viser(g);
    if (!g.raf) g.raf = requestAnimationFrame(boucle);
  };

  // Le clic qui suit un glisser (ou un appui long) n'ouvre rien : fenêtre de
  // 400 ms, en capture sur window pour couvrir toute case.
  const gardeClic = () => {
    finRef.current = performance.now();
    const garde = (ev) => {
      window.removeEventListener('click', garde, true);
      if (performance.now() - finRef.current < CLIC_IGNORE) { ev.stopPropagation(); ev.preventDefault(); }
    };
    window.addEventListener('click', garde, true);
    setTimeout(() => window.removeEventListener('click', garde, true), CLIC_IGNORE + 50);
  };

  const terminer = (g, ignorerClic) => {
    if (gRef.current !== g) return;
    clearTimeout(g.timer);
    if (g.raf) cancelAnimationFrame(g.raf);
    g.retirer();
    gRef.current = null;
    if (ignorerClic) gardeClic();
    publier(null);
  };

  const surPointerDown = React.useCallback((e, horaire) => {
    const p = propsRef.current;
    if (!p.actif || gRef.current) return;
    const tactile = (e.pointerType || 'mouse') !== 'mouse';
    if (tactile && !GLISSER_TACTILE) return;
    if (!tactile && e.button !== 0) return;
    if (p.attrapable && !p.attrapable(horaire)) return;

    const g = {
      pointerId: e.pointerId, tactile, horaire,
      x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY,
      phase: 'attente', copie: false, copieEvaluee: false, cle: undefined, regle: null,
      timer: 0, raf: 0, defileur: null, retirer: null,
    };

    const bouger = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      g.x = ev.clientX;
      g.y = ev.clientY;
      if (!g.tactile) g.copie = ev.altKey || ev.ctrlKey;
      if (g.phase === 'attente') {
        const d = Math.hypot(g.x - g.x0, g.y - g.y0);
        if (g.tactile) { if (d > TOLERANCE_TACTILE) terminer(g, false); return; }
        if (d >= SEUIL_SOURIS) demarrer(g, 'glisse');
        return;
      }
      if (g.phase === 'arme') g.phase = 'glisse';
      viser(g);
      if (!g.raf) g.raf = requestAnimationFrame(boucle);
    };

    const lacher = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      // Relâché avant le glisser : clic ou toucher normal (Modifier l'horaire).
      if (g.phase === 'attente') { terminer(g, false); return; }
      // Relâché sur place après l'appui long : rien n'est écrit ni ouvert.
      if (g.phase === 'arme') { terminer(g, true); return; }
      g.x = ev.clientX;
      g.y = ev.clientY;
      if (!g.tactile) g.copie = ev.altKey || ev.ctrlKey;
      const cle = caseSous(g.x, g.y);
      const props = propsRef.current;
      const horaireActuel = props.horaireDe(g.horaire.id) || g.horaire;
      const regle = cle ? props.evaluer(horaireActuel, cle, g.copie) : null;
      const copie = g.copie;
      terminer(g, true);
      if (regle) props.onDeposer({ horaire: horaireActuel, cible: lireCase(cle), copie, regle });
    };

    // Appel entrant, geste système, défilement repris par le navigateur.
    const couper = (ev) => {
      if (ev.pointerId !== g.pointerId) return;
      terminer(g, g.phase !== 'attente');
    };

    const touche = (ev) => {
      if (ev.key === 'Escape') {
        if (g.phase === 'attente') { terminer(g, false); return; }
        // Échap annule le glisser, pas l'écran (useEcranModule lit defaultPrevented).
        ev.preventDefault();
        ev.stopPropagation();
        terminer(g, true);
        return;
      }
      if (ev.key !== 'Alt' && ev.key !== 'Control') return;
      if (g.phase === 'attente') return;
      // Alt seul ouvrirait le menu du navigateur pendant le glisser.
      if (ev.key === 'Alt') ev.preventDefault();
      g.copie = ev.altKey || ev.ctrlKey;
      viser(g);
    };

    g.retirer = () => {
      window.removeEventListener('pointermove', bouger);
      window.removeEventListener('pointerup', lacher);
      window.removeEventListener('pointercancel', couper);
      window.removeEventListener('keydown', touche, true);
      window.removeEventListener('keyup', touche, true);
    };
    window.addEventListener('pointermove', bouger);
    window.addEventListener('pointerup', lacher);
    window.addEventListener('pointercancel', couper);
    window.addEventListener('keydown', touche, true);
    window.addEventListener('keyup', touche, true);
    gRef.current = g;

    if (tactile) {
      g.timer = setTimeout(() => {
        if (gRef.current !== g || g.phase !== 'attente') return;
        try { navigator.vibrate && navigator.vibrate(10); } catch { /* sans vibreur */ }
        demarrer(g, 'arme');
      }, APPUI_LONG);
    }
  }, []);

  // touchmove non passif, posé sur la zone de la grille dès qu'elle existe :
  // il n'annule le défilement que pendant un glisser au doigt.
  const bloquer = React.useCallback((e) => {
    const g = gRef.current;
    if (g && g.tactile && g.phase !== 'attente' && e.cancelable) e.preventDefault();
  }, []);
  const zoneRef = React.useCallback((node) => {
    if (zoneNodeRef.current) zoneNodeRef.current.removeEventListener('touchmove', bloquer);
    zoneNodeRef.current = node;
    if (node) node.addEventListener('touchmove', bloquer, { passive: false });
  }, [bloquer]);

  const fantomeRef = React.useCallback((node) => {
    fantomeNodeRef.current = node;
    if (node) placer();
  }, []);

  const clicIgnore = React.useCallback(() => performance.now() - finRef.current < CLIC_IGNORE, []);

  // Glisser coupé quand il n'est plus permis (sélection, pinceau, écran quitté),
  // et nettoyage au démontage : rien n'est écrit.
  React.useEffect(() => {
    if (!actif && gRef.current) terminer(gRef.current, false);
  }, [actif]);
  React.useEffect(() => () => {
    if (gRef.current) terminer(gRef.current, false);
  }, []);

  return { surPointerDown, zoneRef, glisse, clicIgnore, fantomeRef };
}
