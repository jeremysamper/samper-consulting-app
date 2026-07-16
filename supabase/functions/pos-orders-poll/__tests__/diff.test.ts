// ════════════════════════════════════════════════════════════════
// diff.test.ts - Tests de la logique pure de diff KDS (pas de DB/réseau).
//
//   deno test supabase/functions/pos-orders-poll/__tests__/diff.test.ts
// ════════════════════════════════════════════════════════════════
import { assertEquals } from 'jsr:@std/assert';
import { computeCheckDiff, contentHash, lineKey } from '../diff.ts';
import type { OpenCheck, ExistingItem } from '../../_shared/types.ts';

function line(uuid: string, itemName: string, quantity: number, opts: Partial<OpenCheck['salesEntries'][number]> = {}) {
  return {
    uuid,
    itemName,
    itemSku: opts.itemSku ?? null,
    quantity,
    modifiers: opts.modifiers ?? [],
    timeOfTransactionUtc: opts.timeOfTransactionUtc ?? '2026-07-15T11:00:00Z',
    active: opts.active ?? true,
  };
}

function check(uuid: string, entries: OpenCheck['salesEntries']): OpenCheck {
  return { uuid, tableNumber: '5', clientCount: 2, openDate: '2026-07-15T11:00:00Z', salesEntries: entries };
}

/** Construit un snapshot ExistingItem à partir d'un check (comme après un 1er poll). */
function snapshotOf(c: OpenCheck, bump: Record<string, string> = {}): ExistingItem[] {
  return c.salesEntries.map((l) => ({
    ls_line_key: lineKey(c.uuid, l.uuid),
    content_hash: contentHash(l.itemName, l.itemSku, l.quantity, l.active, l.modifiers),
    bump_status: bump[l.uuid] ?? 'pending',
    active: l.active,
  }));
}

Deno.test('nouveau check contre snapshot vide -> tout en upsert, rien de voided', () => {
  const c = check('chk1', [line('a', 'Entrecote', 1), line('b', 'Salade', 2)]);
  const diff = computeCheckDiff(c, []);
  assertEquals(diff.upserts.length, 2);
  assertEquals(diff.voidedLineKeys.length, 0);
  assertEquals(diff.upserts[0].ls_line_key, 'chk1:a');
  assertEquals(diff.order.couverts, 2);
  assertEquals(diff.upserts.every((u) => u.reset_bump === false), true);
});

Deno.test('idempotence : re-poll identique -> aucun write', () => {
  const c = check('chk1', [line('a', 'Entrecote', 1), line('b', 'Salade', 2)]);
  const diff = computeCheckDiff(c, snapshotOf(c));
  assertEquals(diff.upserts.length, 0);
  assertEquals(diff.voidedLineKeys.length, 0);
});

Deno.test('édition d\'une ligne BUMPÉE -> re-fire (reset_bump=true)', () => {
  const before = check('chk1', [line('a', 'Entrecote', 1)]);
  const snap = snapshotOf(before, { a: 'bumped' });
  const after = check('chk1', [line('a', 'Entrecote', 2)]); // qty 1 -> 2
  const diff = computeCheckDiff(after, snap);
  assertEquals(diff.upserts.length, 1);
  assertEquals(diff.upserts[0].reset_bump, true);
  assertEquals(diff.upserts[0].qty, 2);
});

Deno.test('édition d\'une ligne PENDING -> upsert sans reset', () => {
  const before = check('chk1', [line('a', 'Entrecote', 1)]);
  const after = check('chk1', [line('a', 'Entrecote', 3)]);
  const diff = computeCheckDiff(after, snapshotOf(before));
  assertEquals(diff.upserts.length, 1);
  assertEquals(diff.upserts[0].reset_bump, false);
});

Deno.test('ligne disparue -> voided ; déjà annulée -> pas re-voided', () => {
  const before = check('chk1', [line('a', 'Entrecote', 1), line('b', 'Salade', 2)]);
  const snap = snapshotOf(before);
  const after = check('chk1', [line('a', 'Entrecote', 1)]); // b disparait
  const diff = computeCheckDiff(after, snap);
  assertEquals(diff.voidedLineKeys, ['chk1:b']);

  // b déjà active=false en base -> ne doit plus être renvoyé comme voided
  const snapVoided = snap.map((e) => e.ls_line_key === 'chk1:b' ? { ...e, active: false } : e);
  const diff2 = computeCheckDiff(after, snapVoided);
  assertEquals(diff2.voidedLineKeys.length, 0);
});

Deno.test('contentHash insensible à l\'ordre des modifiers', () => {
  const h1 = contentHash('Pizza', null, 1, true, [{ name: 'Basilic', quantity: 1 }, { name: 'Olives', quantity: 2 }]);
  const h2 = contentHash('Pizza', null, 1, true, [{ name: 'Olives', quantity: 2 }, { name: 'Basilic', quantity: 1 }]);
  assertEquals(h1, h2);
});

Deno.test('contentHash change quand active bascule (annulation dans salesEntries)', () => {
  const active = contentHash('Frites', 'GARN-FRI', 1, true, []);
  const voided = contentHash('Frites', 'GARN-FRI', 1, false, []);
  assertEquals(active === voided, false);
});
