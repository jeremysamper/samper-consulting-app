/**
 * usePosItemsMapping — Chargement et mutations du mapping POS ↔ Recettes
 *
 * Fournit :
 *   posItems   : plats POS actifs de l'établissement (via pos_connections)
 *   recettes   : fiches techniques disponibles (RLS scopé à l'étab)
 *   mappings   : { [pos_item_id]: { recipe_id, confidence, manually_validated } }
 *   loading / error / reload
 *   validateMapping(posItemId)          → manually_validated = true
 *   changeMapping(posItemId, recipeId, score) → upsert + manually_validated = true
 *   unlinkMapping(posItemId)            → DELETE
 */

import { useState, useEffect, useCallback } from 'react';
import { dbService } from '../../../services/dbService.js';

export function usePosItemsMapping(etablissement, user) {
  const [posItems, setPosItems]   = useState([]);
  const [recettes, setRecettes]   = useState([]);
  const [mappings, setMappings]   = useState({});
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // ── Chargement ────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!etablissement?.id) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = dbService.getClient();

      // 1. Connexions actives de l'établissement
      const { data: connections, error: connErr } = await db
        .from('pos_connections')
        .select('id')
        .eq('etablissement_id', etablissement.id)
        .eq('status', 'connected');

      if (connErr) throw connErr;

      if (!connections?.length) {
        setPosItems([]);
        setMappings({});
        // On charge quand même les recettes (utiles pour l'empty state)
        const { data: recipes } = await db
          .from('recettes')
          .select('id, nom')
          .order('nom');
        setRecettes(recipes ?? []);
        setLoading(false);
        return;
      }

      const connectionIds = connections.map((c) => c.id);

      // 2. Plats POS actifs (non archivés)
      const { data: items, error: itemsErr } = await db
        .from('pos_items')
        .select('id, name, sku, accounting_group, pos_connection_id')
        .in('pos_connection_id', connectionIds)
        .is('archived_at', null)
        .order('name');

      if (itemsErr) throw itemsErr;

      const allItems = items ?? [];

      // 3. Mappings existants pour ces plats
      const itemIds = allItems.map((i) => i.id);
      let mappingMap = {};

      if (itemIds.length > 0) {
        const { data: mappingRows, error: mappingErr } = await db
          .from('pos_item_recipe_mapping')
          .select('pos_item_id, recipe_id, confidence, manually_validated')
          .in('pos_item_id', itemIds);

        if (mappingErr) throw mappingErr;

        for (const m of (mappingRows ?? [])) {
          mappingMap[m.pos_item_id] = {
            recipe_id:          m.recipe_id,
            confidence:         Number(m.confidence ?? 0),
            manually_validated: Boolean(m.manually_validated),
          };
        }
      }

      // 4. Recettes disponibles (RLS gère le scope établissement)
      const { data: recipes, error: recipesErr } = await db
        .from('recettes')
        .select('id, nom')
        .order('nom');

      if (recipesErr) throw recipesErr;

      setPosItems(allItems);
      setMappings(mappingMap);
      setRecettes(recipes ?? []);
    } catch (e) {
      console.error('[usePosItemsMapping] Erreur chargement :', e);
      setError(e?.message ?? 'Erreur lors du chargement des données POS');
    } finally {
      setLoading(false);
    }
  }, [etablissement?.id]);

  useEffect(() => { load(); }, [load]);

  // ── Mutations ─────────────────────────────────────────────────

  /**
   * Valide un mapping existant (manually_validated → true).
   * À utiliser quand le mapping existe déjà en DB.
   */
  const validateMapping = useCallback(async (posItemId) => {
    const db = dbService.getClient();

    const { error } = await db
      .from('pos_item_recipe_mapping')
      .update({
        manually_validated: true,
        matched_at:         new Date().toISOString(),
        matched_by:         user?.id ?? null,
      })
      .eq('pos_item_id', posItemId);

    if (error) throw new Error(error.message);

    setMappings((prev) => ({
      ...prev,
      [posItemId]: {
        ...prev[posItemId],
        manually_validated: true,
      },
    }));
  }, [user?.id]);

  /**
   * Crée ou modifie un mapping (upsert).
   * Toujours manually_validated = true (action humaine explicite).
   */
  const changeMapping = useCallback(async (posItemId, recipeId, confidence = 0) => {
    const db = dbService.getClient();

    const { error } = await db
      .from('pos_item_recipe_mapping')
      .upsert(
        {
          pos_item_id:        posItemId,
          recipe_id:          recipeId,
          confidence:         Math.round(confidence),
          manually_validated: true,
          matched_at:         new Date().toISOString(),
          matched_by:         user?.id ?? null,
        },
        { onConflict: 'pos_item_id' }
      );

    if (error) throw new Error(error.message);

    setMappings((prev) => ({
      ...prev,
      [posItemId]: {
        recipe_id:          recipeId,
        confidence:         Math.round(confidence),
        manually_validated: true,
      },
    }));
  }, [user?.id]);

  /**
   * Supprime un mapping (le plat repasse en "à mapper").
   */
  const unlinkMapping = useCallback(async (posItemId) => {
    const db = dbService.getClient();

    const { error } = await db
      .from('pos_item_recipe_mapping')
      .delete()
      .eq('pos_item_id', posItemId);

    if (error) throw new Error(error.message);

    setMappings((prev) => {
      const next = { ...prev };
      delete next[posItemId];
      return next;
    });
  }, []);

  return {
    posItems,
    recettes,
    mappings,
    loading,
    error,
    reload: load,
    validateMapping,
    changeMapping,
    unlinkMapping,
  };
}
