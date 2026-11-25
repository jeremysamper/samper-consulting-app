// node --test : liste « Mise en place de demain » (serieDemain.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { facteurPrevision, listeDemain } from './serieDemain.js';

test('facteur de prévision : borné, neutre sans donnée', () => {
  assert.equal(facteurPrevision({ prevus: 42, reference: 35 }), 1.2);
  assert.equal(facteurPrevision({ prevus: 200, reference: 35 }), 2);
  assert.equal(facteurPrevision({ prevus: null, reference: 35 }), 1);
});

test('modèle puis ventes regroupées par fiche, ajustées', () => {
  const r = listeDemain({
    modele: { lignes: [{ label: 'Velouté', recette_id: 'r1', quantite: 4, unite: 'l' }, { label: 'Herbes ciselées' }] },
    ventes: [{ recipeId: 'r2', recipeName: 'Gratin', qty: 5 }, { recipeId: 'r2', recipeName: 'Gratin', qty: 3 }, { recipeId: 'r1', recipeName: 'Velouté', qty: 6 }],
    prevision: { prevus: 40, reference: 40 },
  });
  assert.deepEqual(r.lignes.map((l) => [l.label, l.quantite, l.origine]), [
    ['Velouté', 6, 'ventes'], ['Herbes ciselées', null, 'modele'], ['Gratin', 8, 'ventes'],
  ]);
  const ajuste = listeDemain({ ventes: [{ recipeId: 'r2', recipeName: 'Gratin', qty: 8 }], prevision: { prevus: 45, reference: 30 } });
  assert.equal(ajuste.lignes[0].quantite, 12);
  assert.equal(ajuste.lignes[0].origine, 'prevision');
});
