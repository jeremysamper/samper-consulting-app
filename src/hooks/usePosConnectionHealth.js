import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabase.js';

const POLL_MS = 5 * 60 * 1000; // 5 minutes - ne pas saturer Supabase

/**
 * Une connexion POS est "unhealthy" si :
 *   1. status === 'error'  (cron pos-sync a reçu un 401 / token révoqué)
 *   2. token_expires_at < maintenant + 24h  (expiration imminente ou passée)
 *
 * Note : 'needs_location' n'est pas un état d'alerte, c'est un état de setup intermédiaire.
 * Note : 'disconnected' = volontaire, pas de bandeau.
 */
function isUnhealthy(conn) {
  if (conn.status === 'error') return true;
  if (conn.token_expires_at) {
    const threshold = new Date(Date.now() + 24 * 3600 * 1000);
    if (new Date(conn.token_expires_at) < threshold) return true;
  }
  return false;
}

/**
 * usePosConnectionHealth
 *
 * Remonte la liste des connexions POS dégradées visibles par l'utilisateur (RLS Supabase).
 * Se rafraîchit toutes les 5 minutes + au focus de l'onglet.
 *
 * @param {object}  [opts]
 * @param {boolean} [opts.enabled=true]  Passer false pour les rôles qui ne voient jamais le bandeau.
 *
 * @returns {{ unhealthy: Array, hasIssue: boolean, loading: boolean, refresh: function }}
 */
export function usePosConnectionHealth({ enabled = true } = {}) {
  const [unhealthy, setUnhealthy] = useState([]);
  const [hasIssue, setHasIssue] = useState(false);
  const [loading, setLoading] = useState(true);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      // On interroge uniquement les connexions actives (pas 'disconnected')
      // Les tokens chiffrés ne sont JAMAIS sélectionnés côté client
      const { data, error } = await supabase
        .from('pos_connections')
        .select('id, etablissement_id, status, token_expires_at, etablissements(nom)')
        .in('status', ['connected', 'error', 'needs_location']);

      if (error) {
        console.warn('[usePosConnectionHealth]', error.message);
        return;
      }

      const bad = (data || []).filter(isUnhealthy).map(conn => ({
        id: conn.id,
        etablissementId: conn.etablissement_id,
        nom: conn.etablissements?.nom ?? conn.etablissement_id,
        status: conn.status,
        token_expires_at: conn.token_expires_at,
      }));

      setUnhealthy(bad);
      setHasIssue(bad.length > 0);
    } catch (err) {
      console.warn('[usePosConnectionHealth]', err.message);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      // Rôle non concerné - on ne fait aucune requête
      setLoading(false);
      setUnhealthy([]);
      setHasIssue(false);
      return;
    }

    refresh();
    timerRef.current = setInterval(refresh, POLL_MS);

    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(timerRef.current);
      window.removeEventListener('focus', onFocus);
    };
  }, [enabled, refresh]);

  return { unhealthy, hasIssue, loading, refresh };
}
