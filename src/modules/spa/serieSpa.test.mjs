// node --test : soins et bons du Spa par tranche (serieSpa.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieSpa } from './serieSpa.js';

const reservations = Array.from({ length: 1200 }, (_, i) => ({
  id: `s${i}`, dateRdv: new Date(Date.UTC(2026, 0, 1 + (i % 300))).toISOString().slice(0, 10),
  dureeMin: [30, 60, 90][i % 3], praticien: i % 5 ? ['Léa', 'Maël'][i % 2] : '', statut: ['prevue', 'terminee', 'annulee', 'absent', 'prevue'][i % 5],
}));
const bons = Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, createdAt: new Date(Date.UTC(2026, 0, 1 + i, 22, 30)).toISOString() }));

test("plus de mille rendez-vous : soins et minutes de l'agenda, les jours font l'année, par praticien", () => {
  const jours = Array.from({ length: 366 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); return { debut: d, fin: d }; });
  const pts = serieSpa({ reservations, bons }, jours);
  const [an] = serieSpa({ reservations, bons }, [{ debut: '2026-01-01', fin: '2027-01-01' }]);
  const actifs = reservations.filter((r) => !['annulee', 'absent'].includes(r.statut));
  assert.equal(an.soins, actifs.length);
  assert.equal(an.minutes, actifs.reduce((s, r) => s + r.dureeMin, 0));
  ['soins', 'minutes', 'annules', 'bons'].forEach((k) => assert.equal(pts.reduce((s, p) => s + p[k], 0), an[k], k));
  assert.equal(Object.values(an.parPraticien).reduce((s, e) => s + e.soins, 0), an.soins);
  assert.ok(an.parPraticien['À attribuer'].soins > 0);
  // 22:30 UTC : 23:30 à Zurich en hiver, le bon reste au jour de sa création.
  assert.equal(pts[0].bons, 1);
});
