import React from 'react';
import { glisserDepuis, releverPlaces } from '../utils/mouvement.js';

// Les enfants d'un conteneur glissent à leur nouvelle place quand la liste
// change (ordre, ajout, retrait) : les voisins s'écartent ou se resserrent au
// lieu de sauter. `cle` dit la composition de la liste (ses identifiants
// joints) ; le mouvement joue à chaque fois qu'elle change, jamais au premier
// rendu. Le conteneur peut arriver après un écran de chargement : tant que la
// référence est vide, rien n'est relevé, et le premier relevé ne joue rien.
// Options : `selecteur` pour faire glisser des descendants plutôt que les
// enfants directs, `sauf` pour écarter l'élément qu'on tient (il suit déjà le
// doigt). Elles sont lues au moment du glissement, sans le relancer.
export default function useGlissement(ref, cle, options) {
  const places = React.useRef(null);
  const reglage = React.useRef(options);
  React.useEffect(() => { reglage.current = options; });
  React.useLayoutEffect(() => {
    const conteneur = ref.current;
    if (!conteneur) { places.current = null; return; }
    const { selecteur, sauf } = reglage.current || {};
    if (places.current) glisserDepuis(conteneur, places.current, { selecteur, sauf });
    places.current = releverPlaces(conteneur, selecteur);
  }, [ref, cle]);
}
