import test from 'node:test';
import assert from 'node:assert/strict';
import { nomLisible } from './nomLisible.js';

test('un nom tout en capitales passe en minuscules, accents gardés', () => {
  assert.equal(nomLisible('BURGER DE BŒUF SUISSE, FRITES'), 'Burger de bœuf suisse, frites');
  assert.equal(nomLisible('SUPRÊME DE VOLAILLE, RISOTTO'), 'Suprême de volaille, risotto');
  assert.equal(nomLisible('RÖSTI, ŒUF AU PLAT ET LARD'), 'Rösti, œuf au plat et lard');
});

test('un nom qui a déjà des minuscules reste tel quel', () => {
  assert.equal(nomLisible('Filet de féra du Léman'), 'Filet de féra du Léman');
  assert.equal(nomLisible('IPA Brasserie du Mont'), 'IPA Brasserie du Mont');
});

test('chiffres en tête, vide et valeur absente', () => {
  assert.equal(nomLisible('2 CAFÉS'), '2 Cafés');
  assert.equal(nomLisible(''), '');
  assert.equal(nomLisible(null), '');
  assert.equal(nomLisible('123'), '123');
});
