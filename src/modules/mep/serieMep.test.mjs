// node --test : préparations de la mise en place par tranche (serieMep.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieMep } from './serieMep.js';

const listes = Array.from({ length: 1100 }, (_, i) => ({
  id: `l${i}`, dateService: new Date(Date.UTC(2026, 0, 1 + (i % 330))).toISOString().slice(0, 10),
  items: Array.from({ length: 4 }, (_, k) => ({ fait: (i + k) % 3 !== 0 })),
}));

test("plus de mille listes : les mois font l'année, le taux se recalcule sur les préparations", () => {
  const mois = Array.from({ length: 12 }, (_, m) => ({ debut: `2026-${String(m + 1).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10) }));
  const pts = serieMep(listes, mois);
  const [an] = serieMep(listes, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  ['listes', 'preparations', 'faites'].forEach((k) => assert.equal(pts.reduce((s, p) => s + p[k], 0), an[k], k));
  assert.equal(an.taux, an.faites / an.preparations);
  assert.equal(serieMep(listes, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].taux, null);
});
