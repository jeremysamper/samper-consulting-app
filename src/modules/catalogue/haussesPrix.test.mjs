// node src/modules/catalogue/haussesPrix.test.mjs : hausses de prix fournisseur (haussesPrix.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { SEUIL_ECART_PCT as SEUIL_SCAN } from './scan/scanFactureLogic.js';
import { SEUIL_ECART_PCT, debutPeriode, effetsSurFiches, haussesPrix, prixAffiche } from './haussesPrix.js';

const AUJ = '2026-11-18';
const produits = [
  { id: 'beurre', nom: 'Beurre', uniteRef: 'g', prixUnitaireManuel: 0.02, strategiePrix: 'max', fournisseurs: [{ fournisseurId: 'f1', prixUnitaire: 0.024 }] },
  { id: 'oeufs', nom: 'Oeufs', uniteRef: 'pcs', prixUnitaireManuel: 0.5, fournisseurs: [] },
  { id: 'creme', nom: 'Crème', uniteRef: 'ml', prixUnitaireManuel: 0.008, fournisseurs: [] },
];
const r = (id, produitId, releveLe, prixUnitaire, extra = {}) => ({
  id, produitId, fournisseurId: 'f1', fournisseurNom: 'Laiterie', releveLe, prixUnitaire, createdAt: `${releveLe}T08:00:00Z`, ...extra,
});

test('le seuil est celui de la lecture des factures', () => {
  assert.equal(SEUIL_ECART_PCT, SEUIL_SCAN);
  assert.equal(debutPeriode(AUJ), '2026-10-20');
  assert.equal(debutPeriode('2026-03-01', 30), '2026-01-31');
});

test('hausse : signalée avec ancien, nouveau et écart', () => {
  const h = haussesPrix([r('a', 'beurre', '2026-09-01', 0.02), r('b', 'beurre', '2026-11-10', 0.024)], produits, { aujourdhui: AUJ });
  assert.equal(h.length, 1);
  assert.equal(h[0].produitNom, 'Beurre');
  assert.equal(h[0].fournisseurNom, 'Laiterie');
  assert.equal(h[0].ancien, 0.02);
  assert.equal(h[0].nouveau, 0.024);
  assert.equal(h[0].ecartPct, 20);
  assert.equal(h[0].depuis, '2026-09-01');
  assert.equal(h[0].le, '2026-11-10');
});

test('écart égal au seuil : signalé (1.00 puis 1.15 vaut 15 %)', () => {
  const h = haussesPrix([r('a', 'oeufs', '2026-08-01', 1), r('b', 'oeufs', '2026-11-01', 1.15)], produits, { aujourdhui: AUJ });
  assert.equal(h.length, 1);
  assert.equal(h[0].ecartPct, 15);
  const sous = haussesPrix([r('a', 'oeufs', '2026-08-01', 1), r('b', 'oeufs', '2026-11-01', 1.14)], produits, { aujourdhui: AUJ });
  assert.equal(sous.length, 0);
});

test('baisse : jamais signalée', () => {
  const h = haussesPrix([r('a', 'beurre', '2026-09-01', 0.03), r('b', 'beurre', '2026-11-10', 0.02)], produits, { aujourdhui: AUJ });
  assert.deepEqual(h, []);
});

test('changement d\'unité : jamais une hausse', () => {
  // Grammes puis pièces : les prix ne se comparent pas.
  const incompatible = haussesPrix([
    r('a', 'beurre', '2026-09-01', 0.02, { uniteCond: 'g' }),
    r('b', 'beurre', '2026-11-10', 2.5, { uniteCond: 'pcs' }),
  ], produits, { aujourdhui: AUJ });
  assert.deepEqual(incompatible, []);
  // Le même prix écrit au kilo puis au gramme : converti, aucun écart.
  const convertible = haussesPrix([
    r('a', 'beurre', '2026-09-01', 20, { uniteCond: 'kg' }),
    r('b', 'beurre', '2026-11-10', 0.02, { uniteCond: 'g' }),
  ], produits, { aujourdhui: AUJ });
  assert.deepEqual(convertible, []);
  // Au kilo puis au gramme, avec une vraie hausse : signalée, en CHF par gramme.
  const hausse = haussesPrix([
    r('a', 'beurre', '2026-09-01', 20, { uniteCond: 'kg' }),
    r('b', 'beurre', '2026-11-10', 0.025, { uniteCond: 'g' }),
  ], produits, { aujourdhui: AUJ });
  assert.equal(hausse.length, 1);
  assert.equal(hausse[0].unite, 'g');
  assert.equal(hausse[0].ancien, 0.02);
  assert.equal(hausse[0].ecartPct, 25);
});

test('changement de conditionnement au même prix par unité : pas une hausse', () => {
  const h = haussesPrix([
    r('a', 'creme', '2026-09-01', 0.008, { uniteCond: 'ml', prixAchat: 8, quantiteCond: 1000 }),
    r('b', 'creme', '2026-11-10', 0.008, { uniteCond: 'ml', prixAchat: 40, quantiteCond: 5000 }),
  ], produits, { aujourdhui: AUJ });
  assert.deepEqual(h, []);
});

test('premier prix sans précédent : rien à signaler', () => {
  assert.deepEqual(haussesPrix([r('a', 'beurre', '2026-11-10', 0.05)], produits, { aujourdhui: AUJ }), []);
  // Deux relevés dans la période sans relevé d'avant : le premier sert de référence.
  const h = haussesPrix([r('a', 'beurre', '2026-10-25', 0.02), r('b', 'beurre', '2026-11-10', 0.03)], produits, { aujourdhui: AUJ });
  assert.equal(h.length, 1);
  assert.equal(h[0].ecartPct, 50);
});

test('période : une hausse plus ancienne que 30 jours sort de la liste', () => {
  const h = haussesPrix([r('a', 'beurre', '2026-08-01', 0.02), r('b', 'beurre', '2026-10-19', 0.03)], produits, { aujourdhui: AUJ });
  assert.deepEqual(h, []);
  const j90 = haussesPrix([r('a', 'beurre', '2026-08-01', 0.02), r('b', 'beurre', '2026-10-19', 0.03)], produits, { aujourdhui: AUJ, jours: 90 });
  assert.equal(j90.length, 1);
});

test('plusieurs relevés dans la période : le dernier contre celui d\'avant la période', () => {
  const h = haussesPrix([
    r('a', 'beurre', '2026-09-01', 0.02), r('b', 'beurre', '2026-10-25', 0.026), r('c', 'beurre', '2026-11-12', 0.0262),
  ], produits, { aujourdhui: AUJ });
  assert.equal(h.length, 1);
  assert.equal(h[0].ancien, 0.02);
  assert.equal(h[0].nouveau, 0.0262);
  // Prix revenu à l'ancien dans la période : plus de hausse.
  const retour = haussesPrix([r('a', 'beurre', '2026-09-01', 0.02), r('b', 'beurre', '2026-10-25', 0.03), r('c', 'beurre', '2026-11-12', 0.02)], produits, { aujourdhui: AUJ });
  assert.deepEqual(retour, []);
});

test('par fournisseur : deux fournisseurs qui alternent ne font pas une hausse', () => {
  const h = haussesPrix([
    r('a', 'beurre', '2026-09-01', 0.02, { fournisseurId: 'f1' }),
    r('b', 'beurre', '2026-11-01', 0.03, { fournisseurId: 'f2', fournisseurNom: 'Grossiste' }),
    r('c', 'beurre', '2026-11-10', 0.02, { fournisseurId: 'f1' }),
  ], produits, { aujourdhui: AUJ });
  assert.deepEqual(h, []);
});

test('relevé d\'un produit absent ou illisible : ignoré', () => {
  const h = haussesPrix([
    r('a', 'inconnu', '2026-09-01', 1), r('b', 'inconnu', '2026-11-10', 2),
    r('c', 'oeufs', '2026-09-01', 0), r('d', 'oeufs', '2026-11-10', 1),
    r('e', 'creme', 'pas une date', 0.001), r('f', 'creme', '2026-11-10', 0.01),
  ], produits, { aujourdhui: AUJ });
  assert.deepEqual(h, []);
});

test('effet sur les fiches : coût matière par le calcul existant', () => {
  const [hausse] = haussesPrix([r('a', 'beurre', '2026-09-01', 0.02), r('b', 'beurre', '2026-11-10', 0.024)], produits, { aujourdhui: AUJ });
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
  const e = effetsSurFiches(hausse, recettes, produits);
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
});

test('effet sur les fiches : prix retenu d\'un autre fournisseur, les fiches n\'ont pas bougé', () => {
  const autres = [{ ...produits[0], fournisseurs: [{ fournisseurId: 'f1', prixUnitaire: 0.024 }, { fournisseurId: 'f2', prixUnitaire: 0.03 }] }];
  const [hausse] = haussesPrix([r('a', 'beurre', '2026-09-01', 0.02), r('b', 'beurre', '2026-11-10', 0.024)], autres, { aujourdhui: AUJ });
  assert.equal(effetsSurFiches(hausse, [], autres).suitCatalogue, false);
});

test('prix affiché au kilo, au litre ou à la pièce', () => {
  assert.deepEqual(prixAffiche(0.024, 'g'), { prix: 24, libelle: 'le kg' });
  assert.deepEqual(prixAffiche(0.008, 'ml'), { prix: 8, libelle: 'le litre' });
  assert.deepEqual(prixAffiche(0.5, 'pcs'), { prix: 0.5, libelle: 'la pièce' });
});
