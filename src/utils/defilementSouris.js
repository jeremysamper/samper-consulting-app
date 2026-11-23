// Bandes horizontales à la souris : molette et glisser.
//
// Les rangées d'onglets et de pilules (cartes, catégories, filtres) défilent
// à l'horizontale quand elles débordent, barre de défilement masquée. Au doigt
// et au pavé tactile, le geste horizontal suffit. À la souris d'un PC, rien ne
// bougeait : la molette faisait défiler la page, et rien ne se glissait. Ce
// module rend les deux gestes à toutes ces bandes depuis un seul endroit, sans
// toucher aux écrans :
// - la molette verticale, au-dessus d'une bande qui déborde, la fait défiler à
//   l'horizontale ; au bout de la bande, la page reprend la main ;
// - bouton gauche enfoncé, la bande suit la souris ; le clic qui termine un
//   glisser ne choisit rien.
// Une bande est un élément à overflow-x auto ou scroll qui déborde, d'au plus
// 160 px de haut, et qui ne défile pas aussi à la verticale (les tableaux et
// les plans gardent leur défilement). data-defilement-natif retire un élément
// et ce qu'il contient de ce comportement. La page ne défile jamais à
// l'horizontale : seule la bande bouge.
import { calculerCible, estBande } from './defilementSourisCalcul.js';

const SEUIL_GLISSER = 6;
const PROFONDEUR = 14;
const cibles = new WeakMap();
let installe = false;

function bandeSous(cible) {
  let el = cible instanceof Element ? cible : cible?.parentElement;
  for (let n = 0; el && el !== document.body && n < PROFONDEUR; n += 1, el = el.parentElement) {
    if (el.hasAttribute('data-defilement-natif')) return null;
    if (el.scrollWidth <= el.clientWidth + 1) continue;
    const cs = getComputedStyle(el);
    if (estBande({
      overflowX: cs.overflowX,
      overflowY: cs.overflowY,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
      hauteur: el.getBoundingClientRect().height,
    })) return el;
  }
  return null;
}

function mouvementReduit() {
  return document.documentElement.getAttribute('data-mouvement') === 'reduit'
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function surMolette(e) {
  if (e.defaultPrevented || e.ctrlKey || e.shiftKey) return;
  if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
  const bande = bandeSous(e.target);
  if (!bande) return;
  const maintenant = performance.now();
  const etat = cibles.get(bande);
  const cible = calculerCible({
    deltaY: e.deltaY,
    deltaMode: e.deltaMode,
    position: bande.scrollLeft,
    cibleEnCours: etat && maintenant - etat.t < 250 ? etat.cible : null,
    largeurVisible: bande.clientWidth,
    largeurTotale: bande.scrollWidth,
  });
  if (cible === null) return;
  e.preventDefault();
  cibles.set(bande, { cible, t: maintenant });
  bande.scrollTo({ left: cible, behavior: mouvementReduit() ? 'auto' : 'smooth' });
}

function surAppui(e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return;
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"], [draggable="true"]')) return;
  const bande = bandeSous(e.target);
  if (!bande) return;
  const x0 = e.clientX;
  const gauche0 = bande.scrollLeft;
  let glisse = false;
  const bouger = (ev) => {
    const dx = ev.clientX - x0;
    if (!glisse) {
      if (Math.abs(dx) < SEUIL_GLISSER) return;
      glisse = true;
      bande.classList.add('defile-glisse');
      window.getSelection?.()?.removeAllRanges();
    }
    bande.scrollLeft = gauche0 - dx;
  };
  const lacher = () => {
    window.removeEventListener('pointermove', bouger);
    window.removeEventListener('pointerup', lacher);
    window.removeEventListener('pointercancel', lacher);
    if (!glisse) return;
    bande.classList.remove('defile-glisse');
    // Le clic qui suit le lâcher arrive dans la même tâche : il est avalé,
    // puis l'écoute s'arrête.
    const avaler = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    window.addEventListener('click', avaler, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', avaler, { capture: true }), 0);
  };
  window.addEventListener('pointermove', bouger);
  window.addEventListener('pointerup', lacher);
  window.addEventListener('pointercancel', lacher);
}

// Amène l'onglet choisi dans la partie visible de sa bande, sans bouger la
// page : à l'ouverture, l'onglet choisi peut être le dernier, hors de vue.
export function montrerDansBande(bande, el) {
  if (!bande || !el || bande.scrollWidth <= bande.clientWidth + 1) return;
  const b = bande.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.left < b.left) bande.scrollLeft -= b.left - r.left + 8;
  else if (r.right > b.right) bande.scrollLeft += r.right - b.right + 8;
}

export function installDefilementSouris() {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  // passive: false, sinon la molette ne peut pas retenir la page.
  window.addEventListener('wheel', surMolette, { passive: false });
  window.addEventListener('pointerdown', surAppui, { passive: true, capture: true });
}
