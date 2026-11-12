// node --test : commandes de l'écran de cuisine par tranche (serieKds.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieKds } from './serieKds.js';

const orders = Array.from({ length: 1100 }, (_, i) => {
  const ouverture = Date.UTC(2026, 0, 1 + (i % 300), 11, 0) + (i % 2) * 7 * 3600 * 1000;
  return {
    id: `k${i}`, openedAt: new Date(ouverture).toISOString(),
    completedAt: i % 10 === 0 ? null : new Date(ouverture + (10 + (i % 25)) * 60000).toISOString(),
  };
});

test("plus de mille commandes : les jours font l'année, la durée se recalcule, une commande ouverte ne compte pas", () => {
  const jours = Array.from({ length: 366 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); return { debut: d, fin: d }; });
  const pts = serieKds(orders, jours);
  const [an] = serieKds(orders, [{ debut: '2026-01-01', fin: '2027-01-01' }]);
  assert.equal(an.terminees, 990);
  assert.equal(pts.reduce((s, p) => s + p.terminees, 0), an.terminees);
  assert.ok(Math.abs(pts.reduce((s, p) => s + p.minutesTotal, 0) - an.minutesTotal) < 1e-6);
  assert.equal(an.dureeMoyenne, an.minutesTotal / an.nbDurees);
  assert.equal(serieKds(orders, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].dureeMoyenne, null);
});
