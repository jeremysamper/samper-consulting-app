// ================================================================
// upsert.ts — Upsert pos_items + pos_sales (idempotent)
//
// Idempotence garantie par les contraintes UNIQUE :
//   pos_items  : UNIQUE (pos_connection_id, external_id)
//   pos_sales  : UNIQUE (pos_item_id, date)
//
// Stratégie : on écrase (ignoreDuplicates: false) — la dernière
// sync est la source de vérité.
// ================================================================
import type { SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import type { AggregatedSale } from './types.ts';

const BATCH_SIZE = 500; // limite Supabase par requête

/**
 * Upsert les pos_items (catalogue) et pos_sales (ventes agrégées).
 *
 * @param admin         Client Supabase service_role (bypasse RLS)
 * @param connectionId  ID de la pos_connection concernée
 * @param sales         Ventes agrégées par aggregateSalesLines()
 * @returns             { itemsCount, salesCount }
 */
export async function upsertItemsAndSales(
  admin: SupabaseClient,
  connectionId: string,
  sales: AggregatedSale[]
): Promise<{ itemsCount: number; salesCount: number }> {
  if (sales.length === 0) return { itemsCount: 0, salesCount: 0 };

  const now = new Date().toISOString();

  // ── 1. Upsert pos_items ────────────────────────────────────────
  // Construire la liste des items uniques (dédupliqués par key)
  const itemsMap = new Map<string, { key: string; name: string }>();
  for (const sale of sales) {
    if (!itemsMap.has(sale.key)) {
      itemsMap.set(sale.key, { key: sale.key, name: sale.name });
    }
  }

  const itemRows = Array.from(itemsMap.values()).map(({ key, name }) => ({
    pos_connection_id: connectionId,
    external_id:       key,
    name,
    sku:               key.includes('-') && /^[A-Z0-9-]+$/.test(key) ? key : null, // heuristique : si format SKU
    active:            true,
    last_seen_at:      now,
  }));

  // Upsert en batches
  let upsertedItems = 0;
  for (let i = 0; i < itemRows.length; i += BATCH_SIZE) {
    const batch = itemRows.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from('pos_items')
      .upsert(batch, {
        onConflict: 'pos_connection_id,external_id',
        ignoreDuplicates: false, // écrase last_seen_at
        count: 'exact',
      });
    if (error) throw new Error(`upsert pos_items: ${error.message}`);
    upsertedItems += count ?? batch.length;
  }

  // ── 2. Récupérer les IDs internes des pos_items upsertés ────────
  // On a besoin de pos_items.id pour créer les pos_sales
  const keys = Array.from(itemsMap.keys());
  const itemIdMap = new Map<string, string>(); // external_id → internal id

  // Récupère par batches de 500
  for (let i = 0; i < keys.length; i += BATCH_SIZE) {
    const batch = keys.slice(i, i + BATCH_SIZE);
    const { data, error } = await admin
      .from('pos_items')
      .select('id, external_id')
      .eq('pos_connection_id', connectionId)
      .in('external_id', batch);
    if (error) throw new Error(`select pos_items: ${error.message}`);
    for (const row of (data ?? [])) {
      itemIdMap.set(row.external_id, row.id);
    }
  }

  // ── 3. Upsert pos_sales ────────────────────────────────────────
  const salesRows = sales
    .map((sale) => {
      const posItemId = itemIdMap.get(sale.key);
      if (!posItemId) return null; // ne devrait pas arriver
      return {
        pos_item_id:  posItemId,
        date:         sale.date,
        qty:          sale.qty,
        revenue_cts:  sale.revenue_cts,
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let upsertedSales = 0;
  for (let i = 0; i < salesRows.length; i += BATCH_SIZE) {
    const batch = salesRows.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from('pos_sales')
      .upsert(batch, {
        onConflict: 'pos_item_id,date',
        ignoreDuplicates: false, // écrase qty/revenue_cts
        count: 'exact',
      });
    if (error) throw new Error(`upsert pos_sales: ${error.message}`);
    upsertedSales += count ?? batch.length;
  }

  return { itemsCount: upsertedItems, salesCount: upsertedSales };
}
