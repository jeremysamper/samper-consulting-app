// node --test : chiffres des groupes par tranche (serieGroupes.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { serieGroupes } from './serieGroupes.js';
import { jeuGroupes } from './jeuGroupes.mjs';

// Règle de la liste du mois, Groupes.jsx l. 181 à 183, recopiée comme témoin.
function listeDuMois(groupes, prefixe) {
  const duMois = groupes.filter((g) => g.dateEvenement.startsWith(prefixe));
  const actifs = duMois.filter((g) => !g.annule);
  return { n: actifs.length, pax: actifs.reduce((s, g) => s + g.nbPax, 0), annules: duMois.length - actifs.length };
}

test('un mois : les chiffres de la liste du calendrier', () => {
  const g = jeuGroupes();
  const [oct] = serieGroupes(g, [{ debut: '2026-10-01', fin: '2026-10-31' }]);
  const l = listeDuMois(g, '2026-10-');
  assert.deepEqual({ n: oct.groupes, pax: oct.convives, annules: oct.annules }, l);
});

test('plus de mille groupes : les jours font l\'année, une tranche vide est vide', () => {
  const g = jeuGroupes();
  const jours = Array.from({ length: 365 }, (_, i) => { const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10); return { debut: d, fin: d }; });
  const pts = serieGroupes(g, jours);
  const [annee] = serieGroupes(g, [{ debut: '2026-01-01', fin: '2026-12-31' }]);
  ['groupes', 'convives', 'annules'].forEach((k) => assert.equal(pts.reduce((s, p) => s + p[k], 0), annee[k], k));
  assert.equal(serieGroupes(g, [{ debut: '2025-01-01', fin: '2025-01-31' }])[0].vide, true);
});
