// node --test : commande par carte (besoinsParCarte.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  besoinsDeCarte, besoinsFondsDeCuisine, cleProduit, contexteCommande, filtrerGroupes,
  formatQuantite, platsParProduit, TITRE_FICHE_CACHEE,
} from './besoinsParCarte.js';

const recettes = [
  { id: 'r-burger', nom: 'Burger (assemblage)', ingredients: [
    { nom: 'Bun brioché', quantite: 1, unite: 'pcs' },
    { nom: 'Pesto basilic', quantite: 15, unite: 'g' },
    { nom: 'Sel fin', quantite: 1, unite: 'g' },
  ] },
  { id: 'r-pesto', nom: 'Pesto basilic', ingredients: [
    { nom: 'Basilic frais', quantite: 500, unite: 'g' },
    { nom: 'Sel fin', quantite: 25, unite: 'g' },
    { nom: 'Eau', quantite: 100, unite: 'ml' },
  ] },
  { id: 'r-croq', nom: "Croquette d'orge", ingredients: [
    { nom: 'Orge perlé', quantite: 2000, unite: 'g' },
    { nom: 'sel fin ', quantite: 6, unite: 'g' },
  ] },
  { id: 'r-cachee', nom: 'Jus secret', masquee: true, ingredients: [{ nom: 'Os de veau', quantite: 3, unite: 'kg' }] },
  { id: 'r-arch', nom: 'Ancienne', statut: 'archivée', ingredients: [{ nom: 'Truffe', quantite: 10, unite: 'g' }] },
];
const plats = [
  { id: 'p-burger', nom: 'Burger poulet', categorie: 'Plats', carteIds: ['c1'], recettes: [
    { recetteId: 'r-pesto', ordre: 2 }, { recetteId: 'r-burger', ordre: 1 },
  ] },
  { id: 'p-caille', nom: 'Caille rôtie', categorie: 'Plats', carteIds: ['c1'], recettes: [
    { recetteId: 'r-croq', ordre: 1 }, { recetteId: 'r-cachee', ordre: 2 }, { recetteId: 'r-arch', ordre: 3 },
  ] },
  { id: 'p-vin', nom: 'Fendant 2024', categorie: 'Vins', carteIds: ['c1'], recettes: [] },
  { id: 'p-off', nom: 'Plat retiré', actif: false, carteIds: ['c1'], recettes: [{ recetteId: 'r-burger' }] },
  { id: 'p-autre', nom: 'Autre carte', carteIds: ['c2'], recettes: [{ recetteId: 'r-burger' }] },
];
const ctx = contexteCommande({ plats, recettes, catalogue: [] });

test('plats de la carte, dans leur ordre, plat inactif et autre carte exclus', () => {
  const { groupes } = besoinsDeCarte({ id: 'c1' }, ctx);
  assert.deepEqual(groupes.map(g => g.titre), ['Burger poulet', 'Caille rôtie', 'Fendant 2024']);
});

test('fiches dans leur ordre ; préparation maison affichée mais hors commande', () => {
  const { groupes } = besoinsDeCarte({ id: 'c1' }, ctx);
  const burger = groupes[0];
  assert.deepEqual(burger.sections.map(s => s.titre), ['Burger (assemblage)', 'Pesto basilic']);
  const pesto = burger.sections[0].lignes.find(l => l.nom === 'Pesto basilic');
  assert.equal(pesto.preparation, true);
  assert.ok(!burger.cles.includes(cleProduit('Pesto basilic')));
  // Eau du robinet : jamais commandée.
  assert.ok(!burger.sections[1].lignes.some(l => l.nom === 'Eau'));
});

test('un produit = une clé, quelle que soit la casse ou l\'unité', () => {
  const { groupes, cles } = besoinsDeCarte({ id: 'c1' }, ctx);
  assert.ok(groupes[0].cles.includes(cleProduit('Sel fin')));
  assert.ok(groupes[1].cles.includes(cleProduit('sel fin ')));
  assert.equal(cles.filter(c => c === cleProduit('Sel fin')).length, 1);
  const ou = platsParProduit(groupes).get(cleProduit('Sel fin'));
  assert.deepEqual(ou, ['Burger poulet', 'Caille rôtie']);
});

test('fiche cachée sans son nom, fiche archivée absente, plat sans fiche commandé tel quel', () => {
  const { groupes } = besoinsDeCarte({ id: 'c1' }, ctx);
  assert.deepEqual(groupes[1].sections.map(s => s.titre), ["Croquette d'orge", TITRE_FICHE_CACHEE]);
  assert.equal(groupes[2].sansFiche, true);
  assert.deepEqual(groupes[2].sections[0].lignes.map(l => l.nom), ['Fendant 2024']);
});

test('fonds de cuisine : sel partagé avec les cartes', () => {
  const { cles } = besoinsFondsDeCuisine();
  assert.ok(cles.includes(cleProduit('Sel fin')));
});

test('loupe : nom de plat garde tout, nom de produit ne garde que ses lignes', () => {
  const { groupes } = besoinsDeCarte({ id: 'c1' }, ctx);
  const q = (t) => (s) => s.toLowerCase().includes(t);
  assert.equal(filtrerGroupes(groupes, q('caille'))[0].sections.length, 2);
  const r = filtrerGroupes(groupes, q('basilic'));
  assert.deepEqual(r.map(g => g.titre), ['Burger poulet']);
  assert.deepEqual(r[0].sections.flatMap(s => s.lignes.map(l => l.nom)), ['Pesto basilic', 'Basilic frais']);
});

test('quantité lisible', () => {
  assert.equal(formatQuantite(1500, 'g'), '1,5 kg');
  assert.equal(formatQuantite(3, 'kg'), '3 kg');
  assert.equal(formatQuantite(250, 'ml'), '250 ml');
  assert.equal(formatQuantite(2, 'pcs'), '2 pcs');
  assert.equal(formatQuantite(0, 'g'), '');
});
