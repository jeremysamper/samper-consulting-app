import React from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// useResumeRefresh - rejoue une lecture quand l'appareil « revient ».
//
// Une tablette mise en veille (ou un onglet laissé de côté une heure) perd son
// canal realtime et peut voir son JWT expirer : au réveil plus aucun event
// n'arrive, et la première requête peut repartir en erreur. Les modules qui ne
// chargeaient qu'au montage restaient alors sur des données figées - ou vides
// si cette première requête avait échoué.
//
// On rejoue donc `onResume` quand l'onglet redevient visible, quand la page est
// restaurée depuis le bfcache (iOS : `pageshow` sans `visibilitychange`) et au
// retour du réseau. `minIntervalMs` évite les rafales : au réveil les trois
// événements arrivent souvent groupés.
//
// Le callback est lu via une ref : pas besoin qu'il soit stable, et les
// écouteurs ne sont posés qu'une fois.
// ─────────────────────────────────────────────────────────────────────────────

export function useResumeRefresh(onResume, { minIntervalMs = 10000 } = {}) {
  const callbackRef = React.useRef(onResume);
  React.useEffect(() => { callbackRef.current = onResume; }, [onResume]);

  React.useEffect(() => {
    let lastFiredAt = 0;
    const fire = () => {
      const now = Date.now();
      if (now - lastFiredAt < minIntervalMs) return;
      lastFiredAt = now;
      callbackRef.current && callbackRef.current();
    };
    const onVisible = () => { if (!document.hidden) fire(); };
    const onPageShow = (e) => { if (e.persisted) fire(); };

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', fire);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', fire);
    };
  }, [minIntervalMs]);
}
