// Coordonnées légales de la quittance : ce qu'il faut pour encaisser un vrai
// ticket (raison sociale, localité, numéro de TVA lisible et dont la clé
// modulo 11 du numéro IDE est juste). Les trois numéros valables sont de vrais
// numéros IDE publiés par leur titulaire, relevés le 23.11.2026 : ils prouvent
// le calcul de la clé.
//
// Lancer : npm.cmd run test:unit

import test from 'node:test';
import assert from 'node:assert/strict';
import { manquesLegaux, normaliserNumeroTva, numeroTvaValable } from './reglages.js';

test('le numéro se remet à la forme officielle', () => {
  assert.equal(normaliserNumeroTva('CHE-109.030.864 TVA'), 'CHE-109.030.864 TVA');
  assert.equal(normaliserNumeroTva('che109030864mwst'), 'CHE-109.030.864 MWST');
  assert.equal(normaliserNumeroTva(' CHE 109 030 864 IVA '), 'CHE-109.030.864 IVA');
  assert.equal(normaliserNumeroTva('CHE-109.030.864'), null, 'sans TVA, MWST ou IVA, pas un numéro de TVA');
  assert.equal(normaliserNumeroTva('CHE-109.030.86 TVA'), null);
  assert.equal(normaliserNumeroTva(''), null);
  assert.equal(normaliserNumeroTva(null), null);
});

test('la clé modulo 11 du numéro IDE', () => {
  assert.equal(numeroTvaValable('CHE-109.030.864 TVA'), true);
  assert.equal(numeroTvaValable('CHE-211.403.691 MWST'), true);
  assert.equal(numeroTvaValable('CHE-116.265.869 TVA'), true);
  assert.equal(numeroTvaValable('CHE-123.456.788 TVA'), true, 'clé 8');
  assert.equal(numeroTvaValable('CHE-123.456.789 TVA'), false, 'le modèle affiché, pas un vrai numéro');
  assert.equal(numeroTvaValable('CHE-109.030.865 TVA'), false, 'un chiffre tapé de travers');
  // 1 0 0 0 0 0 0 1 : somme 5 + 4 = 9, clé 11 - 9 = 2.
  assert.equal(numeroTvaValable('CHE-100.000.012 TVA'), true);
  // 0 0 0 0 0 0 0 0 : somme 0, clé 11, ramenée à 0.
  assert.equal(numeroTvaValable('CHE-000.000.000 TVA'), true);
  // 0 0 0 0 0 0 0 3 : somme 12, reste 1, clé 10.
  assert.equal(numeroTvaValable('CHE-000.000.030 TVA'), false, 'une clé de 10 jamais attribuée');
});

test('ce qui manque pour encaisser', () => {
  assert.deepEqual(manquesLegaux(undefined), ['raison sociale', 'localité', 'numéro de TVA']);
  assert.deepEqual(manquesLegaux({ raison_sociale: '  ', adresse: 'Rue 1', localite: '', numero_tva: '' }),
    ['raison sociale', 'localité', 'numéro de TVA']);
  assert.deepEqual(manquesLegaux({ raison_sociale: 'Maison SA', localite: '1950 Sion', numero_tva: 'CHE-123.456.789 TVA' }),
    ['numéro de TVA valable']);
  assert.deepEqual(manquesLegaux({ raison_sociale: 'Maison SA', localite: '1950 Sion', numero_tva: 'che123456788tva' }), []);
  // L'adresse reste facultative : la loi demande le nom et le lieu.
  assert.deepEqual(manquesLegaux({ raison_sociale: 'Maison SA', adresse: '', localite: '1950 Sion', numero_tva: 'CHE-123.456.788 TVA' }), []);
});
