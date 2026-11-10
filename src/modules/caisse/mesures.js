import React from 'react';

// Petites mesures partagées par les écrans de la caisse.

// L'heure qui avance : les minutes affichées se rafraîchissent seules.
export function useMaintenant(periodeMs = 30000) {
  const [t, setT] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setT(Date.now()), periodeMs);
    return () => clearInterval(id);
  }, [periodeMs]);
  return t;
}

// Largeur réelle d'un élément (ResizeObserver), 0 avant la première mesure.
export function useLargeur(ref) {
  const [largeur, setLargeur] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setLargeur(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(() => setLargeur(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return largeur;
}

// Le conteneur qui défile autour d'un élément (la zone de contenu de la
// coque), ou null quand c'est la page elle-même.
function conteneurDefilant(el) {
  let p = el?.parentElement;
  while (p && p !== document.body && p !== document.documentElement) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === 'auto' || oy === 'scroll') return p;
    p = p.parentElement;
  }
  return null;
}

// Retrait bas de la zone de contenu qui défile autour d'un élément. Une barre
// en position sticky s'arrête au bord du contenu, donc AVANT ce retrait : il
// faut le lui rendre (bottom négatif) pour qu'elle touche le bas de l'écran.
export function useRetraitBas(ref, actif) {
  const [retrait, setRetrait] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!actif || !el) { setRetrait(0); return; }
    const boite = conteneurDefilant(el);
    setRetrait(boite ? (parseFloat(getComputedStyle(boite).paddingBottom) || 0) : 0);
  }, [ref, actif]);
  return retrait;
}

// Hauteur qui reste sous le haut d'un élément, jusqu'au bas de la zone de
// contenu : l'écran du ticket s'y cadre (la grille et le ticket défilent
// chacun chez soi, le total et l'action principale ne quittent pas l'écran).
// Mesurée contre le conteneur défilant et non contre window.innerHeight : sur
// iPad celui-ci suit le viewport visuel (clavier, zoom) et ignore les barres
// de la coque. null tant que `actif` est faux ou avant la première mesure.
export function useHauteurRestante(ref, actif, marge = 8, plancher = 380) {
  const [hauteur, setHauteur] = React.useState(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!actif || !el) { setHauteur(null); return undefined; }
    const boite = conteneurDefilant(el);
    const mesurer = () => {
      const r = el.getBoundingClientRect();
      let reste;
      if (boite) {
        const rb = boite.getBoundingClientRect();
        const pied = parseFloat(getComputedStyle(boite).paddingBottom) || 0;
        // Position dans le contenu, indépendante du défilement en cours.
        const haut = r.top - rb.top + boite.scrollTop;
        reste = boite.clientHeight - pied - haut;
      } else {
        reste = document.documentElement.clientHeight - (r.top + window.scrollY);
      }
      setHauteur(Math.max(plancher, Math.floor(reste - marge)));
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    let ro = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(mesurer);
      ro.observe(boite || document.documentElement);
      if (el.parentElement) ro.observe(el.parentElement);
    }
    return () => {
      window.removeEventListener('resize', mesurer);
      if (ro) ro.disconnect();
    };
  }, [ref, actif, marge, plancher]);
  return hauteur;
}
