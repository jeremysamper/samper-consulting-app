// node --test : chiffres des relevés HACCP par tranche (serieHaccp.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { chiffresReleves, serieHaccp } from './serieHaccp.js';
import { jeuReleves } from './jeuReleves.mjs';

// Règle des chiffres du registre, HACCP.jsx l. 656 à 663, recopiée comme témoin.
function statsRegistre(rows) {
  const nbAnomalies = rows.filter((r) => !r.conforme).length;
  return { total: rows.length, conformes: rows.length - nbAnomalies, anomalies: nbAnomalies, taux: Math.round((rows.length - nbAnomalies) / rows.length * 100) };
}

test('chiffres d\'un ensemble : ceux du registre, taux sans arrondi', () => {
  const rows = jeuReleves().filter((r) => r.date.startsWith('2026-10'));
  const c = chiffresReleves(rows);
  const s = statsRegistre(rows);
  assert.equal(c.releves, s.total);
  assert.equal(c.anomalies, s.anomalies);
  assert.equal(Math.round(c.taux * 100), s.taux);
  assert.equal(chiffresReleves([]).taux, null);
});

test('série : plus de mille relevés, les mois font l\'année, une tranche vide est vide', () => {
  const rows = jeuReleves();
  assert.ok(rows.length > 1000);
  const tranches = Array.from({ length: 12 }, (_, m) => ({
    debut: `2026-${String(m + 1).padStart(2, '0')}-01`,
    fin: new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10),
  }));
  const mois = serieHaccp(rows, tranches);
  const [annee] = serieHaccp(rows, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  assert.equal(mois.reduce((s, p) => s + p.releves, 0), annee.releves);
  assert.equal(mois.reduce((s, p) => s + p.anomalies, 0), annee.anomalies);
  assert.equal(serieHaccp(rows, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].vide, true);
});

test('dernier relevé d\'une zone : le plus récent par date puis heure', () => {
  const [p] = serieHaccp(jeuReleves(), [{ debut: '2026-03-01', fin: '2026-03-02' }]);
  const attendu = jeuReleves().find((r) => r.zoneId === 'z1' && r.date === '2026-03-02' && r.heure === '18:00');
  assert.equal(p.parZone.z1.valeur, attendu.valeur);
  assert.equal(p.parZone.z1.heure, '18:00');
});

test('les chiffres du registre des relevés (HACCP.jsx) sont ceux de chiffresReleves', async () => {
  const { chiffresReleves } = await import('./serieHaccp.js');
  const rows = Array.from({ length: 37 }, (_, i) => ({ zoneId: `z${i % 4}`, valeur: 2 + (i % 7), date: '2026-11-0' + (1 + (i % 9)), heure: '08:00', conforme: i % 5 !== 0 }));
  const nbAnomalies = rows.filter((r) => !r.conforme).length;
  const ancien = { total: rows.length, conformes: rows.length - nbAnomalies, anomalies: nbAnomalies, taux: Math.round((rows.length - nbAnomalies) / rows.length * 100) };
  const c = chiffresReleves(rows);
  assert.deepEqual({ total: c.releves, conformes: c.conformes, anomalies: c.anomalies, taux: Math.round(c.taux * 100) }, ancien);
});
