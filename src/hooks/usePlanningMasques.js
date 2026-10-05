import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase.js';
import { dbService } from '../services/dbService.js';

// ─────────────────────────────────────────────────────────────────────────────
// usePlanningMasques - personnes masquées du Planning & Pointage d'un
// établissement (table planning_masques, réglée par le consultant et le patron).
//
// Même contrat que useAbsences :
//   status 'loading' | 'ready' | 'error' | 'absent' (migration 20261005 pas
//   encore appliquée : personne n'est masqué et le bouton est caché).
// Une lecture en échec ne vide jamais la liste ; elle est retentée.
// ─────────────────────────────────────────────────────────────────────────────

const TABLE = 'planning_masques';
const RELATION_ABSENTE = new Set(['42P01', 'PGRST205', 'PGRST202']);
const RETRY_MIN_MS = 4000;
const RETRY_MAX_MS = 30000;
const REFUS = 'Seuls le patron et le consultant peuvent masquer une personne.';

function messageErreur(error) {
  console.error('[usePlanningMasques] erreur Supabase', error);
  if (RELATION_ABSENTE.has(error.code)) return 'Le masquage n\'est pas encore activé sur la base de données.';
  if (String(error.code) === '42501') return REFUS;
  return 'Erreur technique. Réessaie ou contacte le support.';
}

export function usePlanningMasques(etablissementId) {
  const [ids, setIds] = useState([]);
  const [status, setStatus] = useState(etablissementId ? 'loading' : 'ready');
  const reloadRef = useRef(null);

  useEffect(() => {
    if (!etablissementId) {
      setIds([]);
      setStatus('ready');
      return undefined;
    }
    let mounted = true;
    let retryTimer = null;
    let retryDelay = RETRY_MIN_MS;
    let loadedOnce = false;

    const reload = async () => {
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      const { data, error } = await supabase
        .from(TABLE)
        .select('user_id')
        .eq('etablissement_id', etablissementId);
      if (!mounted) return;

      if (error) {
        if (RELATION_ABSENTE.has(error.code)) {
          setIds([]);
          setStatus('absent');
          return;
        }
        console.error('[usePlanningMasques] lecture', error);
        if (!loadedOnce) setStatus('error');
        retryTimer = setTimeout(reload, retryDelay);
        retryDelay = Math.min(retryDelay * 2, RETRY_MAX_MS);
        return;
      }

      loadedOnce = true;
      retryDelay = RETRY_MIN_MS;
      setIds((data || []).map((r) => r.user_id));
      setStatus('ready');
    };

    reloadRef.current = reload;
    setIds([]);
    setStatus('loading');
    reload();

    // subscribeReload rejoue aussi la lecture au réveil de l'appareil.
    const realtime = dbService.getRealtime();
    const unsub = realtime?.subscribeReload
      ? realtime.subscribeReload([TABLE], () => { if (mounted) reload(); })
      : null;

    return () => {
      mounted = false;
      reloadRef.current = null;
      if (retryTimer) clearTimeout(retryTimer);
      if (unsub) unsub();
    };
  }, [etablissementId]);

  const masques = useMemo(() => new Set(ids), [ids]);

  const masquer = useCallback(async (userId) => {
    const { error } = await supabase
      .from(TABLE)
      .upsert({ etablissement_id: etablissementId, user_id: userId }, { onConflict: 'etablissement_id,user_id', ignoreDuplicates: true });
    if (error) return { error: messageErreur(error) };
    setIds((liste) => (liste.includes(userId) ? liste : [...liste, userId]));
    return { error: null };
  }, [etablissementId]);

  const afficher = useCallback(async (userId) => {
    // La RLS ne lève pas d'erreur sur une suppression refusée : elle ne
    // supprime rien. On relit donc les lignes réellement supprimées.
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('etablissement_id', etablissementId)
      .eq('user_id', userId)
      .select('user_id');
    if (error) return { error: messageErreur(error) };
    if (!data || !data.length) {
      reloadRef.current?.();
      return { error: REFUS };
    }
    setIds((liste) => liste.filter((id) => id !== userId));
    return { error: null };
  }, [etablissementId]);

  return { masques, status, masquer, afficher };
}
