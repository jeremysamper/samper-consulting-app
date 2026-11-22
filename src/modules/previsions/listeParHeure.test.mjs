// node --test : réservations rangées par quart d'heure d'arrivée (listeParHeure.js).
// Lancer : node src/modules/previsions/listeParHeure.test.mjs
//      ou : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { grouperParQuart, estTerminee } from './listeParHeure.js';

const r = (id, heure, nb, extra = {}) => ({ id, nom: id, heure_arrivee: heure, nb_couverts: nb, statut: 'confirme', ...extra });

test('un groupe par quart d’heure, dans l’ordre du service', () => {
  const g = grouperParQuart([r('c', '12:40:00', 2), r('a', '12:00', 4), r('b', '12:10', 2), r('d', '12:15', 6)]);
  assert.deepEqual(g.map((x) => x.debut), [720, 735, 750]);
  assert.deepEqual(g.map((x) => x.resas.map((y) => y.id)), [['a', 'b'], ['d'], ['c']]);
});

test('les quarts d’heure sont bornés à 15 minutes', () => {
  const g = grouperParQuart([r('a', '12:14', 2), r('b', '12:15', 2), r('c', '12:29', 2), r('d', '12:30', 2)]);
  assert.deepEqual(g.map((x) => [x.debut, x.resas.map((y) => y.id)]), [[720, ['a']], [735, ['b', 'c']], [750, ['d']]]);
});

test('dans un quart d’heure : la minute, puis le nom', () => {
  const g = grouperParQuart([r('Weber', '13:30', 2), r('Gay', '13:30', 4), r('Abbet', '13:35', 2)]);
  assert.deepEqual(g[0].resas.map((x) => x.id), ['Gay', 'Weber', 'Abbet']);
});

test('couverts et part du quart d’heure le plus chargé', () => {
  const g = grouperParQuart([r('a', '12:00', 4), r('b', '12:05', 4), r('c', '12:30', 2)]);
  assert.equal(g[0].couverts, 8);
  assert.equal(g[0].part, 1);
  assert.equal(g[1].part, 0.25);
});

test('partis et no-shows sortent des groupes', () => {
  const g = grouperParQuart([r('a', '12:00', 2, { statut: 'parti' }), r('b', '12:00', 2, { statut: 'no_show' }), r('c', '12:00', 3)]);
  assert.equal(g.length, 1);
  assert.deepEqual(g[0].resas.map((x) => x.id), ['c']);
  assert.equal(estTerminee({ statut: 'parti' }), true);
  assert.equal(estTerminee({ statut: 'arrive' }), false);
});

test('le quart d’heure en cours est marqué', () => {
  const g = grouperParQuart([r('a', '12:00', 2), r('b', '12:20', 2)], 12 * 60 + 22);
  assert.deepEqual(g.map((x) => x.encours), [false, true]);
});

test('une heure illisible va dans un groupe à la fin', () => {
  const g = grouperParQuart([r('a', null, 2), r('b', '11:45', 2)]);
  assert.deepEqual(g.map((x) => x.debut), [705, null]);
});

test('aucune réservation : aucun groupe', () => {
  assert.deepEqual(grouperParQuart([]), []);
  assert.deepEqual(grouperParQuart(null), []);
});
