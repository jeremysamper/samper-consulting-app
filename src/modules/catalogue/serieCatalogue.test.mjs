// node --test : prix du catalogue dans le temps (serieCatalogue.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieCatalogue } from './serieCatalogue.js';

const releves = Array.from({ length: 1200 }, (_, i) => ({
  produitId: `p${i % 40}`, releveLe: new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 4))).toISOString().slice(0, 10), prixUnitaire: 10 + (i % 17) * 0.35,
}));

test('plus de mille relevés : un pas vaut le dernier relevé de chaque produit, jamais une somme', () => {
  const [mars] = serieCatalogue(releves, [{ debut: '2026-03-01', fin: '2026-03-31' }]);
  const duProduit = releves.filter((r) => r.produitId === 'p3' && r.releveLe >= '2026-03-01' && r.releveLe <= '2026-03-31');
  assert.equal(mars.parProduit.p3.prix, duProduit[duProduit.length - 1].prixUnitaire);
  const [vide] = serieCatalogue(releves, [{ debut: '2025-01-01', fin: '2025-01-31' }]);
  assert.deepEqual(vide.parProduit, {});
});
