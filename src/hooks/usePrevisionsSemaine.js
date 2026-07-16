import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase.js';
import { isoDate, parseLocalDate } from '../utils/dateHelpers.js';

function mapError(error) {
  if (!error) return null;
  console.error('[usePrevisionsSemaine] erreur Supabase', error);
  const MESSAGES = {
    'PGRST301': 'Session expirée. Reconnecte-toi.',
  };
  return MESSAGES[String(error.code || '')] || 'Erreur technique. Réessaie ou contacte le support.';
}

/**
 * Construit le squelette des 7 jours de la semaine avec zéro couvert partout.
 * Utilise parseLocalDate pour éviter le piège UTC (new Date('YYYY-MM-DD') = minuit UTC).
 */
function buildSemaineVide(dateDebutStr) {
  const base = parseLocalDate(dateDebutStr);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    return {
      date_service:    isoDate(d),
      couverts_midi:   0,
      couverts_soir:   0,
      couverts_brunch: 0,
      nb_groupes:      0,
      tags_critiques:  [],
      total_couverts:  0,
    };
  });
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
      // Calcul plage en local (parseLocalDate évite le décalage UTC+x)
      const dateStr = typeof dateDebut === 'string' ? dateDebut : isoDate(dateDebut);
      const base    = parseLocalDate(dateStr);
      const dateFin = isoDate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + 6));

      const t0 = performance.now();
      // Requête directe sur la table d'agrégats previsions_jour.
      // Remplace l'ancienne RPC get_semaine_previsions (JSONB + SECURITY DEFINER overhead).
      const { data, error: err } = await supabase
        .from('previsions_jour')
        .select('date_service, couverts_midi, couverts_soir, couverts_brunch, nb_groupes, tags_critiques')
        .eq('etablissement_id', etablissementId)
        .gte('date_service', dateStr)
        .lte('date_service', dateFin)
        .order('date_service');
      const t1 = performance.now();
      console.log(`[usePrevisionsSemaine] query ${(t1 - t0).toFixed(0)}ms`, { dateStr, dateFin, rows: data?.length ?? 0 });

      if (err) { setError(mapError(err)); return; }

      // Reconstituer les 7 jours : previsions_jour ne contient que les jours
      // ayant au moins une réservation (créée par trigger). Les jours vides
      // ne sont pas en base - on les complète avec des zéros.
      const byDate = Object.fromEntries((data || []).map((row) => [row.date_service, row]));
      const merged = buildSemaineVide(dateStr).map((jour) => {
        const row = byDate[jour.date_service];
        if (!row) return jour;
        const midi   = row.couverts_midi   ?? 0;
        const soir   = row.couverts_soir   ?? 0;
        const brunch = row.couverts_brunch ?? 0;
        return {
          date_service:    jour.date_service,
          couverts_midi:   midi,
          couverts_soir:   soir,
          couverts_brunch: brunch,
          nb_groupes:      row.nb_groupes ?? 0,
          tags_critiques:  Array.isArray(row.tags_critiques) ? row.tags_critiques : [],
          total_couverts:  midi + soir + brunch,
        };
      });

      setSemaine(merged);
    } finally {
      setLoading(false);
    }
  }, [etablissementId]);

  return { semaine, loading, error, fetchSemaine };
}
