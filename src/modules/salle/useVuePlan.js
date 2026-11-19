import React from 'react';
import { PLAN_W, PLAN_H } from '../../hooks/planSalleCanevas.js';
import { readJson, writeJson } from '../../utils/storage.js';
import { useHauteurRestante, useLargeur } from '../caisse/mesures.js';
import { TABLE_LISIBLE, borne, cadrage, medianeTables } from './planVue.js';

// ─────────────────────────────────────────────────────────────────────────────
// Vue d'un plan de salle à l'écran : échelle, cadrage et zoom.
//
// Ordinateur et tablette : la salle prend la largeur de sa carte, bornée par
// la hauteur qui reste sous le haut du plan (elle se voit sans défiler), et
// la vue se cale sur ce qui est dessiné. Un dessin ou un déplacement de tables
// montre tout le canevas, pour poser un meuble n'importe où.
//
// Téléphone (carte de moins de 560 px) : une salle en largeur ne tient pas
// dans un écran en hauteur sans écraser ses tables. Le plan prend la hauteur
// qui reste et s'ouvre agrandi (table médiane à TABLE_LISIBLE pixels) ; on le
// parcourt au doigt, on pince pour zoomer, et des boutons ronds agrandissent,
// réduisent ou montrent toute la salle. Le zoom choisi est gardé sur
// l'appareil.
//
// Le canevas complet (`salleRef`) est posé à l'échelle k et décalé de
// l'origine de la vue : une position en unités du canevas vaut `u * k` pixels
// dans lui, et un point de l'écran se convertit par son rectangle.
// ─────────────────────────────────────────────────────────────────────────────

const ZOOM_MAX_K = 1.6;

export function useVuePlan({ objets, tables, toutLeCanevas = false, cleZoom = 'sc_plan_zoom', hauteurMin = 300, marge = 8 }) {
  // Refs en fonction de rappel : le plan peut se monter après le chargement,
  // ou se démonter le temps de la liste au téléphone ; la mesure et le
  // pincement repartent sur l'élément nouveau.
  const [colEl, setColEl] = React.useState(null);
  const [fenEl, setFenEl] = React.useState(null);
  const colObj = React.useMemo(() => ({ current: colEl }), [colEl]);
  const salleRef = React.useRef(null);
  const ancreRef = React.useRef(null);
  const pincementRef = React.useRef(null);
  const zoomEtat = React.useRef({});
  const finPincementRef = React.useRef(0);
  const [zoomDirect, setZoomDirect] = React.useState(null);
  const [zoomGarde, setZoomGarde] = React.useState(() => {
    const v = readJson(cleZoom, null);
    return typeof v === 'number' && v >= 1 ? v : null;
  });

  const largeurCol = useLargeur(colObj);
  const hauteurDispo = useHauteurRestante(colObj, !!colEl, marge, hauteurMin);
  const tel = largeurCol > 0 && largeurCol < 560;

  const vue = cadrage(toutLeCanevas ? null : objets);
  const dispoL = Math.max(0, largeurCol);
  const dispoH = hauteurDispo ? Math.max(hauteurMin - 40, hauteurDispo) : null;
  let k = vue.w ? dispoL / vue.w : 0;
  if (dispoH && !tel) k = Math.min(k, dispoH / vue.h);
  k = Math.min(k, ZOOM_MAX_K);
  const fenetreH = tel ? Math.max(280, Math.floor(hauteurDispo || 0)) : 0;
  const kToute = tel && vue.w ? Math.min(dispoL / vue.w, fenetreH / vue.h) : k;
  const zoomMax = tel && kToute > 0 ? Math.max(1, ZOOM_MAX_K / kToute) : 1;
  const mediane = medianeTables(tables);
  const zoomLisible = tel && mediane && kToute ? borne(TABLE_LISIBLE / (mediane * kToute), 1, zoomMax) : 1;
  const zoom = tel ? borne(zoomDirect ?? zoomGarde ?? zoomLisible, 1, zoomMax) : 1;
  if (tel) k = kToute * zoom;
  const largeur = Math.round(dispoL);
  const hauteur = Math.round(vue.h * k);
  // Au téléphone, une bande sous la salle : les boutons de zoom ne cachent
  // jamais une table.
  const reserveZoom = tel ? 60 : 0;
  const surfaceW = tel ? Math.max(largeur, Math.ceil(vue.w * k)) : largeur;
  const surfaceH = tel ? Math.max(fenetreH, Math.ceil(vue.h * k) + reserveZoom) : hauteur;
  const origineX = vue.x0 * k - (surfaceW - vue.w * k) / 2;
  const origineY = vue.y0 * k - (tel ? Math.max(0, (surfaceH - reserveZoom - vue.h * k) / 2) : 0);
  zoomEtat.current = { zoom, zoomMax, zoomLisible, k };

  const garderZoom = React.useCallback((v) => {
    setZoomGarde(v);
    writeJson(cleZoom, v);
  }, [cleZoom]);

  const pointSalle = (sx, sy) => {
    const r = salleRef.current?.getBoundingClientRect();
    const kk = zoomEtat.current.k;
    return r && kk ? { ux: (sx - r.left) / kk, uy: (sy - r.top) / kk } : null;
  };

  // Change le zoom en gardant à sa place le point de la salle au centre de
  // la fenêtre.
  function zoomer(valeur) {
    const f = fenEl;
    if (!f) return;
    const r = f.getBoundingClientRect();
    const sx = r.left + r.width / 2;
    const sy = r.top + r.height / 2;
    const p = pointSalle(sx, sy);
    if (p) ancreRef.current = { ...p, sx, sy };
    garderZoom(borne(valeur, 1, zoomEtat.current.zoomMax));
  }

  // Amène un point du canevas au centre de la fenêtre (une table choisie
  // depuis la liste, au téléphone).
  function montrer(ux, uy) {
    const f = fenEl;
    if (!f || !tel) return;
    const kk = zoomEtat.current.k;
    f.scrollTo({ left: Math.max(0, ux * kk - origineX - f.clientWidth / 2), top: Math.max(0, uy * kk - origineY - f.clientHeight / 2), behavior: 'smooth' });
  }

  React.useLayoutEffect(() => {
    const a = ancreRef.current;
    const f = fenEl;
    if (!a || !f) return;
    ancreRef.current = null;
    const r = f.getBoundingClientRect();
    f.scrollLeft = Math.max(0, r.left - origineX + a.ux * k - a.sx);
    f.scrollTop = Math.max(0, r.top - origineY + a.uy * k - a.sy);
  });

  // Pincer à deux doigts. Écouteurs natifs (passive: false) : React pose les
  // siens en passif et ne pourrait pas empêcher le zoom de toute la page.
  React.useEffect(() => {
    const f = fenEl;
    if (!tel || !f) return undefined;
    const ecart = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const milieu = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const debut = (e) => {
      if (e.touches.length !== 2) return;
      const m = milieu(e.touches);
      const z = zoomEtat.current.zoom;
      pincementRef.current = { d0: ecart(e.touches) || 1, z0: z, dernier: z, ancre: pointSalle(m.x, m.y) };
      if (e.cancelable) e.preventDefault();
    };
    const bouger = (e) => {
      const p = pincementRef.current;
      if (!p || e.touches.length !== 2) return;
      if (e.cancelable) e.preventDefault();
      const m = milieu(e.touches);
      p.dernier = borne((p.z0 * ecart(e.touches)) / p.d0, 1, zoomEtat.current.zoomMax);
      if (p.ancre) ancreRef.current = { ...p.ancre, sx: m.x, sy: m.y };
      setZoomDirect(p.dernier);
    };
    const fin = (e) => {
      const p = pincementRef.current;
      if (!p || e.touches.length >= 2) return;
      pincementRef.current = null;
      finPincementRef.current = Date.now();
      setZoomDirect(null);
      garderZoom(p.dernier);
    };
    const geste = (e) => e.preventDefault();
    f.addEventListener('touchstart', debut, { passive: false });
    f.addEventListener('touchmove', bouger, { passive: false });
    f.addEventListener('touchend', fin);
    f.addEventListener('touchcancel', fin);
    f.addEventListener('gesturestart', geste);
    f.addEventListener('gesturechange', geste);
    return () => {
      f.removeEventListener('touchstart', debut);
      f.removeEventListener('touchmove', bouger);
      f.removeEventListener('touchend', fin);
      f.removeEventListener('touchcancel', fin);
      f.removeEventListener('gesturestart', geste);
      f.removeEventListener('gesturechange', geste);
    };
    // garderZoom et pointSalle ne lisent que des refs : les écouteurs ne se
    // reposent qu'en changeant de présentation.
  }, [tel, fenEl, garderZoom]);

  return {
    colRef: setColEl, fenetreRef: setFenEl, salleRef, finPincementRef,
    tel, k, largeur, hauteur, fenetreH, surfaceW, surfaceH, origineX, origineY,
    zoom, zoomMax, zoomLisible, zoomer, montrer, pret: largeurCol > 0,
    canevasW: PLAN_W * k, canevasH: PLAN_H * k,
  };
}
