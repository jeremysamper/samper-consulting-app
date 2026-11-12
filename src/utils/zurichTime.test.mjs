// node --test : date et heure de Zurich d'un instant (zurichTime.js), autour
// des passages à l'heure d'été et d'hiver, avec un formateur gardé en mémoire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { zurichDateHeure } from './zurichTime.js';

test('heure de Zurich : hiver, été, et les deux passages de 2026', () => {
  assert.deepEqual(zurichDateHeure('2026-01-15T11:30:00Z'), { jour: '2026-01-15', date: '15.01.2026', heure: '12:30' });
  assert.deepEqual(zurichDateHeure('2026-07-15T11:30:00Z'), { jour: '2026-07-15', date: '15.07.2026', heure: '13:30' });
  assert.equal(zurichDateHeure('2026-03-29T00:59:00Z').heure, '01:59');
  assert.equal(zurichDateHeure('2026-03-29T01:00:00Z').heure, '03:00');
  assert.equal(zurichDateHeure('2026-10-25T00:59:00Z').heure, '02:59');
  assert.equal(zurichDateHeure('2026-10-25T01:00:00Z').heure, '02:00');
  // Minuit passé en UTC : encore la veille à Zurich, ou déjà le lendemain.
  assert.equal(zurichDateHeure('2026-11-11T23:30:00Z').jour, '2026-11-12');
  for (let i = 0; i < 200; i += 1) assert.equal(zurichDateHeure('2026-01-15T11:30:00Z').heure, '12:30');
});
