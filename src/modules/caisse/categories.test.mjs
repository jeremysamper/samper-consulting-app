// node --test : rangement des boissons d'une carte de boissons dans la grille
// de la caisse (Carte des boissons, 22.11.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ID_A_TRIER, rangerArticles } from './categories.js';
import { articlesDeCaisse } from './reglages.js';

const cartes = [{ id: 'mets', genre: 'mets' }, { id: 'vins', genre: 'boissons' }];
const plats = [
  { id: 'rosti', nom: 'Rösti', categorie: 'Plats', carteIds: ['mets'] },
  { id: 'fendant', nom: 'Fendant', categorie: 'Vins blancs', carteIds: ['vins'] },
  { id: 'kirsch', nom: 'Kirsch', categorie: 'Spiritueux', carteIds: ['vins'] },
  { id: 'cuvee', nom: 'Cuvée maison', categorie: 'Maison', carteIds: ['vins'] },
  { id: 'tarte', nom: 'Tarte', categorie: 'Pâtisserie', carteIds: ['mets'] },
];
const formats = new Map([['fendant', [{ id: 'f1', libelle: '1 dl', prix: 3.5 }]]]);
const categorie = (r, id) => r.parArticle.get(id)?.nom;

test('articles de caisse : formats et origine boissons', () => {
  const a = articlesDeCaisse({ plats, cartes, formats });
  assert.deepEqual(a.find((x) => x.id === 'fendant').formats.map((f) => f.libelle), ['1 dl']);
  assert.equal(a.find((x) => x.id === 'fendant').boisson, true);
  assert.equal(a.find((x) => x.id === 'rosti').boisson, false);
  assert.deepEqual(a.find((x) => x.id === 'rosti').formats, []);
});

test('une boisson va dans la catégorie de sa rubrique, sinon « Boissons à trier », jamais « Autres »', () => {
  const articles = articlesDeCaisse({ plats, cartes, formats });
  const maison = [
    { id: 'c-plats', nom: 'Plats', ordre: 0 },
    { id: 'c-vins', nom: 'Vins', ordre: 1 },
    { id: 'c-alcools', nom: 'Alcools', ordre: 2 },
  ];
  const r = rangerArticles({ articles, boutons: {}, categoriesMaison: maison });
  assert.equal(categorie(r, 'fendant'), 'Vins');
  assert.equal(categorie(r, 'kirsch'), 'Alcools');
  assert.equal(r.parArticle.get('cuvee').id, ID_A_TRIER);
  assert.equal(categorie(r, 'tarte'), 'Autres');
});

test('une maison qui a une catégorie « Boissons » y range les boissons sans catégorie de rubrique', () => {
  const articles = articlesDeCaisse({ plats, cartes, formats });
  const r = rangerArticles({ articles, boutons: {}, categoriesMaison: [{ id: 'c-b', nom: 'Boissons', ordre: 0 }] });
  assert.equal(categorie(r, 'fendant'), 'Boissons');
  assert.equal(categorie(r, 'cuvee'), 'Boissons');
});

test('le choix de la maison (caisse_boutons) passe avant la rubrique', () => {
  const articles = articlesDeCaisse({ plats, cartes, formats });
  const maison = [{ id: 'c-vins', nom: 'Vins', ordre: 0 }, { id: 'c-apero', nom: 'Apéritifs', ordre: 1 }];
  const r = rangerArticles({ articles, boutons: { fendant: { categorie_id: 'c-apero' } }, categoriesMaison: maison });
  assert.equal(categorie(r, 'fendant'), 'Apéritifs');
});
