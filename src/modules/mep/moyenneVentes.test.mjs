// node --test : règle de moyenne partagée (moyenneVentes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moyenneJourSemaine } from './moyenneVentes.js';

const dow = (s) => { const [a, m, j] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, j)).getUTCDay(); };
const ventes = (entrees) => entrees.map(([jour, qty]) => ({ dow: dow(jour), qty }));

test('deux occurrences du même jour : leur moyenne, fiable', () => {
  assert.deepEqual(moyenneJourSemaine(ventes([['2026-05-18', 20], ['2026-05-11', 16], ['2026-05-12', 12]]), 1), { qty: 18, reliable: true, occurrences: 2 });
});

test('une seule occurrence : moyenne de toutes les ventes, non fiable', () => {
  assert.deepEqual(moyenneJourSemaine(ventes([['2026-05-18', 20], ['2026-05-12', 12], ['2026-05-13', 14], ['2026-05-14', 8]]), 1), { qty: 14, reliable: false, occurrences: 4 });
});

test('aucune vente : zéro, non fiable', () => {
  assert.deepEqual(moyenneJourSemaine([], 1), { qty: 0, reliable: false, occurrences: 0 });
  assert.deepEqual(moyenneJourSemaine(undefined, 1), { qty: 0, reliable: false, occurrences: 0 });
});

test('arrondi au supérieur : 7,5 donne 8', () => {
  assert.equal(moyenneJourSemaine([{ dow: 3, qty: 6 }, { dow: 3, qty: 9 }], 3).qty, 8);
});

test('demain dimanche (dow 0) avec deux dimanches vendus', () => {
  assert.deepEqual(moyenneJourSemaine(ventes([['2026-05-17', 30], ['2026-05-10', 28]]), 0), { qty: 29, reliable: true, occurrences: 2 });
});

// Non-régression : les cas du banc maison src/modules/pos/lib/__tests__/mise-en-place.test.js.
test('non-régression : cas du banc de Ventes POS', () => {
  const cas = [
    [[['2026-05-18', 20], ['2026-05-11', 16], ['2026-05-12', 12], ['2026-05-19', 10]], 1, { qty: 18, reliable: true, occurrences: 2 }],
    [[['2026-05-18', 7], ['2026-05-11', 8], ['2026-05-04', 8]], 1, { qty: 8, reliable: true, occurrences: 3 }],
    [[['2026-05-18', 10], ['2026-05-11', 11]], 1, { qty: 11, reliable: true, occurrences: 2 }],
    [[['2026-05-18', 20], ['2026-05-12', 12], ['2026-05-13', 14], ['2026-05-14', 8]], 1, { qty: 14, reliable: false, occurrences: 4 }],
    [[], 1, { qty: 0, reliable: false, occurrences: 0 }],
    [[['2026-05-12', 15], ['2026-05-13', 12]], 1, { qty: 14, reliable: false, occurrences: 2 }],
    [[['2026-05-04', 10], ['2026-05-11', 14], ['2026-05-18', 12], ['2026-05-19', 5]], 1, { qty: 12, reliable: true, occurrences: 3 }],
    [[['2026-05-17', 30], ['2026-05-10', 28]], 0, { qty: 29, reliable: true, occurrences: 2 }],
  ];
  for (const [entrees, d, attendu] of cas) assert.deepEqual(moyenneJourSemaine(ventes(entrees), d), attendu);
});
