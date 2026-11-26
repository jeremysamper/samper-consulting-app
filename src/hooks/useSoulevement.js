import React from 'react';
import { jouer } from '../utils/mouvement.js';

// Un objet qu'on prend en main se soulève, un objet qu'on lâche se pose. Le
// composant pose lui-même l'échelle tenue (scale: var(--mvt-souleve) tant que
// `tenu` est vrai) ; ce hook ne joue que le passage de l'un à l'autre, avec le
// ressort du socle. Rien ne joue au premier rendu.
export default function useSoulevement(ref, tenu) {
  const avant = React.useRef(Boolean(tenu));
  React.useEffect(() => {
    const maintenant = Boolean(tenu);
    if (maintenant === avant.current) return;
    avant.current = maintenant;
    jouer(ref.current, maintenant ? 'souleve' : 'pose');
  }, [ref, tenu]);
}
