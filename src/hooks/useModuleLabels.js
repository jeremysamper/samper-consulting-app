import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../services/supabase.js';

const TABLE = 'module_labels';

/**
 * Labels personnalisés de modules — portée GLOBALE (tous établissements).
 *
 * Les clés techniques (module_key = navItem.id) ne changent JAMAIS côté code.
 * Seul le label affiché est stocké ici. Une seule valeur par clé, partagée
 * par tous les établissements de l'application.
 *
 * Utilisation :
 *   const { getLabelForModule, updateLabel, resetLabel } = useModuleLabels();
 *   getLabelForModule('previsions', 'Prévisions') → label custom ou 'Prévisions'
 */
export function useModuleLabels() {
  // { module_key: label } — vide tant que les labels n'ont pas été chargés
  const [labels, setLabels] = useState({});

  useEffect(() => {
    let mounted = true;
    supabase
      .from(TABLE)
      .select('module_key, label')
      // Pas de filtre etablissement_id — les labels sont globaux
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
  }, []); // Pas de dépendance — global, chargé une seule fois

  /**
   * Retourne le label custom s'il existe, sinon le label par défaut.
   * Stable tant que les labels ne changent pas (useCallback sur [labels]).
   */
  const getLabelForModule = useCallback(
    (key, defaultLabel) => labels[key] ?? defaultLabel,
    [labels],
  );

  /**
   * Enregistre (upsert) un label custom globalement.
   * Met à jour le state local immédiatement — pas besoin de refetch.
   * Retourne { error: string | null }.
   */
  const updateLabel = useCallback(async (key, label) => {
    const trimmed = (label || '').trim();
    if (!trimmed) return { error: 'Le label ne peut pas être vide.' };

    const { error } = await supabase
      .from(TABLE)
      .upsert(
        {
          module_key: key,
          label: trimmed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'module_key' }, // contrainte unique sur module_key seul
      );

    if (error) {
      console.error('[useModuleLabels] updateLabel', error);
      return { error: 'Erreur technique. Réessaie ou contacte le support.' };
    }

    setLabels((prev) => ({ ...prev, [key]: trimmed }));
    return { error: null };
  }, []);

  /**
   * Supprime le label custom global (retour au label par défaut du code).
   * Retourne { error: string | null }.
   */
  const resetLabel = useCallback(async (key) => {
    const { error } = await supabase
      .from(TABLE)
      .delete()
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
  }, []);

  return { getLabelForModule, updateLabel, resetLabel, labels };
}
