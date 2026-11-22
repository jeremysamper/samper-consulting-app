import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOSSIERS_RESERVES, cleNom, documentVisible, peutReglerVisibilite, trouverDossier } from './gardesDocuments.js';

const docs = [
  { id: 'c', type: 'folder', nom: 'Contrats', parentId: null, rolesVisibles: ['resp_cuisine'] },
  { id: 'c1', type: 'file', nom: 'contrat-ines.pdf', parentId: 'c', rolesVisibles: null },
  { id: 'h', type: 'folder', nom: 'HACCP', parentId: null, rolesVisibles: null },
  { id: 'h2', type: 'folder', nom: 'Archives', parentId: 'h', rolesVisibles: ['cuisinier', 'resp_cuisine'] },
  { id: 'h3', type: 'folder', nom: 'haccp', parentId: 'h2', rolesVisibles: null },
];
const parId = new Map(docs.map((d) => [d.id, d]));

test('un dossier réservé cache son contenu aux autres rôles', () => {
  assert.equal(documentVisible(parId.get('c1'), 'cuisinier', parId), false);
  assert.equal(documentVisible(parId.get('c1'), 'resp_cuisine', parId), true);
  assert.equal(documentVisible(parId.get('h3'), 'serveur', parId), false);
  assert.equal(documentVisible(parId.get('h3'), 'cuisinier', parId), true);
});

test('un dossier réservé sans rôle coché est à la direction seule', () => {
  const d = new Map([['x', { id: 'x', type: 'folder', nom: 'Contrats', parentId: null, rolesVisibles: [] }]]);
  assert.equal(documentVisible(d.get('x'), 'resp_cuisine', d), false);
  assert.equal(documentVisible(d.get('x'), 'consultant', d), true);
  assert.equal(DOSSIERS_RESERVES.includes(cleNom('contrats')), true);
});

test('consultant et patron voient tout, et seuls règlent la visibilité', () => {
  assert.equal(documentVisible(parId.get('c1'), 'patron', parId), true);
  assert.equal(peutReglerVisibilite('patron'), true);
  assert.equal(peutReglerVisibilite('resp_cuisine'), false);
});

test('le dossier d\'un module se trouve par son nom, à la racine d\'abord', () => {
  assert.equal(trouverDossier(docs, 'haccp').id, 'h');
  assert.equal(trouverDossier(docs, 'Fournisseurs'), null);
  assert.equal(cleNom(' Hygiène '), 'hygiene');
});
