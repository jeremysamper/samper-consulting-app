// ================================================================
// posApi.js — Client partage pour les edge functions POS
//
// Centralise l'appel authentifie aux fonctions Supabase pos-oauth
// et pos-backfill (session JWT de l'utilisateur courant).
//
//   pos-oauth   : actions status / get_auth_url / test / disconnect
//   pos-backfill: import des ventes sur N jours { connectionId, days }
//
// Note : pos-sync (cron) n'est PAS appelable cote client (auth CRON_SECRET).
// La synchro manuelle passe donc par pos-backfill.
// ================================================================
import { supabase, getSupabaseConfig } from '../../../services/supabase.js';

export const POS_OAUTH_FN    = 'pos-oauth';
export const POS_BACKFILL_FN = 'pos-backfill';

/**
 * Appelle une edge function POS avec la session de l'utilisateur.
 *
 * @param {string}  fnName  slug de la fonction ('pos-oauth' | 'pos-backfill')
 * @param {string?} action  action pour pos-oauth (ex. 'status'). null pour pos-backfill.
 * @param {object}  body    corps additionnel
 * @returns {Promise<object>} reponse JSON
 */
export async function callPosEdge(fnName, action, body = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Non authentifie');

  const { url } = getSupabaseConfig();
  const res = await fetch(`${url}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(action ? { action, ...body } : body),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  return data;
}
