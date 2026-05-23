import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase.js';

const TABLE = 'module_labels';

/**
 * Labels personnalisés de modules pour un établissement.
 *
 * Les clés techniques (module_key = navItem.id) ne changent JAMAIS côté code.
 * Seul le label affiché est stocké ici pour chaque établissement.
 *
 * Utilisation :
 *   const { getLabelForModule, updateLabel, resetLabel } = useModuleLabels(etablissementId);
 *   getLabelForModule('previsions', 'Prévisions') → label custom ou 'Prévisions'
 */
export function useModuleLabels(etablissementId) {
  // { module_key: label } — vide tant que pas d'établissement ou pas de labels customs
  const [labels, setLabels] = useState({});

  useEffect(() => {
    if (!etablissementId) {
      setLabels({});
      return;
    }
    let mounted = true;
    supabase
      .from(TABLE)
      .select('module_key, label')
      .eq('etablissement_id', etablissementId)
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          console.error('[useModuleLabels] fetch', error);
          return;
        }
        const map = {};
        (data || []).forEach((row) => { map[row.module_key] = row.label; });
        setLabels(map);
      });
    return () => { mounted = false; };
  }, [etablissementId]);

  /**
   * Retourne le label custom s'il existe, sinon le label par défaut.
   * Stable tant que les labels ne changent pas (useCallback sur [labels]).
   */
  const getLabelForModule = useCallback(
    (key, defaultLabel) => labels[key] ?? defaultLabel,
    [labels],
  );

  /**
   * Enregistre (upsert) un label custom.
   * Met à jour le state local immédiatement — pas besoin de refetch.
   * Retourne { error: string | null }.
   */
  const updateLabel = useCallback(async (key, label) => {
    if (!etablissementId) return { error: 'Aucun établissement sélectionné.' };
    const trimmed = (label || '').trim();
    if (!trimmed) return { error: 'Le label ne peut pas être vide.' };

    const { error } = await supabase
      .from(TABLE)
      .upsert(
        {
          etablissement_id: etablissementId,
          module_key: key,
          label: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'etablissement_id,module_key' },
      );

    if (error) {
      console.error('[useModuleLabels] updateLabel', error);
      return { error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    setLabels((prev) => ({ ...prev, [key]: trimmed }));
    return { error: null };
  }, [etablissementId]);

  /**
   * Supprime le label custom (retour au label par défaut du code).
   * Retourne { error: string | null }.
   */
  const resetLabel = useCallback(async (key) => {
    if (!etablissementId) return { error: 'Aucun établissement sélectionné.' };

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq('etablissement_id', etablissementId)
      .eq('module_key', key);

    if (error) {
      console.error('[useModuleLabels] resetLabel', error);
      return { error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    setLabels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    return { error: null };
  }, [etablissementId]);

  return { getLabelForModule, updateLabel, resetLabel, labels };
}
