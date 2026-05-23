// deno test supabase/functions/_shared/__tests__/aggregate.test.ts

import { assertEquals } from 'jsr:@std/assert';
import { aggregateSalesLines, slugifyName } from '../aggregate.ts';
import type { SalesLine } from '../types.ts';

// ── slugifyName ───────────────────────────────────────────────────

Deno.test('slugifyName : retire accents et mots parasites', () => {
  assertEquals(slugifyName('Risotto aux champignons'), 'risotto-champignons');
  assertEquals(slugifyName('Filet de truite sauce beurre'), 'filet-truite-beurre');
  assertEquals(slugifyName('Tarte Tatin maison'), 'tarte-tatin');
  assertEquals(slugifyName('Salade César'), 'salade-cesar');
});

Deno.test('slugifyName : gère les cas dégénérés', () => {
  assertEquals(slugifyName('  le la les  '), '');  // que des stop words → vide
  assertEquals(slugifyName('123 Burger'), '123-burger');
});

// ── aggregateSalesLines ───────────────────────────────────────────

const TZ = 'Europe/Zurich';

Deno.test('Agrège correctement 3 lignes du même SKU', () => {
  const lines: SalesLine[] = [
    { name: 'Risotto', sku: 'RISO-001', qty: 2, price: 2800, timestamp: '2026-05-22T12:00:00Z' },
    { name: 'Risotto', sku: 'RISO-001', qty: 1, price: 2800, timestamp: '2026-05-22T15:00:00Z' },
    { name: 'Risotto', sku: 'RISO-001', qty: 3, price: 2800, timestamp: '2026-05-22T19:00:00Z' },
  ];
  const result = aggregateSalesLines(lines, TZ);

  assertEquals(result.length, 1);
  assertEquals(result[0].key, 'RISO-001');
  assertEquals(result[0].qty, 6);
  assertEquals(result[0].revenue_cts, 6 * 2800);
  assertEquals(result[0].date, '2026-05-22');
});

Deno.test('Split timezone : 22:30 UTC (CEST) va sur le lendemain', () => {
  const lines: SalesLine[] = [
    // Avant minuit local
    { name: 'Risotto', sku: 'RISO-001', qty: 2, price: 2800, timestamp: '2026-05-22T21:45:00Z' },
    // Après minuit local (00:30 CEST = 22:30 UTC)
    { name: 'Risotto', sku: 'RISO-001', qty: 1, price: 2800, timestamp: '2026-05-22T22:30:00Z' },
  ];
  const result = aggregateSalesLines(lines, TZ);

  assertEquals(result.length, 2); // 2 dates distinctes

  const byDate = Object.fromEntries(result.map((r) => [r.date, r]));
  assertEquals(byDate['2026-05-22'].qty, 2);
  assertEquals(byDate['2026-05-23'].qty, 1);
});

Deno.test('SKU null → fallback sur slugify(name)', () => {
  const lines: SalesLine[] = [
    { name: 'Plat du jour', sku: null, qty: 3, price: 1500, timestamp: '2026-05-22T12:00:00Z' },
    { name: 'Plat du jour', sku: null, qty: 2, price: 1500, timestamp: '2026-05-22T19:00:00Z' },
  ];
  const result = aggregateSalesLines(lines, TZ);

  assertEquals(result.length, 1);
  assertEquals(result[0].key, 'plat-jour');
  assertEquals(result[0].qty, 5);
});

Deno.test('SKU vide string → fallback sur slugify(name)', () => {
  const lines: SalesLine[] = [
    { name: 'Soupe du jour', sku: '   ', qty: 4, price: 1100, timestamp: '2026-05-22T12:00:00Z' },
  ];
  const result = aggregateSalesLines(lines, TZ);
  assertEquals(result[0].key, 'soupe-jour');
});

Deno.test('Lignes qty <= 0 sont ignorées', () => {
  const lines: SalesLine[] = [
    { name: 'Risotto', sku: 'RISO-001', qty: 3, price: 2800, timestamp: '2026-05-22T12:00:00Z' },
    { name: 'Risotto', sku: 'RISO-001', qty: -1, price: 2800, timestamp: '2026-05-22T14:00:00Z' }, // retour
    { name: 'Risotto', sku: 'RISO-001', qty: 0, price: 2800, timestamp: '2026-05-22T16:00:00Z' },  // vide
  ];
  const result = aggregateSalesLines(lines, TZ);

  assertEquals(result.length, 1);
  assertEquals(result[0].qty, 3); // les 2 négatifs/zéro sont skippés
});

Deno.test('Plusieurs SKU distincts sur le même jour', () => {
  const lines: SalesLine[] = [
    { name: 'Risotto', sku: 'RISO-001', qty: 2, price: 2800, timestamp: '2026-05-22T12:00:00Z' },
    { name: 'Entrecôte', sku: 'ENTRE-002', qty: 3, price: 4500, timestamp: '2026-05-22T19:00:00Z' },
    { name: 'Salade', sku: 'SALA-003', qty: 5, price: 1850, timestamp: '2026-05-22T11:30:00Z' },
  ];
  const result = aggregateSalesLines(lines, TZ);

  assertEquals(result.length, 3);
  const keys = result.map((r) => r.key).sort();
  assertEquals(keys, ['ENTRE-002', 'RISO-001', 'SALA-003']);
});

Deno.test('Fixture complète : vérifie le split timezone sur salesLines_sample', async () => {
  // Charge la fixture directement pour tester l'intégration
  const fixtureUrl = new URL(
    '../../pos-sync/__fixtures__/salesLines_sample.json',
    import.meta.url
  );
  const text = await Deno.readTextFile(fixtureUrl);
  const json = JSON.parse(text) as { sales: SalesLine[] };
  const result = aggregateSalesLines(json.sales, TZ);

  // RISOTTO-001 doit apparaître sur 2 dates (22 et 23)
  const risottoEntries = result.filter((r) => r.key === 'RISOTTO-001');
  assertEquals(risottoEntries.length, 2, 'RISOTTO-001 doit être sur 2 dates');

  const rByDate = Object.fromEntries(risottoEntries.map((r) => [r.date, r]));
  // 22/05 : 2 + 1 = 3 portions (les 2 lignes avant minuit)
  assertEquals(rByDate['2026-05-22'].qty, 3);
  // 23/05 : 1 portion (la ligne à 22:30 UTC)
  assertEquals(rByDate['2026-05-23'].qty, 1);

  // TRUITE-006 doit rester sur le 22/05 (21:45 UTC = 23:45 CEST, pas minuit)
  const truiteEntries = result.filter((r) => r.key === 'TRUITE-006');
  assertEquals(truiteEntries.length, 1);
  assertEquals(truiteEntries[0].date, '2026-05-22');
  assertEquals(truiteEntries[0].qty, 2 + 4 + 1); // toutes les lignes truite
});
