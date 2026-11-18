import test from 'node:test';
import assert from 'node:assert/strict';
import { BAREME, GESTES, estGeste, formatDuree, formatDureeGeste, resumerTempsGagne } from './tempsGagneBareme.js';

test('chaque geste du barème a sa durée, son libellé et sa justification', () => {
  for (const g of GESTES) {
    const b = BAREME[g];
    assert.ok(/^[a-z][a-z0-9_]{1,39}$/.test(g), `nom de geste accepté par la base : ${g}`);
    assert.ok(Number.isInteger(b.secondes) && b.secondes > 0, g);
    assert.ok(b.libelle && b.unite && b.avant && b.pourquoi, g);
  }
});

test('résumé : total, détail trié, gestes inconnus et quantités invalides ignorés', () => {
  const r = resumerTempsGagne([
    { geste: 'fiche_importee', quantite: 3 },
    { geste: 'horaire_copie', quantite: 25 },
    { geste: 'fiche_importee' },
    { geste: 'geste_futur', quantite: 10 },
    { geste: 'facture_lue', quantite: 0 },
    { geste: 'facture_lue', quantite: 2.5 },
    null,
  ]);
  assert.equal(r.totalSecondes, 4 * 8 * 60 + 25 * 30);
  assert.deepEqual(r.detail.map((d) => [d.geste, d.quantite]), [['fiche_importee', 4], ['horaire_copie', 25]]);
  assert.equal(estGeste('geste_futur'), false);
});

test('résumé vide', () => {
  assert.deepEqual(resumerTempsGagne([]), { totalSecondes: 0, detail: [] });
  assert.deepEqual(resumerTempsGagne(undefined), { totalSecondes: 0, detail: [] });
});

test('durée affichée, arrondie vers le bas', () => {
  assert.equal(formatDuree(0), '0 min');
  assert.equal(formatDuree(59), '0 min');
  assert.equal(formatDuree(45 * 60 + 59), '45 min');
  assert.equal(formatDuree(60 * 60), '1 h');
  assert.equal(formatDuree(2 * 3600 + 5 * 60), '2 h 05');
  assert.equal(formatDuree(-10), '0 min');
});

test('durée d\'un geste : secondes sous la minute', () => {
  assert.equal(formatDureeGeste(30), '30 s');
  assert.equal(formatDureeGeste(8 * 60), '8 min');
});
