// node --test : entrées du journal d'activité par tranche (serieJournal.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieJournal } from './serieJournal.js';

const lignes = Array.from({ length: 1500 }, (_, i) => ({
  id: `j${i}`, created_at: new Date(Date.UTC(2026, 0, 1, 22, 30) + i * 6 * 3600 * 1000).toISOString(),
  module: ['recettes', 'produits', 'pertes', 'inventaires', 'caisse'][i % 5], operation: ['INSERT', 'UPDATE', 'DELETE'][i % 3],
}));

test('plus de mille entrées : les jours font la période, au jour de Zurich', () => {
  const jours = Array.from({ length: 380 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); return { debut: d, fin: d }; });
  const pts = serieJournal(lignes, jours);
  const [tout] = serieJournal(lignes, [{ debut: '2026-01-01', fin: '2027-01-15' }]);
  assert.equal(pts.reduce((s, p) => s + p.entrees, 0), tout.entrees);
  assert.equal(tout.entrees, 1500);
  // 01.01.2026 22:30 UTC : 23:30 à Zurich, encore le 1er ; l'entrée suivante, 04:30 UTC, tombe le 2.
  assert.equal(pts[0].entrees, 1);
  assert.equal(Object.values(tout.parModule).reduce((s, n) => s + n, 0), 1500);
  assert.equal(tout.parOperation.INSERT, 500);
});
