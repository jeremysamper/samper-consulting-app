import test from 'node:test';
import assert from 'node:assert/strict';
import { avancementZones, SANS_ZONE } from './zones.js';

test('avancementZones : sans zone, une seule entrée', () => {
  const lignes = [{ id: 'a', stockReel: 2 }, { id: 'b', stockReel: null }, { id: 'c', stockReel: '' }];
  assert.deepEqual(avancementZones(lignes), [{ zone: '', comptes: 1, total: 3 }]);
  assert.deepEqual(avancementZones(null), [{ zone: '', comptes: 0, total: 0 }]);
});

test('avancementZones : ordre du tour, multi-zone compté zone par zone, sans zone à la fin', () => {
  const lignes = [
    { id: 'a', zone: 'Froid négatif', stockReel: 1 },
    { id: 'b', zone: 'Cave', stockReel: null },
    { id: 'c', zones: ['Froid positif', 'Froid négatif'], parZone: { 'Froid positif': { q: 3 } }, stockReel: 3 },
    { id: 'd', stockReel: 0 },
    { id: 'e', zone: 'Cave', stockReel: 4 },
  ];
  assert.deepEqual(avancementZones(lignes), [
    { zone: 'Cave', comptes: 1, total: 2 },
    { zone: 'Froid positif', comptes: 1, total: 1 },
    { zone: 'Froid négatif', comptes: 1, total: 2 },
    { zone: SANS_ZONE, comptes: 1, total: 1 },
  ]);
});
