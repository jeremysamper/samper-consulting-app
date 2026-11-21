import test from 'node:test';
import assert from 'node:assert/strict';
import { comptesCommande, photoDuBouton, quantitesParPlat, serviceDe } from './commande.js';

test('serviceDe lit le nom de la catégorie', () => {
  assert.equal(serviceDe('Entrées'), 'entrees');
  assert.equal(serviceDe('Entrée froide'), 'entrees');
  assert.equal(serviceDe('Plats'), 'plats');
  assert.equal(serviceDe('Plat du jour'), 'plats');
  assert.equal(serviceDe('Plateau de fromages'), null);
  assert.equal(serviceDe('Desserts'), 'desserts');
  assert.equal(serviceDe('Boissons'), null);
  assert.equal(serviceDe(''), null);
  assert.equal(serviceDe(null), null);
});

test('comptesCommande : catégorie de caisse, puis catégorie de fiche, quantités comprises', () => {
  const parArticle = new Map([
    ['p1', { nom: 'Entrées' }],
    ['p2', { nom: 'Autres' }],
    ['p3', { nom: 'Plats' }],
  ]);
  const articlesParId = new Map([
    ['p2', { categorie: 'Desserts' }],
    ['p4', { categorie: 'Plats' }],
    ['p5', { categorie: 'Boissons' }],
  ]);
  const lignes = [
    { plat_id: 'p1', quantite: 2, statut: 'en_attente' },
    { plat_id: 'p2', quantite: 1, statut: 'envoye' },
    { plat_id: 'p3', quantite: 3, statut: 'servi' },
    { plat_id: 'p4', quantite: 1, statut: 'en_attente' },
    { plat_id: 'p5', quantite: 4, statut: 'en_attente' },
    { plat_id: null, quantite: 1, statut: 'en_attente' },
    { plat_id: 'p1', quantite: 5, statut: 'annule' },
  ];
  assert.deepEqual(comptesCommande(lignes, { parArticle, articlesParId }), { entrees: 2, plats: 4, desserts: 1 });
});

test('comptesCommande sans rangement ni lignes', () => {
  assert.deepEqual(comptesCommande([]), { entrees: 0, plats: 0, desserts: 0 });
  assert.deepEqual(comptesCommande(null), { entrees: 0, plats: 0, desserts: 0 });
});

test('quantitesParPlat additionne les lignes du même plat', () => {
  const m = quantitesParPlat([
    { plat_id: 'a', quantite: 2 }, { plat_id: 'a', quantite: 1, statut: 'envoye' },
    { plat_id: 'b', quantite: 1 }, { plat_id: null, quantite: 3 }, { plat_id: 'b', quantite: 9, statut: 'annule' },
  ]);
  assert.equal(m.get('a'), 3);
  assert.equal(m.get('b'), 1);
  assert.equal(m.size, 2);
});

test('photoDuBouton : photo de la caisse, sinon de la fiche, vide = sans photo', () => {
  const plat = { photoUrl: 'https://x/fiche.jpg' };
  assert.equal(photoDuBouton(plat, null), 'https://x/fiche.jpg');
  assert.equal(photoDuBouton(plat, { photo_url: null }), 'https://x/fiche.jpg');
  assert.equal(photoDuBouton(plat, { photo_url: 'https://x/caisse.jpg' }), 'https://x/caisse.jpg');
  assert.equal(photoDuBouton(plat, { photo_url: '' }), null);
  assert.equal(photoDuBouton({}, null), null);
});
