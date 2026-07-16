import { useState, useCallback } from 'react';
import { supabase } from '../services/supabase.js';

// Couverts/cuisinier/heure selon le score de complexité moyen
const CAPACITE = {
  1: [8, 10], 2: [8, 10],
  3: [5, 7],
  4: [3, 5],
  5: [1, 3],
};

/**
 * Calcule les couverts réalisables en JS pur (sans appel IA).
 * Appelé à chaque changement du slider cuisiniers.
 *
 * @param {number}   scoreMoyen        - score de complexité moyen (1-5)
 * @param {number}   nbCuisiniers      - nombre de cuisiniers (1-10)
 * @param {string}   dureeService      - 'midi' | 'soir'
 * @param {number[]} scoresIndividuels - scores de chaque plat (pour calcul variance)
 * @returns {{ couverts_min, couverts_max, charge_brigade }}
 */
export function computeCouverts(scoreMoyen, nbCuisiniers, dureeService, scoresIndividuels = []) {
  const heures  = dureeService === 'midi' ? 2 : 3;
  const sc      = Math.max(1, Math.min(5, Math.round(scoreMoyen)));
  const [cMin, cMax] = CAPACITE[sc] || [3, 5];

  // Malus si variance des complexités > 2 niveaux (goulot d'étranglement)
  const variance = scoresIndividuels.length > 1
    ? Math.max(...scoresIndividuels) - Math.min(...scoresIndividuels)
    : 0;
  const malus = variance > 2 ? 0.85 : 1;

  return {
    couverts_min:   Math.round(cMin * nbCuisiniers * heures * malus),
    couverts_max:   Math.round(cMax * nbCuisiniers * heures * malus),
    charge_brigade: Math.min(100, Math.round((sc / 5) * 100 * (1 / malus))),
  };
}

/**
 * Hook principal - analyse IA d'une carte + persistance des scores en base.
 *
 * analyseSimulation({ plats, nbCuisiniers, dureeService, segment })
 *   - plats : [{ id, nom, ingredients: string[] }]
 *   - nbCuisiniers : 1-10
 *   - dureeService : 'midi' | 'soir'
 *   - segment : 'bistro' | 'gastro' | 'luxe'
 *
 * result : {
 *   plats: [{ id, nom, score, justification, suggestion, impact_si_simplifie }],
 *   score_moyen, couverts_min, couverts_max, charge_brigade, alerte, synthese
 * }
 */
export function useSimulationIA() {
  const [result,  setResult]  = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const analyseSimulation = useCallback(async ({ plats, nbCuisiniers, dureeService, segment }) => {
    if (!plats || plats.length === 0) {
      setError('Aucun plat à analyser.');
      return { data: null, error: 'Aucun plat à analyser.' };
    }

    setLoading(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke('ai-proxy', {
        body: {
          task: 'analyse-simulation-carte',
          payload: { plats, nbCuisiniers, dureeService, segment },
        },
      });

      if (fnErr) {
        let msg = fnErr.message || 'Appel IA échoué.';
        try {
          const ctx = fnErr.context && typeof fnErr.context.json === 'function'
            ? await fnErr.context.json() : null;
          if (ctx?.error) msg = ctx.error;
        } catch {}
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);

      const r = data?.result;
      if (!r || !Array.isArray(r.plats)) throw new Error('Réponse IA invalide.');

      setResult(r);

      // Persistance des scores sur les recettes (fire-and-forget, erreur non bloquante)
      const now = new Date().toISOString();
      const updates = r.plats
        .filter(p => p.id && Number.isInteger(p.score) && p.score >= 1 && p.score <= 5)
        .map(p =>
          supabase
            .from('recettes')
            .update({
              complexity_score:      p.score,
              complexity_note:       p.justification || null,
              complexity_updated_at: now,
            })
            .eq('id', p.id)
        );
      Promise.all(updates).catch(e =>
        console.warn('[useSimulationIA] persistance scores:', e)
      );

      return { data: r, error: null };
    } catch (e) {
      const msg = e.message || 'Erreur inconnue.';
      setError(msg);
      return { data: null, error: msg };
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { result, loading, error, analyseSimulation, reset };
}
