// node --test : picto du visuel de remplacement (visuelFiche.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Salad, UtensilsCrossed, CookingPot, Milk, Soup, Croissant, CakeSlice } from 'lucide-react';
import { iconeCategorie } from './visuelFiche.js';

test('catégories courantes, pluriel et accents compris', () => {
  assert.equal(iconeCategorie('Entrées'), Salad);
  assert.equal(iconeCategorie('Entrées froides'), Salad);
  assert.equal(iconeCategorie('Plats'), UtensilsCrossed);
  assert.equal(iconeCategorie('Pâtes & Risottos'), CookingPot);
  assert.equal(iconeCategorie('Fonds & sauces'), Soup);
  assert.equal(iconeCategorie('Petit-déjeuner'), Croissant);
  assert.equal(iconeCategorie('Desserts'), CakeSlice);
});

test('mot entier : « Fondues » n\'est pas un fond, un plateau n\'est pas un plat', () => {
  assert.equal(iconeCategorie('Fondues'), CookingPot);
  assert.equal(iconeCategorie('Plateau de fromages'), Milk);
  assert.equal(iconeCategorie('Plateaux'), null);
  assert.equal(iconeCategorie('Tartelettes'), null);
});

test('sans catégorie : aucun picto (l\'initiale prend le relais)', () => {
  assert.equal(iconeCategorie(''), null);
  assert.equal(iconeCategorie(null), null);
});
