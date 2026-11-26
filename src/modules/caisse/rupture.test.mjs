// node --test : rupture d'un produit de la caisse (lot L2). Un produit est en
// rupture le jour de Zurich porté par caisse_boutons.rupture_le, et redevient
// vendable tout seul le lendemain.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enRupture, etatDisponibilite, libelleCompteRupture, messagePortions, motEtat, produitsEnRupture } from './rupture.js';
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

// ── Lot 12 du panel : quatre états, compteur du jour, épuisé durable ──

test('les quatre états', () => {
  assert.deepEqual(etatDisponibilite({}, AUJ), { etat: 'en_vente', restant: null });
  assert.deepEqual(etatDisponibilite({ rupture_le: AUJ }, AUJ), { etat: 'rupture', restant: null });
  assert.deepEqual(etatDisponibilite({ epuise_durable: true, rupture_le: AUJ }, AUJ), { etat: 'epuise', restant: null });
  assert.deepEqual(etatDisponibilite({ portions_le: AUJ, portions_restantes: 3 }, AUJ), { etat: 'compte', restant: 3 });
});

test('bouton absent : en vente', () => {
  assert.deepEqual(etatDisponibilite(undefined, AUJ), { etat: 'en_vente', restant: null });
  assert.deepEqual(etatDisponibilite(null, AUJ), { etat: 'en_vente', restant: null });
});

test('un compteur d\'hier ne compte pas', () => {
  assert.deepEqual(etatDisponibilite({ portions_le: '2026-11-21', portions_restantes: 0 }, AUJ), { etat: 'en_vente', restant: null });
  assert.equal(enRupture({ portions_le: '2026-11-21', portions_restantes: 0 }, AUJ), false);
});

test('compteur du jour à zéro : rupture', () => {
  assert.deepEqual(etatDisponibilite({ portions_le: AUJ, portions_restantes: 0 }, AUJ), { etat: 'rupture', restant: 0 });
  assert.equal(enRupture({ portions_le: AUJ, portions_restantes: 0 }, AUJ), true);
  assert.equal(enRupture({ portions_le: AUJ, portions_restantes: 1 }, AUJ), false);
});

test('épuisé durable : vrai un autre jour', () => {
  const b = { epuise_durable: true, rupture_le: AUJ };
  assert.equal(enRupture(b, '2026-11-30'), true);
  assert.deepEqual(etatDisponibilite(b, '2026-11-30'), { etat: 'epuise', restant: null });
});

test('jour mal formé : en vente', () => {
  assert.deepEqual(etatDisponibilite({ epuise_durable: true }, '26.11.2026'), { etat: 'en_vente', restant: null });
  assert.deepEqual(etatDisponibilite({ portions_le: AUJ, portions_restantes: 2 }, undefined), { etat: 'en_vente', restant: null });
});

test('mot de la case', () => {
  assert.equal(motEtat('rupture'), 'Rupture');
  assert.equal(motEtat('epuise'), 'Épuisé');
  assert.equal(motEtat('compte'), 'Reste');
  assert.equal(motEtat('en_vente'), '');
});

test('produitsEnRupture compte les trois cas non vendables', () => {
  const articles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }];
  const boutons = {
    a: { rupture_le: AUJ },
    b: { epuise_durable: true, rupture_le: '2026-11-20' },
    c: { portions_le: AUJ, portions_restantes: 0, rupture_le: AUJ },
    d: { portions_le: AUJ, portions_restantes: 4 },
  };
  assert.deepEqual(produitsEnRupture(articles, boutons, AUJ).map((x) => x.id), ['a', 'b', 'c']);
});

test('phrases des refus du compteur (message de la base, code P0001)', () => {
  assert.equal(messagePortions('caisse: il ne reste plus de portion de ce produit'), "Il n'en reste plus. Le produit passe en rupture.");
  assert.equal(messagePortions('caisse: il ne reste que 2 portions de ce produit'), 'Il ne reste que 2 portions.');
  assert.equal(messagePortions('caisse: il ne reste que 1 portions de ce produit'), "Il ne reste qu'une portion.");
  assert.equal(messagePortions("caisse: il ne reste qu'une portion de ce produit"), "Il ne reste qu'une portion.");
  assert.equal(messagePortions('caisse: ticket introuvable'), null);
  assert.equal(messagePortions(undefined), null);
});
