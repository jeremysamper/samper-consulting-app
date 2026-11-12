// node --test : ventes de la caisse reliée par tranche (serieVentesPos.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieVentesPos } from './serieVentesPos.js';

const ventes = Array.from({ length: 1500 }, (_, i) => ({
  id: `v${i}`, pos_item_id: `it${i % 12}`, date: new Date(Date.UTC(2026, 0, 1 + (i % 320))).toISOString().slice(0, 10),
  qty: 1 + (i % 4), revenue_cts: 1250 + (i % 7) * 135,
}));
const noms = Object.fromEntries(Array.from({ length: 12 }, (_, k) => [`it${k}`, `Plat ${k}`]));

test("plus de mille ventes : quantités et chiffre du top et flop, les mois font l'année, au centime", () => {
  const mois = Array.from({ length: 12 }, (_, m) => ({ debut: `2026-${String(m + 1).padStart(2, '0')}-01`, fin: new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10) }));
  const pts = serieVentesPos(ventes, noms, mois);
  const [an] = serieVentesPos(ventes, noms, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  assert.equal(an.qte, ventes.reduce((s, v) => s + v.qty, 0));
  assert.equal(Math.round(an.chiffre * 100), ventes.reduce((s, v) => s + v.revenue_cts, 0));
  assert.equal(pts.reduce((s, p) => s + p.qte, 0), an.qte);
  assert.equal(pts.reduce((s, p) => s + Math.round(p.chiffre * 100), 0), Math.round(an.chiffre * 100));
  assert.equal(an.parPlat.it3.nom, 'Plat 3');
  assert.equal(Object.values(an.parPlat).reduce((s, p) => s + p.qte, 0), an.qte);
  assert.equal(serieVentesPos(ventes, noms, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].vide, true);
});
