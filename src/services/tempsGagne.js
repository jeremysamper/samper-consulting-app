import { supabase } from './supabase.js';
import { estGeste } from './tempsGagneBareme.js';

// ─────────────────────────────────────────────────────────────────────────────
// Temps gagné (lot T) : inscription d'un geste fait par l'app, et lecture de la
// semaine pour le tableau de bord du patron. Barème : tempsGagneBareme.js.
//
// L'inscription ne bloque jamais le geste qu'elle compte : elle part après lui,
// sans attente, et une erreur (table absente, réseau, droit) ne s'affiche pas.
// Un geste non inscrit est un gain non compté, jamais une donnée perdue.
// ─────────────────────────────────────────────────────────────────────────────

const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);

export function inscrireGeste(etablissementId, geste, quantite = 1) {
  const q = Math.min(500, Math.max(0, Math.floor(Number(quantite) || 0)));
  if (!etablissementId || !estGeste(geste) || q <= 0) return;
  Promise.resolve()
    .then(() => supabase.auth.getUser())
    .then(({ data }) => {
      const uid = data?.user?.id;
      if (!uid) return null;
      return supabase.from('temps_gagne').insert({ etablissement_id: etablissementId, geste, quantite: q, fait_par: String(uid) });
    })
    .then((res) => {
      if (res?.error && !RELATION_ABSENTE.has(res.error.code)) console.warn('[tempsGagne] inscription', res.error);
    })
    .catch((err) => console.warn('[tempsGagne] inscription', err));
}

// Gestes d'un établissement depuis un instant (ISO UTC). Rend
// { statut: 'pret', lignes } ou { statut: 'absent' } (migration pas appliquée)
// ou { statut: 'erreur' }.
export async function lireTempsGagne(etablissementId, depuisIso) {
  const { data, error } = await supabase
    .from('temps_gagne')
    .select('geste, quantite, created_at')
    .eq('etablissement_id', etablissementId)
    .gte('created_at', depuisIso)
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) {
    if (RELATION_ABSENTE.has(error.code)) return { statut: 'absent' };
    console.warn('[tempsGagne] lecture', error);
    return { statut: 'erreur' };
  }
  return { statut: 'pret', lignes: data || [] };
}
