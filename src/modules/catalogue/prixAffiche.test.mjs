// node --test : prix du catalogue à deux décimales, à l'unité de vente.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prixAffiche } from './prixAffiche.js';

test('prix du catalogue : deux décimales, au kilo, au litre ou à la pièce', () => {
  assert.equal(prixAffiche(0.0095, 'ml'), 'CHF 9.50 / l');
  assert.equal(prixAffiche(1.9, 'pcs'), 'CHF 1.90 / pce');
  assert.equal(prixAffiche(0.028, 'g'), 'CHF 28.00 / kg');
  assert.equal(prixAffiche(24, 'pcs'), 'CHF 24.00 / pce');
  assert.equal(prixAffiche(0, 'g'), '');
  assert.equal(prixAffiche(0.000001, 'pcs'), 'CHF 0.000001 / pce');
});
