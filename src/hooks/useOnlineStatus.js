import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

function getSnapshot() {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

// État réseau du navigateur (événements online/offline). navigator.onLine peut
// donner de faux positifs (wifi captif...) : les vrais échecs réseau sont de
// toute façon gérés par la file de punches et les caches SW. Ce hook ne sert
// qu'à l'AFFICHAGE (bandeau, états vides contextualisés), jamais à bloquer.
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
