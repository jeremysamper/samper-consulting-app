// node --test : effet d'une hausse de prix sur le coût matière des fiches
// (effetsHausseFiches.js). Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { effetsSurFiches } from './effetsHausseFiches.js';

const produits = [
  { id: 'beurre', nom: 'Beurre', uniteRef: 'g', prixUnitaireManuel: 0.02, strategiePrix: 'max', fournisseurs: [{ fournisseurId: 'f1', prixUnitaire: 0.024 }] },
  { id: 'oeufs', nom: 'Oeufs', uniteRef: 'pcs', prixUnitaireManuel: 0.5, fournisseurs: [] },
];
const recettes = [
  // 250 g de beurre + 4 oeufs, 10 portions : avant 5.00 + 2.00, après 6.00 + 2.00.
  { id: 'tarte', nom: 'Tarte', portions: 10, ingredients: [{ produitId: 'beurre', quantite: 250, unite: 'g' }, { produitId: 'oeufs', quantite: 4, unite: 'pcs' }] },
  // Beurre noté au kilo dans la fiche : converti.
  { id: 'sauce', nom: 'Sauce', portions: 4, ingredients: [{ produitId: 'beurre', quantite: 0.1, unite: 'kg' }] },
  { id: 'cachee', nom: 'Cachée', portions: 1, masquee: true, ingredients: [{ produitId: 'beurre', quantite: 10, unite: 'g' }] },
  { id: 'archivee', nom: 'Archivée', portions: 1, statut: 'archivée', ingredients: [{ produitId: 'beurre', quantite: 10, unite: 'g' }] },
  { id: 'pieces', nom: 'En pièces', portions: 2, ingredients: [{ produitId: 'beurre', quantite: 2, unite: 'pcs' }] },
  { id: 'sans', nom: 'Sans beurre', portions: 2, ingredients: [{ produitId: 'oeufs', quantite: 2, unite: 'pcs' }] },
];

const verifier = (e) => {
  assert.equal(e.suitCatalogue, true);
  assert.deepEqual(e.fiches.map((f) => f.id), ['sauce', 'tarte', 'pieces']);
  const tarte = e.fiches.find((f) => f.id === 'tarte');
  assert.ok(Math.abs(tarte.deltaParPortion - 0.1) < 1e-9);
  assert.ok(Math.abs(tarte.deltaPct - (100 / 7)) < 1e-9);
  const sauce = e.fiches.find((f) => f.id === 'sauce');
  assert.ok(Math.abs(sauce.deltaPct - 20) < 1e-9);
  assert.ok(Math.abs(sauce.deltaParPortion - 0.1) < 1e-9);
  const pieces = e.fiches.find((f) => f.id === 'pieces');
  assert.equal(pieces.chiffrable, false);
  assert.equal(pieces.deltaPct, null);
};

test('effet sur les fiches : coût matière par le calcul existant, prix au gramme', () => {
  verifier(effetsSurFiches({ produitId: 'beurre', unite: 'g', ancien: 0.02, nouveau: 0.024 }, recettes, produits));
});

test('effet sur les fiches : même résultat pour une hausse donnée au kilo (factures et bons)', () => {
  verifier(effetsSurFiches({ produitId: 'beurre', unite: 'kg', ancien: 20, nouveau: 24 }, recettes, produits));
});

test('effet sur les fiches : prix retenu d\'un autre fournisseur, les fiches n\'ont pas bougé', () => {
  const autres = [{ ...produits[0], fournisseurs: [{ fournisseurId: 'f1', prixUnitaire: 0.024 }, { fournisseurId: 'f2', prixUnitaire: 0.03 }] }];
  assert.equal(effetsSurFiches({ produitId: 'beurre', unite: 'kg', ancien: 20, nouveau: 24 }, [], autres).suitCatalogue, false);
});

test('effet sur les fiches : produit inconnu ou unité inconvertible', () => {
  assert.deepEqual(effetsSurFiches({ produitId: 'absent', unite: 'kg', ancien: 1, nouveau: 2 }, recettes, produits), { suitCatalogue: false, fiches: [] });
  const e = effetsSurFiches({ produitId: 'beurre', unite: 'pcs', ancien: 1, nouveau: 2 }, recettes, produits);
  assert.equal(e.suitCatalogue, false);
  assert.ok(e.fiches.every((f) => f.deltaPct === null));
});
