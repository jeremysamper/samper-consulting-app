import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabase.js';

/**
 * CRUD des règles d'alerte pour un établissement.
 *
 * @param {string|null} etablissementId
 * @returns {{
 *   rules: object[],
 *   createRule: (data: object) => Promise<{data, error}>,
 *   updateRule: (id: string, partial: object) => Promise<{data, error}>,
 *   deleteRule: (id: string) => Promise<{error}>,
 *   toggleActive: (id: string) => Promise<{data, error}>,
 *   loading: boolean,
 *   error: string|null,
 * }}
 */
export function useAlertRules(etablissementId) {
  const [rules, setRules]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // ─── Chargement initial ───────────────────────────────────────────
  useEffect(() => {
    if (!etablissementId) {
      setRules([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    supabase
      .from('alert_rules')
      .select('*')
      .eq('etablissement_id', etablissementId)
      .order('created_at', { ascending: false })
      .then(({ data, error: fetchErr }) => {
        if (!mounted) return;
        if (fetchErr) {
          console.error('[useAlertRules] fetch', fetchErr);
          setError('Erreur chargement des règles d\'alerte.');
        } else {
          setRules(data || []);
        }
        setLoading(false);
      });

    return () => { mounted = false; };
  }, [etablissementId]);

  // ─── createRule ───────────────────────────────────────────────────
  const createRule = useCallback(async (ruleData) => {
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return { data: null, error: 'Utilisateur non authentifié.' };

    const { data, error: insertErr } = await supabase
      .from('alert_rules')
      .insert({
        ...ruleData,
        etablissement_id: etablissementId,
        created_by:       user.id,
      })
      .select()
      .single();

    if (insertErr) {
      console.error('[useAlertRules] createRule', insertErr);
      return { data: null, error: 'Erreur lors de la création de la règle.' };
    }

    setRules((prev) => [data, ...prev]);
    return { data, error: null };
  }, [etablissementId]);

  // ─── updateRule ───────────────────────────────────────────────────
  const updateRule = useCallback(async (id, partial) => {
    const { data, error: updateErr } = await supabase
      .from('alert_rules')
      .update({ ...partial, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[useAlertRules] updateRule', updateErr);
      return { data: null, error: 'Erreur lors de la mise à jour de la règle.' };
    }

    setRules((prev) => prev.map((r) => (r.id === id ? data : r)));
    return { data, error: null };
  }, []);

  // ─── deleteRule ───────────────────────────────────────────────────
  const deleteRule = useCallback(async (id) => {
    const { error: deleteErr } = await supabase
      .from('alert_rules')
      .delete()
      .eq('id', id);

    if (deleteErr) {
      console.error('[useAlertRules] deleteRule', deleteErr);
      return { error: 'Erreur lors de la suppression de la règle.' };
    }

    setRules((prev) => prev.filter((r) => r.id !== id));
    return { error: null };
  }, []);

  // ─── toggleActive ─────────────────────────────────────────────────
  // Inverse is_active pour la règle donnée.
  const toggleActive = useCallback(async (id) => {
    const rule = rules.find((r) => r.id === id);
    if (!rule) return { data: null, error: 'Règle introuvable.' };

    const { data, error: updateErr } = await supabase
      .from('alert_rules')
      .update({ is_active: !rule.is_active, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) {
      console.error('[useAlertRules] toggleActive', updateErr);
      return { data: null, error: 'Erreur lors de l\'activation/désactivation.' };
    }

    setRules((prev) => prev.map((r) => (r.id === id ? data : r)));
    return { data, error: null };
  }, [rules]);

  return { rules, createRule, updateRule, deleteRule, toggleActive, loading, error };
}
