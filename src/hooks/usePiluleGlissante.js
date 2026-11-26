import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Pilule qui glisse sous l'élément choisi d'une rangée (onglets, entrées du
// menu). La rangée rend un <span class="mvt-pilule"> en premier enfant ; ce
// hook le pose sous l'élément désigné par `selecteur` et le déplace quand le
// choix change. La rangée porte alors data-pilule : la feuille retire l'aplat
// de l'élément choisi, que la pilule porte à sa place.
//
//   conteneurRef : la rangée, positionnée (position: relative)
//   piluleRef    : le <span class="mvt-pilule">
//   selecteur    : l'élément choisi, cherché dans la rangée
//   cle          : le choix en cours ; quand il change, la pilule glisse
//   forme        : ce qui change la mise en page sans changer le choix (menu
//                  replié ou déplié) ; la pilule se repose alors sans glisser
//
// La place est lue par offsetLeft et offsetTop : c'est la place de mise en
// page, sans l'échelle d'un bouton encore enfoncé. La pilule suit aussi tout
// changement de taille de la rangée ou de ses boutons (fenêtre, police
// chargée, libellé traduit, menu qui se déplie), sans glisser.
//
// Tout échec rend l'état d'avant : sans élément choisi, ou si la rangée n'est
// pas le repère de ses boutons, data-pilule est retiré et l'élément choisi
// garde son aplat.
// ─────────────────────────────────────────────────────────────────────────────
export default function usePiluleGlissante(conteneurRef, piluleRef, { selecteur, cle, forme = '' }) {
  const dernier = React.useRef({ posee: false, forme: null });

  const poser = React.useCallback((glisse) => {
    const conteneur = conteneurRef.current;
    const pilule = piluleRef.current;
    if (!conteneur || !pilule) return;
    const retirer = () => {
      conteneur.removeAttribute('data-pilule');
      pilule.removeAttribute('data-posee');
      dernier.current.posee = false;
    };
    const cible = conteneur.querySelector(selecteur);
    if (!cible) { retirer(); return; }
    let x = 0;
    let y = 0;
    let n = cible;
    while (n && n !== conteneur) {
      x += n.offsetLeft;
      y += n.offsetTop;
      n = n.offsetParent;
    }
    if (n !== conteneur || !cible.offsetWidth) { retirer(); return; }
    const anime = glisse && dernier.current.posee;
    if (!anime) pilule.style.transition = 'none';
    pilule.style.transform = `translate(${x}px, ${y}px)`;
    pilule.style.width = `${cible.offsetWidth}px`;
    pilule.style.height = `${cible.offsetHeight}px`;
    pilule.style.borderRadius = getComputedStyle(cible).borderRadius;
    pilule.setAttribute('data-posee', '');
    conteneur.setAttribute('data-pilule', '');
    if (!anime) {
      // La place est prise sans transition, puis la transition est rendue.
      void pilule.offsetWidth;
      pilule.style.transition = '';
    }
    dernier.current.posee = true;
  }, [conteneurRef, piluleRef, selecteur]);

  // Le choix change : la pilule glisse. La forme change : elle se repose.
  React.useLayoutEffect(() => {
    const memeForme = dernier.current.forme === forme;
    dernier.current.forme = forme;
    poser(memeForme);
  }, [poser, cle, forme]);

  // La rangée ou un de ses boutons change de taille : la pilule suit.
  React.useEffect(() => {
    const conteneur = conteneurRef.current;
    if (!conteneur || typeof ResizeObserver === 'undefined') return undefined;
    const observateur = new ResizeObserver(() => poser(false));
    observateur.observe(conteneur);
    conteneur.querySelectorAll('button').forEach((b) => observateur.observe(b));
    return () => observateur.disconnect();
  }, [conteneurRef, poser, cle, forme]);
}
