import React from 'react';
import { subscribeResume } from '../services/resumeCoordinator.js';

// ─────────────────────────────────────────────────────────────────────────────
// useResumeRefresh - rejoue une lecture quand l'appareil « revient ».
//
// Une tablette mise en veille (ou un onglet laissé de côté une heure) perd son
// canal realtime et peut voir son JWT expirer : au réveil plus aucun event
// n'arrive, et la première requête peut repartir en erreur. Les modules qui ne
// chargeaient qu'au montage restaient alors sur des données figées - ou vides
// si cette première requête avait échoué.
//
// `onResume` est rejoué par src/services/resumeCoordinator.js : réveil de
// l'appareil (y compris bfcache iOS et veille d'un PC dont l'onglet est resté
// visible), retour du réseau, réseau revenu après un échec. Le coordinateur
// attend que la session soit saine avant de tirer : ne pas poser d'écouteur
// visibilitychange / online à la main dans un module, ils partent trop tôt.
//
// Le callback est lu via une ref : pas besoin qu'il soit stable.
// `minIntervalMs` borne en plus les tirs de CE hook (le coordinateur bride déjà
// l'ensemble à un par 10 s).
// ─────────────────────────────────────────────────────────────────────────────

export function useResumeRefresh(onResume, { minIntervalMs = 0 } = {}) {
  const callbackRef = React.useRef(onResume);
  React.useEffect(() => { callbackRef.current = onResume; }, [onResume]);

  React.useEffect(() => {
    let lastFiredAt = 0;
    return subscribeResume(() => {
      const now = Date.now();
      if (now - lastFiredAt < minIntervalMs) return;
      lastFiredAt = now;
      callbackRef.current && callbackRef.current();
    });
  }, [minIntervalMs]);
}
