import React from 'react';
import { supabase } from '../../services/supabase.js';
import { useMiseEnPlace } from '../pos/hooks/useMiseEnPlace.js';
import { zurichAjouterJours, zurichToday } from '../../utils/zurichTime.js';
import { messageErreur } from '../../utils/messageErreur.js';
import { lireVentesCaisse } from './ventesCaisse.js';
import { choisirSource, dowDeJour, ventesCaisseParFiche } from './serieVentesCaisse.js';

// Ventes de la « Mise en place de demain » : la Caisse native (14 jours finis,
// de J-14 à J-1) dès qu'elle porte des ventes, sinon Ventes POS
// (useMiseEnPlace, toujours appelé : un crochet ne s'appelle pas sous
// condition). Rend { source, items, sansFiche, joursComparables, nonRelies,
// loading, error, reload }.
export function useVentesDemain(etablissement) {
  const etabId = etablissement?.id || null;
  const pos = useMiseEnPlace(etablissement);
  const [caisse, setCaisse] = React.useState({ loading: true, error: null, resultat: null });
  const [tour, setTour] = React.useState(0);

  React.useEffect(() => {
    if (!etabId) { setCaisse({ loading: false, error: null, resultat: null }); return undefined; }
    let vivant = true;
    setCaisse({ loading: true, error: null, resultat: null });
    const aujourdhui = zurichToday();
    const demain = zurichAjouterJours(aujourdhui, 1);
    (async () => {
      try {
        const { data, error } = await lireVentesCaisse(supabase, etabId, zurichAjouterJours(aujourdhui, -14), zurichAjouterJours(aujourdhui, -1));
        if (!vivant) return;
        if (error) throw error;
        setCaisse({ loading: false, error: null, resultat: ventesCaisseParFiche({ ...data, dowDemain: dowDeJour(demain) }) });
      } catch (err) {
        if (!vivant) return;
        setCaisse({ loading: false, error: messageErreur(err, 'mep ventes caisse', 'Lecture impossible.'), resultat: null });
      }
    })();
    return () => { vivant = false; };
  }, [etabId, tour]);

  const reloadPos = pos.reload;
  const reload = React.useCallback(() => {
    setTour((t) => t + 1);
    reloadPos?.();
  }, [reloadPos]);

  const choix = choisirSource({
    caisse: { loading: caisse.loading, error: caisse.error, ...(caisse.resultat || {}) },
    pos,
  });
  return { ...choix, reload };
}
