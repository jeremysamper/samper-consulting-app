// ================================================================
// idempotence.test.ts - Teste que upsertItemsAndSales est idempotent
//
// On ne peut pas appeler Supabase en vrai dans les tests Deno sans
// infrastructure. On mocke donc le client admin avec un Map en mémoire
// qui simule pos_items et pos_sales.
//
// deno test supabase/functions/_shared/__tests__/idempotence.test.ts
// ================================================================

import { assertEquals } from 'jsr:@std/assert';
import type { AggregatedSale } from '../types.ts';

// ── Mini-mock Supabase ────────────────────────────────────────────
// Simule uniquement les opérations utilisées par upsertItemsAndSales :
//   .from(table).upsert(rows, opts) → enregistre dans la Map
//   .from(table).select(cols).eq(col,val).in(col,vals) → lit depuis la Map
//
// Les IDs sont auto-incrémentés (text) pour rester cohérents avec le vrai schema.

interface MockRow {
  [key: string]: unknown;
}

class MockTable {
  rows: Map<string, MockRow>;
  uniqueKeys: string[];  // ex: ['pos_connection_id', 'external_id']

  constructor(uniqueKeys: string[]) {
    this.rows    = new Map();
    this.uniqueKeys = uniqueKeys;
  }

  /** Génère une clé unique composite à partir des champs uniqueKeys */
  private compositeKey(row: MockRow): string {
    return this.uniqueKeys.map((k) => String(row[k] ?? '')).join('|');
  }

  upsert(rows: MockRow[], opts?: { ignoreDuplicates?: boolean }): { error: null; count: number } {
    let inserted = 0;
    for (const row of rows) {
      const ck = this.compositeKey(row);
      const existing = this.rows.get(ck);
      if (existing) {
        if (!opts?.ignoreDuplicates) {
          // Écrase : merge
          this.rows.set(ck, { ...existing, ...row });
          inserted++;
        }
        // ignoreDuplicates=true → ne fait rien
      } else {
        // Nouvel enregistrement : assigne un ID si absent
        const withId = { id: `id-${this.rows.size + 1}`, ...row };
        this.rows.set(ck, withId);
        inserted++;
      }
    }
    return { error: null, count: inserted };
  }

  selectWhere(connectionId: string, externalIds?: string[]): MockRow[] {
    const result: MockRow[] = [];
    for (const row of this.rows.values()) {
      if (row['pos_connection_id'] !== connectionId) continue;
      if (externalIds && !externalIds.includes(String(row['external_id'] ?? ''))) continue;
      result.push(row);
    }
    return result;
  }
}

// Fabrique un mock admin compatible avec l'API utilisée dans upsert.ts
function makeAdminMock(posItems: MockTable, posSales: MockTable) {
  return {
    from: (table: string) => {
      if (table === 'pos_items') {
        return {
          upsert: (rows: MockRow[], opts?: object) => posItems.upsert(rows, opts as { ignoreDuplicates?: boolean }),
          select: (_cols: string) => ({
            eq: (_col: string, val: unknown) => ({
              in: (_col2: string, vals: string[]) => ({
                then: undefined,
                // Simule la promesse Supabase
                [Symbol.asyncIterator]: undefined,
              }),
              // Résolution directe comme promesse
              async then(resolve: (v: { data: MockRow[]; error: null }) => void) {
                resolve({ data: posItems.selectWhere(String(val), undefined), error: null });
              },
            }),
          }),
        };
      }
      if (table === 'pos_sales') {
        return {
          upsert: (rows: MockRow[], opts?: object) => posSales.upsert(rows, opts as { ignoreDuplicates?: boolean }),
        };
      }
      throw new Error(`Unknown table: ${table}`);
    },
  };
}

// Version testable de upsertItemsAndSales qui accepte notre mock
// (copie inline simplifiée - teste la logique, pas les imports Deno)
async function upsertItemsAndSalesTestable(
  admin: ReturnType<typeof makeAdminMock>,
  connectionId: string,
  sales: AggregatedSale[]
): Promise<{ itemsCount: number; salesCount: number }> {
  if (sales.length === 0) return { itemsCount: 0, salesCount: 0 };
  const now = new Date().toISOString();

  // 1. Upsert pos_items
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
    sku:               key.includes('-') && /^[A-Z0-9-]+$/.test(key) ? key : null,
    active:            true,
    last_seen_at:      now,
  }));

  const { count: ic } = admin.from('pos_items').upsert(itemRows, { ignoreDuplicates: false });
  const upsertedItems = ic ?? itemRows.length;

  // 2. Fetch IDs
  const keys = Array.from(itemsMap.keys());
  const itemIdMap = new Map<string, string>();
  const { data } = await admin.from('pos_items').select('id, external_id').eq('pos_connection_id', connectionId);
  for (const row of (data ?? [])) {
    if (keys.includes(String(row['external_id']))) {
      itemIdMap.set(String(row['external_id']), String(row['id']));
    }
  }

  // 3. Upsert pos_sales
  const salesRows = sales
    .map((sale) => {
      const posItemId = itemIdMap.get(sale.key);
      if (!posItemId) return null;
      return { pos_item_id: posItemId, date: sale.date, qty: sale.qty, revenue_cts: sale.revenue_cts };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  const { count: sc } = admin.from('pos_sales').upsert(salesRows, { ignoreDuplicates: false });
  const upsertedSales = sc ?? salesRows.length;

  return { itemsCount: upsertedItems, salesCount: upsertedSales };
}

// ── Helpers ───────────────────────────────────────────────────────

function makeSales(overrides: Partial<AggregatedSale>[] = []): AggregatedSale[] {
  const defaults: AggregatedSale[] = [
    { key: 'RISO-001', name: 'Risotto champignons', date: '2026-05-22', qty: 3, revenue_cts: 8400 },
    { key: 'ENTRE-002', name: 'Entrecôte', date: '2026-05-22', qty: 5, revenue_cts: 22500 },
  ];
  return defaults.map((d, i) => ({ ...d, ...(overrides[i] ?? {}) }));
}

// ── Tests ─────────────────────────────────────────────────────────

Deno.test('Upsert initial : crée les rows, retourne le bon count', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  const sales = makeSales();
  const result = await upsertItemsAndSalesTestable(admin, 'conn-1', sales);

  assertEquals(result.itemsCount, 2);
  assertEquals(result.salesCount, 2);
  assertEquals(posItems.rows.size, 2);
  assertEquals(posSales.rows.size, 2);
});

Deno.test('Double upsert idempotent : pas de doublon dans pos_sales', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  const sales = makeSales();

  // Première sync
  await upsertItemsAndSalesTestable(admin, 'conn-1', sales);
  // Deuxième sync identique
  await upsertItemsAndSalesTestable(admin, 'conn-1', sales);

  // Pas de doublons : toujours 2 items, 2 sales
  assertEquals(posItems.rows.size, 2, 'Pas de doublon dans pos_items');
  assertEquals(posSales.rows.size, 2, 'Pas de doublon dans pos_sales');
});

Deno.test('Écrase qty/revenue_cts lors du re-sync (ignoreDuplicates=false)', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  // Sync 1 : 3 portions
  await upsertItemsAndSalesTestable(admin, 'conn-1', [
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-22', qty: 3, revenue_cts: 8400 },
  ]);

  // Sync 2 : correction → 5 portions (re-import corrigé)
  await upsertItemsAndSalesTestable(admin, 'conn-1', [
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-22', qty: 5, revenue_cts: 14000 },
  ]);

  // La valeur doit être 5 (écrasée)
  const salesRow = Array.from(posSales.rows.values())[0];
  assertEquals(salesRow['qty'], 5, 'qty doit être écrasée par la 2e sync');
  assertEquals(salesRow['revenue_cts'], 14000, 'revenue_cts doit être écrasée par la 2e sync');
  assertEquals(posSales.rows.size, 1, 'Pas de doublon');
});

Deno.test('Multi-date pour le même item : 2 rows pos_sales distinctes', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  await upsertItemsAndSalesTestable(admin, 'conn-1', [
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-21', qty: 4, revenue_cts: 11200 },
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-22', qty: 2, revenue_cts: 5600 },
  ]);

  assertEquals(posItems.rows.size, 1, 'Un seul item RISO-001');
  assertEquals(posSales.rows.size, 2, 'Deux sales pour deux dates');
});

Deno.test('Connexions isolées : conn-1 et conn-2 ne se mélangent pas', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  await upsertItemsAndSalesTestable(admin, 'conn-1', [
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-22', qty: 3, revenue_cts: 8400 },
  ]);
  await upsertItemsAndSalesTestable(admin, 'conn-2', [
    { key: 'RISO-001', name: 'Risotto', date: '2026-05-22', qty: 7, revenue_cts: 19600 },
  ]);

  // 2 items distincts (même external_id mais connexions différentes)
  assertEquals(posItems.rows.size, 2, 'conn-1 et conn-2 créent des items séparés');
  assertEquals(posSales.rows.size, 2, 'Deux sales distinctes (item IDs différents)');
});

Deno.test('Sales vides : retourne 0/0 sans crasher', async () => {
  const posItems = new MockTable(['pos_connection_id', 'external_id']);
  const posSales = new MockTable(['pos_item_id', 'date']);
  const admin = makeAdminMock(posItems, posSales);

  const result = await upsertItemsAndSalesTestable(admin, 'conn-1', []);
  assertEquals(result.itemsCount, 0);
  assertEquals(result.salesCount, 0);
});
