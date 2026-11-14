// node --test : le résumé du service de l'accueil de la Caisse (carte
// « Tables ouvertes »), compté sur ce que l'écran lit déjà.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partServies, resumeService } from './resumeService.js';

const tables = [
  { id: 't1' }, { id: 't2', actif: true }, { id: 't3' }, { id: 't4', actif: false },
];
const etat = (t) => ({ prets: t.prets || 0, aSuivre: t.aSuivre || 0 });

test('tables servies : une table active avec un ticket ouvert compte une fois', () => {
  const r = resumeService([
    { id: 'a', table_id: 't1' }, { id: 'b', table_id: 't1' }, { id: 'c', table_id: 't2' },
  ], tables, etat);
  assert.equal(r.actives, 3);
  assert.equal(r.servies, 2);
});

test('une vente directe et une table retirée ne comptent pas comme tables servies', () => {
  const r = resumeService([{ id: 'a', table_id: null }, { id: 'b', table_id: 't4' }], tables, etat);
  assert.equal(r.servies, 0);
  assert.equal(r.actives, 3);
});

test('plats prêts et à suivre : la somme de ce que dit chaque ticket', () => {
  const r = resumeService([
    { id: 'a', table_id: 't1', prets: 1, aSuivre: 2 },
    { id: 'b', table_id: null, prets: 2, aSuivre: 0 },
  ], tables, etat);
  assert.equal(r.prets, 3);
  assert.equal(r.aSuivre, 2);
});

test('entrées vides ou absentes : tout à zéro, sans erreur', () => {
  assert.deepEqual(resumeService(), { actives: 0, servies: 0, prets: 0, aSuivre: 0 });
  assert.deepEqual(resumeService(null, null), { actives: 0, servies: 0, prets: 0, aSuivre: 0 });
  assert.deepEqual(resumeService([null, { id: 'x', table_id: 't1' }], tables, () => null), { actives: 3, servies: 1, prets: 0, aSuivre: 0 });
});

test('part des tables servies : de 0 à 1, 0 sans table', () => {
  assert.equal(partServies({ actives: 4, servies: 1 }), 0.25);
  assert.equal(partServies({ actives: 0, servies: 0 }), 0);
  assert.equal(partServies({ actives: 2, servies: 5 }), 1);
  assert.equal(partServies(null), 0);
});
