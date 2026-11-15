// node --test src/modules/caisse/supplements.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { lireSupplements, supplementsPourLigne, libelleSupplement } from './supplements.js';
import { rangerArticles } from './categories.js';

const CATS = [
  { id: 'c-des', nom: 'Desserts', ordre: 0, actif: true },
  { id: 'c-gla', nom: 'Glaces', ordre: 1, actif: true },
  { id: 'c-alc', nom: 'Alcools', ordre: 2, actif: true },
];
const art = (id, nom, categorie, prixVente = 4) => ({ id, nom, categorie, prixVente });
const ARTICLES = [
  art('vanille', 'Glace vanille', 'Glaces'),
  art('supp', 'Supplément alcool', 'Glaces', 5),
  art('coupe', 'Coupe du chasseur', 'Desserts', 15),
  art('willi', 'Williamine', 'Boissons', 9),
  art('kirsch', 'Kirsch', 'Boissons', 8),
];
// Les alcools sont rangés dans « Alcools » par la maison (caisse_boutons.categorie_id).
const BOUTONS = { willi: { categorie_id: 'c-alc' }, kirsch: { categorie_id: 'c-alc', ordre: 0 } };
const REGLAGE = lireSupplements([{ plat_id: 'supp', choix: 'Alcools', pour: ['Glaces'] }]);
const rangement = rangerArticles({ articles: ARTICLES, boutons: BOUTONS, categoriesMaison: CATS });

test('le réglage brut est nettoyé', () => {
  assert.deepEqual(lireSupplements(null), []);
  assert.deepEqual(lireSupplements([{ plat_id: 'x', choix: '', pour: ['Glaces'] }, { plat_id: 'y', choix: 'Alcools', pour: [] }]), []);
  assert.deepEqual(REGLAGE, [{ plat_id: 'supp', choix: 'Alcools', pour: ['Glaces'] }]);
});

test('une glace propose le supplément avec les alcools de la caisse, dans leur ordre', () => {
  const s = supplementsPourLigne({ ligne: { plat_id: 'vanille' }, supplements: REGLAGE, rangement, articles: ARTICLES });
  assert.equal(s.length, 1);
  assert.equal(s[0].prix, 5);
  assert.deepEqual(s[0].choix, ['Kirsch', 'Williamine']);
});

test('un alcool rangé de plus apparaît sans autre réglage', () => {
  const plus = [...ARTICLES, art('poire', 'Eau-de-vie de poire', 'Boissons', 9)];
  const r = rangerArticles({ articles: plus, boutons: { ...BOUTONS, poire: { categorie_id: 'c-alc' } }, categoriesMaison: CATS });
  const s = supplementsPourLigne({ ligne: { plat_id: 'vanille' }, supplements: REGLAGE, rangement: r, articles: plus });
  assert.deepEqual(s[0].choix, ['Kirsch', 'Williamine', 'Eau-de-vie de poire']);
});

test('rien hors des catégories visées, sur le supplément lui-même, ni sur une ligne libre', () => {
  const pour = (plat_id) => supplementsPourLigne({ ligne: { plat_id }, supplements: REGLAGE, rangement, articles: ARTICLES });
  assert.deepEqual(pour('coupe'), []);
  assert.deepEqual(pour('supp'), []);
  assert.deepEqual(pour(null), []);
});

test('un supplément absent des cartes en vente ne se propose pas', () => {
  const sansSupp = ARTICLES.filter((a) => a.id !== 'supp');
  const r = rangerArticles({ articles: sansSupp, boutons: BOUTONS, categoriesMaison: CATS });
  assert.deepEqual(supplementsPourLigne({ ligne: { plat_id: 'vanille' }, supplements: REGLAGE, rangement: r, articles: sansSupp }), []);
});

test('sans alcool en caisse, la liste est vide et le supplément reste proposé', () => {
  const r = rangerArticles({ articles: ARTICLES, boutons: {}, categoriesMaison: CATS });
  const s = supplementsPourLigne({ ligne: { plat_id: 'vanille' }, supplements: REGLAGE, rangement: r, articles: ARTICLES });
  assert.equal(s.length, 1);
  assert.deepEqual(s[0].choix, []);
});

test('le libellé de la ligne dit le choix', () => {
  assert.equal(libelleSupplement('Supplément alcool', 'Williamine'), 'Supplément alcool (Williamine)');
  assert.equal(libelleSupplement('Supplément alcool', null), 'Supplément alcool');
});
