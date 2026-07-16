import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase.js';

/**
 * Alertes actives pour un établissement - fetch + Realtime + lecture + dismiss.
 *
 * @param {string|null} etablissementId
 * @returns {{
 *   alerts: object[],
 *   unreadCount: number,
 *   dismiss: (id: string) => Promise<void>,
 *   dismissAll: () => Promise<void>,
 *   markAllRead: () => Promise<void>,
 *   loading: boolean,
 *   error: string|null,
 * }}
 */
export function useAlertInstances(etablissementId) {
  const [alerts, setAlerts]   = useState([]);
  const [reads, setReads]     = useState(new Set()); // instance_id déjà lus par l'user courant
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ─── Chargement initial + Realtime ────────────────────────────────
  useEffect(() => {
    if (!etablissementId) {
      setAlerts([]);
      setReads(new Set());
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user ?? null; // session locale (0 réseau), l'id suffit, la RLS impose user_id côté serveur

        const [instancesRes, readsRes] = await Promise.all([
          supabase
            .from('alert_instances')
            .select('*')
            .eq('etablissement_id', etablissementId)
            .eq('status', 'active')
            .order('created_at', { ascending: false }),
          user
            ? supabase
                .from('alert_reads')
                .select('instance_id')
                .eq('user_id', user.id)
            : Promise.resolve({ data: [], error: null }),
        ]);

        if (!mounted) return;

        if (instancesRes.error) {
          console.error('[useAlertInstances] fetch', instancesRes.error);
          setError('Erreur lors du chargement des alertes.');
        } else {
          setAlerts(instancesRes.data || []);
        }

        if (!readsRes.error) {
          setReads(new Set((readsRes.data || []).map((r) => r.instance_id)));
        }
      } catch (err) {
        console.error('[useAlertInstances] load', err);
        if (mounted) setError('Erreur technique.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();

    // Realtime - INSERT : nouvelle alerte déclenchée par le cron
    // Realtime - UPDATE : alerte résolue/dismissée depuis un autre client
    const channel = supabase
      .channel(`alert_instances_${etablissementId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'alert_instances',
          filter: `etablissement_id=eq.${etablissementId}`,
        },
        (payload) => {
          const newAlert = payload.new;
          if (newAlert.status === 'active') {
            setAlerts((prev) => [newAlert, ...prev]);
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event:  'UPDATE',
          schema: 'public',
          table:  'alert_instances',
          filter: `etablissement_id=eq.${etablissementId}`,
        },
        (payload) => {
          const updated = payload.new;
          if (updated.status !== 'active') {
            // Alerte résolue ou dismissée depuis un autre onglet/device
            setAlerts((prev) => prev.filter((a) => a.id !== updated.id));
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [etablissementId]);

  // ─── unreadCount ──────────────────────────────────────────────────
  // Nombre d'alertes actives sans entrée dans alert_reads pour cet user
  const unreadCount = alerts.filter((a) => !reads.has(a.id)).length;

  // ─── markAllRead ─────────────────────────────────────────────────
  // Insère des lignes dans alert_reads pour toutes les alertes non lues.
  // Appelé à l'ouverture du dropdown.
  const markAllRead = useCallback(async () => {
    const unread = alerts.filter((a) => !reads.has(a.id));
    if (!unread.length) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null; // session locale (0 réseau), l'id suffit, la RLS impose user_id côté serveur
    if (!user) return;

    const { error: upsertErr } = await supabase
      .from('alert_reads')
      .upsert(
        unread.map((a) => ({ instance_id: a.id, user_id: user.id })),
        { onConflict: 'instance_id,user_id' },
      );

    if (!upsertErr) {
      setReads((prev) => new Set([...prev, ...unread.map((a) => a.id)]));
    } else {
      console.error('[useAlertInstances] markAllRead', upsertErr);
    }
  }, [alerts, reads]);

  // ─── dismiss ─────────────────────────────────────────────────────
  // Passe une alerte individuelle en 'dismissed'.
  const dismiss = useCallback(async (id) => {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null; // session locale (0 réseau), l'id suffit, la RLS impose user_id côté serveur
    const { error: updateErr } = await supabase
      .from('alert_instances')
      .update({
        status:       'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id ?? null,
      })
      .eq('id', id);

    if (!updateErr) {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      setReads((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } else {
      console.error('[useAlertInstances] dismiss', updateErr);
    }
  }, []);

  // ─── dismissAll ──────────────────────────────────────────────────
  // Passe toutes les alertes actives en 'dismissed'.
  const dismissAll = useCallback(async () => {
    if (!alerts.length) return;

    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null; // session locale (0 réseau), l'id suffit, la RLS impose user_id côté serveur
    const ids = alerts.map((a) => a.id);

    const { error: updateErr } = await supabase
      .from('alert_instances')
      .update({
        status:       'dismissed',
        dismissed_at: new Date().toISOString(),
        dismissed_by: user?.id ?? null,
      })
      .in('id', ids);

    if (!updateErr) {
      setAlerts([]);
      setReads(new Set());
    } else {
      console.error('[useAlertInstances] dismissAll', updateErr);
    }
  }, [alerts]);

  return { alerts, unreadCount, dismiss, dismissAll, markAllRead, loading, error };
}
