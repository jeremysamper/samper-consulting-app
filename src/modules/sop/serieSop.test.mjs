// node --test : exécutions des procédures par tranche (serieSop.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieSop } from './serieSop.js';

const executions = Array.from({ length: 1200 }, (_, i) => ({
  id: `e${i}`, dateExecution: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10),
  statut: ['terminee', 'terminee', 'en_cours', 'abandonnee'][i % 4], totalEtapes: 8, etapesCochees: [8, 6, 3, 2][i % 4],
}));

test("plus de mille exécutions : les mois font l'année, le taux d'étapes se recalcule", () => {
  const mois = Array.from({ length: 12 }, (_, m) => ({ debut: `2026-${String(m + 1).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10) }));
  const pts = serieSop(executions, mois);
  const [an] = serieSop(executions, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  ['lancees', 'terminees', 'abandonnees', 'etapes', 'cochees'].forEach((k) => assert.equal(pts.reduce((s, p) => s + p[k], 0), an[k], k));
  assert.equal(an.terminees, executions.filter((e) => e.statut === 'terminee').length);
  assert.equal(an.tauxEtapes, (8 + 6 + 3 + 2) / 32);
  assert.equal(serieSop(executions, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].tauxEtapes, null);
});
