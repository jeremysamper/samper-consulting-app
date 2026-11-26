// node --test : accords d'une fiche salle reliés aux boissons de la maison
// (lot 15 du panel). Boissons proposables, état d'un accord (libre, relié, en
// rupture, retiré de la carte), lier, délier, nettoyer avant l'enregistrement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boissonsDeLaMaison, resoudreAccord, lierAccord, delierAccord, nettoyerAccords } from './accordsCarte.js';

const JOUR = '2026-11-26';
const HIER = '2026-11-25';

const cartes = [
  { id: 'c-vins', nom: 'Carte des vins', genre: 'boissons' },
  { id: 'c-bar', nom: 'Bar', genre: 'boissons' },
  { id: 'c-mets', nom: 'Automne', genre: 'mets' },
];

test('boissonsDeLaMaison : carte de boissons, catégorie Boissons, exclusions', () => {
  const plats = [
    { id: 'p1', nom: 'Cornalin', categorie: 'Vins rouges', actif: true, carteIds: ['c-vins'] },
    { id: 'p2', nom: 'Eau minérale', categorie: 'Boissons', actif: true, carteIds: [] },
    { id: 'p3', nom: 'Bœuf', categorie: 'Plats', actif: true, carteIds: ['c-mets'] },
    { id: 'p4', nom: 'Fendant inactif', categorie: 'Vins blancs', actif: false, carteIds: ['c-vins'] },
    { id: 'p5', nom: 'Vin caché', categorie: 'Boissons', actif: true, carteIds: ['c-cachee'] },
    { id: 'p6', nom: 'Vin d archive', categorie: 'Vins', actif: true, carteIds: ['c-archive'] },
    { id: 'p7', nom: 'Amigne', categorie: 'Vins blancs', actif: true, carteIds: ['c-vins', 'c-bar'] },
  ];
  const liste = boissonsDeLaMaison(plats, [...cartes, { id: 'c-archive', nom: 'Vieille', genre: 'boissons', archive: true }]);
  const ids = liste.map((b) => b.platId);
  assert.ok(ids.includes('p1'));
  assert.ok(ids.includes('p2'));
  assert.ok(!ids.includes('p3'));
  assert.ok(!ids.includes('p4'));
  assert.ok(!ids.includes('p5'));
  assert.ok(!ids.includes('p6'));
  assert.equal(ids.filter((id) => id === 'p7').length, 1);
  assert.deepEqual(liste.find((b) => b.platId === 'p2'), { platId: 'p2', nom: 'Eau minérale', carteNom: '' });
});

test('boissonsDeLaMaison : catégorie Boissons sur une carte de mets visible', () => {
  const liste = boissonsDeLaMaison([{ id: 'p', nom: 'Jus', categorie: 'Boissons', carteIds: ['c-mets'] }], cartes);
  assert.deepEqual(liste, [{ platId: 'p', nom: 'Jus', carteNom: 'Automne' }]);
});

test('boissonsDeLaMaison : ordre par carte puis par nom, sans carte à la fin', () => {
  const plats = [
    { id: 'a', nom: 'Thé', categorie: 'Boissons', carteIds: [] },
    { id: 'b', nom: 'Petite Arvine', carteIds: ['c-vins'] },
    { id: 'c', nom: 'Écume', carteIds: ['c-vins'] },
    { id: 'd', nom: 'Spritz', carteIds: ['c-bar'] },
    { id: 'e', nom: 'Amigne', carteIds: ['c-vins'] },
  ];
  assert.deepEqual(boissonsDeLaMaison(plats, cartes).map((b) => b.platId), ['d', 'e', 'c', 'b', 'a']);
});

test('boissonsDeLaMaison : entrées absentes ou vides', () => {
  assert.deepEqual(boissonsDeLaMaison(undefined, undefined), []);
  assert.deepEqual(boissonsDeLaMaison([null, {}], [null]), []);
});

const plats = new Map([
  ['vin', { id: 'vin', nom: 'Cornalin, la bouteille', actif: true }],
  ['off', { id: 'off', nom: 'Vin retiré', actif: false }],
]);

test('resoudreAccord : libre, relié, nom actuel', () => {
  assert.deepEqual(resoudreAccord({ nom: 'Fendant' }, plats, {}, JOUR), { nom: 'Fendant', etat: 'libre' });
  assert.deepEqual(resoudreAccord({ nom: 'Ancien nom', platId: 'vin' }, plats, {}, JOUR), { nom: 'Cornalin, la bouteille', etat: 'lie' });
});

test('resoudreAccord : rupture du jour, rupture d hier', () => {
  assert.equal(resoudreAccord({ nom: 'x', platId: 'vin' }, plats, { vin: { rupture_le: JOUR } }, JOUR).etat, 'rupture');
  assert.equal(resoudreAccord({ nom: 'x', platId: 'vin' }, plats, { vin: { rupture_le: HIER } }, JOUR).etat, 'lie');
  assert.equal(resoudreAccord({ nom: 'x', platId: 'vin' }, plats, { vin: { epuise_durable: true } }, JOUR).etat, 'rupture');
});

test('resoudreAccord : plat inactif ou introuvable', () => {
  assert.deepEqual(resoudreAccord({ nom: 'Gardé', platId: 'off' }, plats, {}, JOUR), { nom: 'Gardé', etat: 'retire' });
  assert.deepEqual(resoudreAccord({ nom: 'Gardé', platId: 'inconnu' }, plats, {}, JOUR), { nom: 'Gardé', etat: 'retire' });
  assert.equal(resoudreAccord({ nom: 'Gardé', platId: 'off' }, plats, { off: { rupture_le: JOUR } }, JOUR).etat, 'retire');
});

test('resoudreAccord : plats vides ou absents, jamais retiré', () => {
  for (const vide of [new Map(), {}, null, undefined]) {
    assert.deepEqual(resoudreAccord({ nom: 'Gardé', platId: 'vin' }, vide, {}, JOUR), { nom: 'Gardé', etat: 'lie' });
    assert.equal(resoudreAccord({ nom: 'Gardé', platId: 'vin' }, vide, { vin: { rupture_le: JOUR } }, JOUR).etat, 'rupture');
  }
});

test('resoudreAccord : plats en objet, boutons vides ou absents', () => {
  assert.equal(resoudreAccord({ nom: 'x', platId: 'vin' }, { vin: { nom: 'Vin', actif: true } }, undefined, JOUR).etat, 'lie');
  assert.doesNotThrow(() => resoudreAccord({ nom: 'x', platId: 'vin' }, plats, null, JOUR));
  assert.doesNotThrow(() => resoudreAccord(null, null, null, null));
});

test('lierAccord puis delierAccord : champs gardés', () => {
  const accord = { type: 'vin', nom: 'Saisi', region: 'Valais', alternative: 'Rouge', notes: 'Carafer', note: 'Ancienne' };
  const lie = lierAccord(accord, { platId: 'vin', nom: 'Cornalin', carteNom: 'Vins' });
  assert.deepEqual(lie, { ...accord, platId: 'vin', nom: 'Cornalin' });
  const delie = delierAccord(lie);
  assert.equal('platId' in delie, false);
  assert.deepEqual(delie, { ...accord, nom: 'Cornalin' });
});

test('nettoyerAccords : platId invalide retiré, le reste gardé', () => {
  const libre = { type: 'vin', nom: 'Libre', note: 'Clé inconnue' };
  const sortie = nettoyerAccords([
    { nom: 'a', platId: '' },
    { nom: 'b', platId: null },
    { nom: 'c', platId: 12 },
    { nom: 'd', platId: 'ok' },
    libre,
  ]);
  assert.deepEqual(sortie, [{ nom: 'a' }, { nom: 'b' }, { nom: 'c' }, { nom: 'd', platId: 'ok' }, libre]);
  assert.equal(sortie[4], libre);
  assert.deepEqual(nettoyerAccords(undefined), []);
});
