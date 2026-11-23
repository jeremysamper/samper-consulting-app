import React from 'react';
import { montrerDansBande } from '../utils/defilementSouris.js';

// Garde l'onglet choisi ([aria-selected="true"]) en vue dans une bande qui
// défile : à chaque changement de cle (onglet choisi, nombre d'onglets), et
// quand la bande change de largeur (écran monté caché puis affiché, fenêtre
// redimensionnée). Seule la bande bouge, jamais la page.
export default function useOngletEnVue(ref, cle) {
  React.useLayoutEffect(() => {
    const bande = ref.current;
    if (!bande) return undefined;
    const montrer = () => montrerDansBande(bande, bande.querySelector('[aria-selected="true"]'));
    montrer();
    if (typeof ResizeObserver === 'undefined') return undefined;
    let largeur = bande.clientWidth;
    const observateur = new ResizeObserver(() => {
      if (bande.clientWidth === largeur) return;
      largeur = bande.clientWidth;
      montrer();
    });
    observateur.observe(bande);
    return () => observateur.disconnect();
  }, [ref, cle]);
}
