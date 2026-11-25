// node --test : ventes de la Caisse native et choix de la source (serieVentesCaisse.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirSource, dowDeJour, ventesCaisseParFiche } from './serieVentesCaisse.js';
import { listeDemain } from './serieDemain.js';

const plats = [
  { id: 'A', nom: 'Plat A', recetteIds: ['r1', 'r2'] },
  { id: 'B', nom: 'Plat B', recetteIds: ['r2'] },
  { id: 'C', nom: 'Plat C', recetteIds: [] },
];
const recettes = [{ id: 'r1', nom: 'Fiche 1' }, { id: 'r2', nom: 'Fiche 2' }];
const lignes = [
  { jour: '2026-11-18', platId: 'A', qty: 4 },
  { jour: '2026-11-18', platId: 'A', qty: 2 },
  { jour: '2026-11-25', platId: 'A', qty: 9 },
  { jour: '2026-11-25', platId: 'B', qty: 3 },
  { jour: '2026-11-20', platId: 'B', qty: 5 },
  { jour: '2026-11-21', platId: 'B', qty: 4 },
  { jour: '2026-11-19', platId: 'C', qty: 7 },
  { jour: '2026-11-22', platId: null, qty: 5 },
  { jour: '2026-11-23', platId: 'Z', qty: 5 },
  { jour: '2026-11-24', platId: 'A', qty: 0 },
];
const dowDemain = dowDeJour('2026-12-02');

test('jour de semaine sans fuseau', () => {
  assert.equal(dowDemain, 3);
  assert.equal(dowDeJour('2026-12-06'), 0);
});

test('plats additionnés par jour, règle de moyenne, fiches à plat', () => {
  const r = ventesCaisseParFiche({ lignes, plats, recettes, dowDemain });
  const a1 = r.items.find((i) => i.recipeId === 'r1');
  const a2 = r.items.find((i) => i.recipeId === 'r2' && i.name === 'Plat A');
  const b = r.items.find((i) => i.name === 'Plat B');
  assert.deepEqual({ qty: a1.qty, reliable: a1.reliable, occurrences: a1.occurrences }, { qty: 8, reliable: true, occurrences: 2 });
  assert.deepEqual({ qty: a2.qty, reliable: a2.reliable, occurrences: a2.occurrences }, { qty: 8, reliable: true, occurrences: 2 });
  assert.equal(a1.recipeName, 'Fiche 1');
  assert.deepEqual({ recipeId: b.recipeId, qty: b.qty, reliable: b.reliable, occurrences: b.occurrences }, { recipeId: 'r2', qty: 4, reliable: false, occurrences: 3 });
  assert.equal(r.items.length, 3);
  assert.ok(!r.items.some((i) => i.name === 'Plat C'));
  assert.deepEqual(r.sansFiche, [{ platId: 'C', nom: 'Plat C', qty: 7 }]);
  assert.equal(r.joursComparables, 2);
  assert.equal(r.total, 7);
});

test('fiche absente des recettes : nom « - »', () => {
  const r = ventesCaisseParFiche({ lignes: [{ jour: '2026-11-25', platId: 'X', qty: 2 }], plats: [{ id: 'X', nom: 'X', recetteIds: ['r9'] }], recettes: [], dowDemain });
  assert.equal(r.items[0].recipeName, '-');
});

test('demain dimanche : deux dimanches vendus', () => {
  const r = ventesCaisseParFiche({
    lignes: [{ jour: '2026-11-22', platId: 'A', qty: 3 }, { jour: '2026-11-29', platId: 'A', qty: 6 }],
    plats: [{ id: 'A', nom: 'Plat A', recetteIds: ['r1'] }], recettes, dowDemain: dowDeJour('2026-12-06'),
  });
  assert.deepEqual({ qty: r.items[0].qty, reliable: r.items[0].reliable, occurrences: r.items[0].occurrences }, { qty: 5, reliable: true, occurrences: 2 });
  assert.equal(r.joursComparables, 2);
});

test('passé à listeDemain, sans et avec prévision', () => {
  const { items } = ventesCaisseParFiche({ lignes, plats, recettes, dowDemain });
  const sans = listeDemain({ modele: null, ventes: items, prevision: { prevus: null, reference: null } });
  const q = (l, id) => l.lignes.find((x) => x.recetteId === id).quantite;
  assert.equal(q(sans, 'r1'), 8);
  assert.equal(q(sans, 'r2'), 12);
  const avec = listeDemain({ modele: null, ventes: items, prevision: { prevus: 45, reference: 30 } });
  assert.equal(q(avec, 'r1'), 12);
  assert.equal(q(avec, 'r2'), 18);
});

const caisseVentes = { loading: false, error: null, items: [{ recipeId: 'r1', qty: 3 }], sansFiche: [{ platId: 'C', nom: 'C', qty: 1 }], joursComparables: 2, total: 4 };
const caisseVide = { loading: false, error: null, items: [], sansFiche: [], joursComparables: 0, total: 0 };
const posVentes = { loading: false, error: null, items: [{ recipeId: 'r7', qty: 9 }], unmappedCount: 2 };
const posVide = { loading: false, error: null, items: [], unmappedCount: 0 };
const erreur = 'Lecture impossible.';

test('choisirSource : Caisse avec ventes, Ventes POS en erreur', () => {
  const r = choisirSource({ caisse: caisseVentes, pos: { ...posVide, error: erreur } });
  assert.equal(r.source, 'caisse');
  assert.equal(r.error, null);
  assert.equal(r.items, caisseVentes.items);
  assert.equal(r.nonRelies, 1);
});

test('choisirSource : Caisse vide, Ventes POS avec ventes', () => {
  const r = choisirSource({ caisse: caisseVide, pos: posVentes });
  assert.equal(r.source, 'pos');
  assert.equal(r.items, posVentes.items);
  assert.equal(r.nonRelies, 2);
  assert.equal(r.error, null);
});

test('choisirSource : Caisse en erreur, sans repli sur Ventes POS', () => {
  const r = choisirSource({ caisse: { ...caisseVide, error: erreur }, pos: posVentes });
  assert.equal(r.error, erreur);
  assert.deepEqual(r.items, []);
  assert.equal(r.source, null);
});

test('choisirSource : Caisse vide, Ventes POS en erreur', () => {
  const r = choisirSource({ caisse: caisseVide, pos: { ...posVide, error: erreur } });
  assert.equal(r.error, erreur);
  assert.deepEqual(r.items, []);
});

test('choisirSource : les deux vides', () => {
  const r = choisirSource({ caisse: caisseVide, pos: posVide });
  assert.equal(r.source, null);
  assert.equal(r.error, null);
  assert.equal(r.loading, false);
});

test('choisirSource : lecture en cours', () => {
  assert.equal(choisirSource({ caisse: { loading: true }, pos: posVentes }).loading, true);
  assert.equal(choisirSource({ caisse: caisseVide, pos: { ...posVide, loading: true } }).loading, true);
  assert.equal(choisirSource({ caisse: caisseVentes, pos: { ...posVide, loading: true } }).loading, false);
});
