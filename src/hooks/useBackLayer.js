import { useEffect, useRef, useSyncExternalStore } from 'react';
import { canGoBack, pushLayer, subscribeHistory } from '../services/historyNav.js';

// Rend un calque (tiroir, palette, modale plein écran…) refermable par le
// « retour » : geste Android, glissé depuis le bord, Alt+←, bouton de souris.
// Tant que `open` est vrai, une entrée d'historique le représente ; la fermer
// par l'UI consomme l'entrée, la fermer par « retour » appelle onClose.
//
//   useBackLayer(drawerOpen, () => setDrawerOpen(false), 'drawer');
export function useBackLayer(open, onClose, id = 'layer') {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const release = pushLayer(id, () => onCloseRef.current?.());
    return release;
  }, [open, id]);
}

// Vrai quand un « retour » reste dans l'app (au moins une entrée derrière).
export function useCanGoBack() {
  return useSyncExternalStore(subscribeHistory, canGoBack, () => false);
}
