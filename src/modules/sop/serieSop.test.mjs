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

test('compteSop : le compte de l\'en-tête de SOP.jsx, dates ou non', async () => {
  const { compteSop, serieSop } = await import('./serieSop.js');
  const executions = [
    { statut: 'terminee', dateExecution: '2026-11-02', totalEtapes: 4, etapesCochees: 4 },
    { statut: 'abandonnee', dateExecution: '2026-11-03', totalEtapes: 4, etapesCochees: 1 },
    { statut: 'terminee', dateExecution: null, totalEtapes: 2, etapesCochees: 2 },
    { statut: 'en_cours', dateExecution: '2026-11-04', totalEtapes: 3, etapesCochees: 0 },
  ];
  const c = compteSop(executions);
  assert.equal(c.terminees, executions.filter((e) => e.statut === 'terminee').length);
  assert.equal(c.lancees, 4);
  const [p] = serieSop(executions, [{ debut: '2026-11-01', fin: '2026-11-30' }]);
  assert.equal(p.terminees, 1);
  assert.equal(p.cochees, 5);
});
