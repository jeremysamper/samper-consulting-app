/**
 * useTopFlop - Ranking des ventes POS sur une période glissante
 *
 * Algorithme :
 *   Période A = [today - periodDays, today[       (semaine en cours)
 *   Période B = [today - 2*periodDays, today - periodDays[  (semaine précédente)
 *
 *   Pour chaque pos_item :
 *     qty_A = SUM(qty) sur période A
 *     qty_B = SUM(qty) sur période B
 *     delta = qty_B > 0 ? round((qty_A - qty_B) / qty_B * 100) : null
 *     isNew  = qty_A > 0 && qty_B === 0
 *
 *   Tri : qty_A décroissant
 *
 * Paramètres :
 *   etablissement : { id, timezone? }
 *   periodDays    : 7 | 14 | 30 (défaut 7)
 *
 * Retourne :
 *   items        : [{posItemId, name, qty_A, qty_B, delta, isNew}]
 *   periodLabel  : "Semaine du 17 au 23 mai"
 *   loading / error / reload
 */

import { useState, useEffect, useCallback } from 'react';
import { dbService } from '../../../services/dbService.js';
import { addDays, todayInTz, formatRangeLabel } from '../lib/date-utils.js';

export function useTopFlop(etablissement, periodDays = 7) {
  const [items, setItems]             = useState([]);
  const [periodLabel, setPeriodLabel] = useState('');
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState(null);

  const load = useCallback(async () => {
    if (!etablissement?.id) { setLoading(false); return; }

    setLoading(true);
    setError(null);

    try {
      const db  = dbService.getClient();
      const tz  = etablissement.timezone ?? 'Europe/Zurich';
      const today = todayInTz(tz);
      const cutA  = addDays(today, -periodDays);           // début période A
      const cutB  = addDays(today, -2 * periodDays);       // début période B

      setPeriodLabel(formatRangeLabel(cutA, addDays(today, -1)));

      // 1. Connexions actives
      const { data: conns, error: connErr } = await db
        .from('pos_connections')
        .select('id')
        .eq('etablissement_id', etablissement.id)
        .eq('status', 'connected');
      if (connErr) throw connErr;

      if (!conns?.length) {
        setItems([]);
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
      if (!allItems.length) { setItems([]); setLoading(false); return; }

      const allItemIds = allItems.map((i) => i.id);
      const itemById   = {};
      for (const i of allItems) itemById[i.id] = i;

      // 3. Ventes sur 2 périodes (une seule requête large)
      const { data: salesRows, error: salesErr } = await db
        .from('pos_sales')
        .select('pos_item_id, date, qty')
        .in('pos_item_id', allItemIds)
        .gte('date', cutB)
        .lt('date', today);
      if (salesErr) throw salesErr;

      // Agrégation côté client
      const qtyA = {};   // pos_item_id → sum qty période A
      const qtyB = {};   // pos_item_id → sum qty période B

      for (const s of (salesRows ?? [])) {
        const inA = s.date >= cutA;
        const inB = s.date >= cutB && s.date < cutA;
        if (inA) qtyA[s.pos_item_id] = (qtyA[s.pos_item_id] ?? 0) + s.qty;
        if (inB) qtyB[s.pos_item_id] = (qtyB[s.pos_item_id] ?? 0) + s.qty;
      }

      // Construire items avec delta
      const result = allItemIds
        .map((id) => {
          const a    = qtyA[id] ?? 0;
          const b    = qtyB[id] ?? 0;
          const delta = b > 0 ? Math.round((a - b) / b * 100) : null;
          return {
            posItemId: id,
            name:      itemById[id]?.name ?? id,
            qty_A:     a,
            qty_B:     b,
            delta,
            isNew:     a > 0 && b === 0,
          };
        })
        .filter((i) => i.qty_A > 0 || i.qty_B > 0)   // exclure les items sans aucune vente
        .sort((a, b) => b.qty_A - a.qty_A || a.name.localeCompare(b.name, 'fr'));

      setItems(result);
    } catch (e) {
      console.error('[useTopFlop]', e);
      setError(e?.message ?? 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [etablissement?.id, etablissement?.timezone, periodDays]);

  useEffect(() => { load(); }, [load]);

  return { items, periodLabel, loading, error, reload: load };
}
