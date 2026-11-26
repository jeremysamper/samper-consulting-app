import React from 'react';
import { glisserDepuis, releverPlaces } from '../utils/mouvement.js';

// Les enfants d'un conteneur glissent à leur nouvelle place quand la liste
// change (ordre, ajout, retrait) : les voisins s'écartent ou se resserrent au
// lieu de sauter. `cle` dit la composition de la liste (ses identifiants
// joints) ; le mouvement joue à chaque fois qu'elle change, jamais au premier
// rendu. Le conteneur peut arriver après un écran de chargement : tant que la
// référence est vide, rien n'est relevé, et le premier relevé ne joue rien.
export default function useGlissement(ref, cle) {
  const places = React.useRef(null);
  React.useLayoutEffect(() => {
    const conteneur = ref.current;
    if (!conteneur) { places.current = null; return; }
    if (places.current) glisserDepuis(conteneur, places.current);
    places.current = releverPlaces(conteneur);
  }, [ref, cle]);
}
