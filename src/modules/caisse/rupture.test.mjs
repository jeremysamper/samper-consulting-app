// node --test : rupture d'un produit de la caisse (lot L2). Un produit est en
// rupture le jour de Zurich porté par caisse_boutons.rupture_le, et redevient
// vendable tout seul le lendemain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enRupture, libelleCompteRupture, produitsEnRupture } from './rupture.js';
import { ROLES_RUPTURE, peutHabillerCaisse, peutMettreEnRupture } from './gardesCaisse.js';

const AUJ = '2026-11-22';

test('en rupture le jour même', () => {
  assert.equal(enRupture({ rupture_le: AUJ }, AUJ), true);
});

test('redevient vendable le lendemain, sans écriture', () => {
  assert.equal(enRupture({ rupture_le: AUJ }, '2026-11-23'), false);
});

test('un jour à venir (horloge en avance) ne compte pas', () => {
  assert.equal(enRupture({ rupture_le: '2026-11-23' }, AUJ), false);
});

test('sans ligne, sans colonne ou remis en vente : vendable', () => {
  assert.equal(enRupture(undefined, AUJ), false);
  assert.equal(enRupture({}, AUJ), false);
  assert.equal(enRupture({ rupture_le: null }, AUJ), false);
});

test('un jour de Zurich absent ou mal formé ne met rien en rupture', () => {
  assert.equal(enRupture({ rupture_le: AUJ }, undefined), false);
  assert.equal(enRupture({ rupture_le: AUJ }, '22.11.2026'), false);
});

test('une valeur horodatée garde son jour', () => {
  assert.equal(enRupture({ rupture_le: `${AUJ}T00:00:00` }, AUJ), true);
});

test('changement de jour à minuit, heure de Zurich', () => {
  // 23 h 59 le 22 : encore en rupture ; minuit passé, le 23 : vendable.
  assert.equal(enRupture({ rupture_le: AUJ }, '2026-11-22'), true);
  assert.equal(enRupture({ rupture_le: AUJ }, '2026-11-23'), false);
});

test('produitsEnRupture garde l\'ordre des articles en vente', () => {
  const articles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, null];
  const boutons = {
    a: { rupture_le: AUJ },
    b: { rupture_le: '2026-11-21' },
    c: { rupture_le: AUJ },
    z: { rupture_le: AUJ }, // plus en vente : pas compté
  };
  assert.deepEqual(produitsEnRupture(articles, boutons, AUJ).map((a) => a.id), ['a', 'c']);
  assert.deepEqual(produitsEnRupture(articles, boutons, '2026-11-23'), []);
  assert.deepEqual(produitsEnRupture(null, null, AUJ), []);
});

test('qui met en rupture : l\'habillage plus le serveur, comme la RPC', () => {
  // Même liste que caisse_poser_rupture (20261122_caisse_rupture_rpc.sql).
  assert.deepEqual([...ROLES_RUPTURE].sort(), ['consultant', 'patron', 'resp_cuisine', 'serveur']);
  assert.equal(peutMettreEnRupture('serveur'), true);
  assert.equal(peutMettreEnRupture('resp_cuisine'), true);
  ['cuisinier', 'hote', 'praticien_spa', null, undefined].forEach((r) => assert.equal(peutMettreEnRupture(r), false));
  // Le serveur met en rupture mais n'habille pas la caisse.
  assert.equal(peutHabillerCaisse('serveur'), false);
});

test('libellé du compteur', () => {
  assert.equal(libelleCompteRupture(1), 'produit en rupture');
  assert.equal(libelleCompteRupture(2), 'produits en rupture');
});
