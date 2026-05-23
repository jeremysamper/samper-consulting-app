/**
 * useConsoIngredients — Consommation théorique des ingrédients sur une période
 *
 * Algorithme :
 *   Pour chaque vente de pos_item mappé sur la période :
 *     recette = recette liée via pos_item_recipe_mapping
 *     Si recette.portions <= 0 → exclu (excludedNoPortions++)
 *     Pour chaque ingredient de recette.ingredients :
 *       conso += qty_vendue × (ingredient.quantite / recette.portions)
 *   Agréger par (nom, unite)
 *
 * Normalisation Option B (seuil 500) :
 *   unite=g  && total >= 500 → total/1000 kg (2 décimales)
 *   unite=ml && total >= 500 → total/1000 L  (2 décimales)
 *   sinon                    → arrondi à 1 décimale, unité native
 *
 * Paramètres :
 *   etablissement : { id, timezone? }
 *   dateRange     : { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' }
 *
 * Retourne :
 *   items               : [{nom, quantite, unite}] trié par quantite_raw décroissant
 *   mappedWithSalesCount: nombre de pos_items mappés ayant des ventes sur la période
 *   totalMappedCount    : nombre total de pos_items mappés
 *   excludedNoPortions  : recettes sans portions définies (exclues du calcul)
 *   loading / error / reload
 */

import { useState, useEffect, useCallback } from 'react';
import { dbService } from '../../../services/dbService.js';

// ── Normalisation ─────────────────────────────────────────────────────────────

/**
 * Normalise une quantité brute selon la règle Option B.
 * @param {number} raw     Quantité brute (dans l'unité native)
 * @param {string} unite   Unité native ('g', 'ml', 'pcs', ...)
 * @returns {{ quantite: number, unite: string }}
 */
export function normalizeQty(raw, unite) {
  if (unite === 'g' && raw >= 500) {
    return { quantite: Math.round(raw / 10) / 100, unite: 'kg' };
  }
  if (unite === 'ml' && raw >= 500) {
    return { quantite: Math.round(raw / 10) / 100, unite: 'L' };
  }
  // Petites quantités : 1 décimale
  return { quantite: Math.round(raw * 10) / 10, unite };
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useConsoIngredients(etablissement, dateRange) {
  const [items, setItems]                         = useState([]);
  const [mappedWithSalesCount, setMappedWithSalesCount] = useState(0);
  const [totalMappedCount, setTotalMappedCount]   = useState(0);
  const [excludedNoPortions, setExcludedNoPortions] = useState(0);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState(null);

  const load = useCallback(async () => {
    if (!etablissement?.id || !dateRange?.from || !dateRange?.to) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const db = dbService.getDb();

      // 1. Connexions actives
      const { data: conns, error: connErr } = await db
        .from('pos_connections')
        .select('id')
        .eq('etablissement_id', etablissement.id)
        .eq('status', 'connected');
      if (connErr) throw connErr;

      if (!conns?.length) {
        setItems([]); setTotalMappedCount(0); setMappedWithSalesCount(0);
        setLoading(false);
        return;
      }
      const connIds = conns.map((c) => c.id);

      // 2. Plats POS actifs
      const { data: posItems, error: itemsErr } = await db
        .from('pos_items')
        .select('id')
        .in('pos_connection_id', connIds)
        .is('archived_at', null);
      if (itemsErr) throw itemsErr;

      const allItemIds = (posItems ?? []).map((i) => i.id);
      if (!allItemIds.length) {
        setItems([]); setTotalMappedCount(0); setMappedWithSalesCount(0);
        setLoading(false);
        return;
      }

      // 3. Mappings
      const { data: mappingRows, error: mappingErr } = await db
        .from('pos_item_recipe_mapping')
        .select('pos_item_id, recipe_id')
        .in('pos_item_id', allItemIds);
      if (mappingErr) throw mappingErr;

      const mappingByItem = {};
      for (const m of (mappingRows ?? [])) {
        mappingByItem[m.pos_item_id] = m.recipe_id;
      }
      const mappedItemIds = Object.keys(mappingByItem);
      setTotalMappedCount(mappedItemIds.length);

      if (!mappedItemIds.length) {
        setItems([]); setMappedWithSalesCount(0); setExcludedNoPortions(0);
        setLoading(false);
        return;
      }

      // 4. Ventes sur la période (mappés uniquement)
      const { data: salesRows, error: salesErr } = await db
        .from('pos_sales')
        .select('pos_item_id, qty')
        .in('pos_item_id', mappedItemIds)
        .gte('date', dateRange.from)
        .lte('date', dateRange.to);
      if (salesErr) throw salesErr;

      // Agréger les ventes par pos_item
      const qtySoldByItem = {};
      for (const s of (salesRows ?? [])) {
        qtySoldByItem[s.pos_item_id] = (qtySoldByItem[s.pos_item_id] ?? 0) + s.qty;
      }
      const itemsWithSales = Object.keys(qtySoldByItem);
      setMappedWithSalesCount(itemsWithSales.length);

      if (!itemsWithSales.length) {
        setItems([]); setExcludedNoPortions(0);
        setLoading(false);
        return;
      }

      // 5. Recettes (ingredients JSONB + portions) pour les items ayant des ventes
      const recipeIdsNeeded = [...new Set(
        itemsWithSales.map((id) => mappingByItem[id]).filter(Boolean)
      )];

      const { data: recetteRows, error: recErr } = await db
        .from('recettes')
        .select('id, portions, ingredients')
        .in('id', recipeIdsNeeded);
      if (recErr) throw recErr;

      const recetteById = {};
      for (const r of (recetteRows ?? [])) recetteById[r.id] = r;

      // 6. Calcul conso par ingrédient
      // accumulator : Map<"nom|unite" → { nom, unite, raw }>
      const acc = new Map();
      let noPortionsCount = 0;

      for (const posItemId of itemsWithSales) {
        const recipeId = mappingByItem[posItemId];
        const recette  = recetteById[recipeId];
        const qtySold  = qtySoldByItem[posItemId];

        if (!recette || !(recette.portions > 0)) {
          noPortionsCount++;
          continue;
        }

        const portions    = recette.portions;
        const ingredients = Array.isArray(recette.ingredients) ? recette.ingredients : [];

        for (const ing of ingredients) {
          // Clé robuste : on lit "unite" (seule clé présente en base — vérifiée)
          const nom   = (ing.nom   ?? '').trim();
          const unite = (ing.unite ?? '').trim();
          const qteRecette = Number(ing.quantite ?? 0);

          if (!nom || !unite || qteRecette <= 0) continue;

          const conso = qtySold * (qteRecette / portions);
          const key   = `${nom}|${unite}`;

          if (acc.has(key)) {
            acc.get(key).raw += conso;
          } else {
            acc.set(key, { nom, unite, raw: conso });
          }
        }
      }

      setExcludedNoPortions(noPortionsCount);

      // 7. Normalisation + tri
      const result = [];
      for (const { nom, unite, raw } of acc.values()) {
        const { quantite, unite: uniteNorm } = normalizeQty(raw, unite);
        result.push({ nom, quantite, unite: uniteNorm, _raw: raw });
      }

      // Tri par raw décroissant (avant normalisation pour cohérence inter-unités)
      result.sort((a, b) => b._raw - a._raw || a.nom.localeCompare(b.nom, 'fr'));

      // Retirer _raw (interne)
      setItems(result.map(({ nom, quantite, unite }) => ({ nom, quantite, unite })));
    } catch (e) {
      console.error('[useConsoIngredients]', e);
      setError(e?.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [etablissement?.id, etablissement?.timezone, dateRange?.from, dateRange?.to]);

  useEffect(() => { load(); }, [load]);

  return {
    items,
    mappedWithSalesCount,
    totalMappedCount,
    excludedNoPortions,
    loading,
    error,
    reload: load,
  };
}
