// node --test : règles de correspondance de Ventes POS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loteEnSerie, regleQuiCorrespond } from './reglesCorrespondance.js';

const regles = [
  { id: 'r1', motif: 'SUPPLÉMENT', mode: 'commence', action: 'ignorer', priorite: 10 },
  { id: 'r2', motif: 'filet', mode: 'contient', action: 'relier', recette_id: 'f1', priorite: 0 },
  { id: 'r3', motif: 'filet de boeuf', mode: 'contient', action: 'relier', recette_id: 'f2', priorite: 0 },
];

test('règle : casse et accents gommés, priorité puis motif le plus long', () => {
  assert.equal(regleQuiCorrespond('Supplement frites', regles).id, 'r1');
  assert.equal(regleQuiCorrespond('Filet de bœuf, sauce', regles).id, 'r3'); // œ lu oe
  assert.equal(regleQuiCorrespond('FILET DE BOEUF', regles).id, 'r3');
  assert.equal(regleQuiCorrespond('Filet de perche', regles).id, 'r2');
  assert.equal(regleQuiCorrespond('Tarte', regles), null);
});

test('lot en série : règles, suggestions sûres, ignorés et validés exclus', () => {
  const lot = loteEnSerie({
    posItems: [{ id: 'a', name: 'Supplément sauce' }, { id: 'b', name: 'Filet de perche' }, { id: 'c', name: 'Tarte' }, { id: 'd', name: 'Soupe' }, { id: 'e', name: 'Risotto' }],
    mappings: { e: { recipe_id: 'f9', confidence: 90, manually_validated: true } },
    suggestions: { c: { recipeId: 'f5', score: 92 }, d: { recipeId: 'f6', score: 60 } },
    regles,
    seuil: 85,
  });
  assert.deepEqual(lot.map((l) => [l.posItemId, l.recipeId, l.regleId]), [['b', 'f1', 'r2'], ['c', 'f5', null]]);
});
