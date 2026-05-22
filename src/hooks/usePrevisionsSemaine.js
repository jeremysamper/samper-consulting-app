import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase.js';
import { isoDate } from '../utils/dateHelpers.js';

function mapError(error) {
  if (!error) return null;
  console.error('[usePrevisionsSemaine] erreur Supabase', error);
  const MESSAGES = {
    'PGRST301': 'Session expirée. Reconnecte-toi.',
  };
  return MESSAGES[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

export function usePrevisionsSemaine(etablissementId) {
  const [semaine, setSemaine] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const fetchSemaine = useCallback(async (dateDebut) => {
    if (!etablissementId || !dateDebut) return;
    setLoading(true);
    setError(null);
    try {
      const dateStr = typeof dateDebut === 'string' ? dateDebut : isoDate(dateDebut);
      const t0 = performance.now();
      const { data, error: err } = await supabase.rpc('get_semaine_previsions', {
        p_etablissement_id: etablissementId,
        p_date_debut:       dateStr,
      });
      const t1 = performance.now();
      console.log(`[usePrevisionsSemaine] RPC ${(t1 - t0).toFixed(0)}ms`, { dateStr, count: data?.length });
      if (err) { setError(mapError(err)); return; }
      setSemaine(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, [etablissementId]);

  return { semaine, loading, error, fetchSemaine };
}
