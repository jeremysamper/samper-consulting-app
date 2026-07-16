/**
 * useMiseEnPlace - Prédiction des quantités à préparer pour J+1
 *
 * Algorithme :
 *   Pour chaque pos_item mappé :
 *     1. Récupère les ventes des 14 derniers jours
 *     2. Identifie le jour de semaine de demain (dow, 0=dim…6=sam)
 *     3. Filtre les ventes sur ce même dow
 *     4. Si ≥ 2 occurrences du même dow → moyenne fiable, arrondie au supérieur
 *     5. Sinon                           → moyenne globale + reliable=false
 *
 * Retourne :
 *   items        : [{posItemId, name, recipeName, qty, reliable, occurrences}] trié qty desc
 *   tomorrowLabel: "Mardi 27 mai 2026"
 *   unmappedCount: nombre de pos_items sans mapping (exclus du calcul)
 *   totalPosCount: nombre total de pos_items actifs
 *   loading / error / reload
 */

import { useState, useEffect, useCallback } from 'react';
import { dbService } from '../../../services/dbService.js';
import { addDays, todayInTz, dowFromDateStr, formatDateLabel } from '../lib/date-utils.js';

export function useMiseEnPlace(etablissement) {
  const [items, setItems]               = useState([]);
  const [tomorrowLabel, setTomorrowLabel] = useState('');
  const [unmappedCount, setUnmappedCount] = useState(0);
  const [totalPosCount, setTotalPosCount] = useState(0);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const load = useCallback(async () => {
    if (!etablissement?.id) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    try {
      const db  = dbService.getClient();
      const tz  = etablissement.timezone ?? 'Europe/Zurich';
      const today    = todayInTz(tz);
      const tomorrow = addDays(today, 1);
      const since14  = addDays(today, -14);
      const tomorrowDow = dowFromDateStr(tomorrow);
      setTomorrowLabel(formatDateLabel(tomorrow));

      // 1. Connexions actives
      const { data: conns, error: connErr } = await db
        .from('pos_connections')
        .select('id')
        .eq('etablissement_id', etablissement.id)
        .eq('status', 'connected');
      if (connErr) throw connErr;

      if (!conns?.length) {
        setItems([]); setUnmappedCount(0); setTotalPosCount(0);
        setLoading(false);
        return;
      }
      const connIds = conns.map((c) => c.id);

      // 2. Plats POS actifs
      const { data: posItems, error: itemsErr } = await db
        .from('pos_items')
        .select('id, name')
        .in('pos_connection_id', connIds)
        .is('archived_at', null);
      if (itemsErr) throw itemsErr;

      const allItems = posItems ?? [];
      setTotalPosCount(allItems.length);

      if (!allItems.length) {
        setItems([]); setUnmappedCount(0);
        setLoading(false);
        return;
      }
      const allItemIds = allItems.map((i) => i.id);

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
      setUnmappedCount(allItems.length - mappedItemIds.length);

      if (!mappedItemIds.length) {
        setItems([]);
        setLoading(false);
        return;
      }

      // 4. Ventes 14 derniers jours (mappés uniquement)
      const { data: salesRows, error: salesErr } = await db
        .from('pos_sales')
        .select('pos_item_id, date, qty')
        .in('pos_item_id', mappedItemIds)
        .gte('date', since14)
        .lte('date', today);
      if (salesErr) throw salesErr;

      // 5. Recettes (noms)
      const recipeIds = [...new Set(Object.values(mappingByItem))];
      const { data: recetteRows, error: recErr } = await db
        .from('recettes')
        .select('id, nom')
        .in('id', recipeIds);
      if (recErr) throw recErr;

      const recetteById = {};
      for (const r of (recetteRows ?? [])) recetteById[r.id] = r.nom;

      // Grouper ventes par pos_item_id
      const salesByItem = {};
      for (const s of (salesRows ?? [])) {
        if (!salesByItem[s.pos_item_id]) salesByItem[s.pos_item_id] = [];
        salesByItem[s.pos_item_id].push({ dow: dowFromDateStr(s.date), qty: s.qty });
      }

      // Calcul prédictions
      const result = [];
      const itemById = {};
      for (const i of allItems) itemById[i.id] = i;

      for (const posItemId of mappedItemIds) {
        const item    = itemById[posItemId];
        const recipeId = mappingByItem[posItemId];
        const sales   = salesByItem[posItemId] ?? [];

        const sameDow = sales.filter((s) => s.dow === tomorrowDow);
        let qty, reliable, occurrences;

        if (sameDow.length >= 2) {
          const total = sameDow.reduce((acc, s) => acc + s.qty, 0);
          qty         = Math.ceil(total / sameDow.length);
          reliable    = true;
          occurrences = sameDow.length;
        } else if (sales.length > 0) {
          const total = sales.reduce((acc, s) => acc + s.qty, 0);
          qty         = Math.ceil(total / sales.length);
          reliable    = false;
          occurrences = sales.length;
        } else {
          qty         = 0;
          reliable    = false;
          occurrences = 0;
        }

        result.push({
          posItemId,
          name:       item?.name ?? posItemId,
          recipeName: recetteById[recipeId] ?? '-',
          qty,
          reliable,
          occurrences,
        });
      }

      // Tri : qty décroissant, puis nom
      result.sort((a, b) => b.qty - a.qty || a.name.localeCompare(b.name, 'fr'));
      setItems(result);
    } catch (e) {
      console.error('[useMiseEnPlace]', e);
      setError(e?.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [etablissement?.id, etablissement?.timezone]);

  useEffect(() => { load(); }, [load]);

  return { items, tomorrowLabel, unmappedCount, totalPosCount, loading, error, reload: load };
}
