// node --test : réglages des modules de la branche Hôtel (plan 15, lot 6b).
// Une ligne absente vaut le comportement d'avant ; une valeur mal formée est
// lue comme absente.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CATEGORIES_DEMANDE_DEFAUT, MODULES_REGLES, TEMPS_MENAGE_DEFAUT, lingeDepart, lireReglagesModule, tempsMenage,
} from './reglagesModules.js';

test('les trois modules de l\'hôtel sont réglables', () => {
  ['etages', 'demandes', 'repas'].forEach((m) => assert.ok(MODULES_REGLES.includes(m), m));
});

test('sans ligne : les valeurs d\'avant le réglage', () => {
  assert.deepEqual(lireReglagesModule('etages', null), { temps_defaut: TEMPS_MENAGE_DEFAUT, types: [] });
  assert.deepEqual(lireReglagesModule('demandes', null), { categories: CATEGORIES_DEMANDE_DEFAUT, categoriesReglees: false });
  const r = lireReglagesModule('repas', {});
  assert.deepEqual(r.horaires, { petit_dejeuner: null, dejeuner: null, diner: null });
  assert.deepEqual(r.room_service, { heures: null, frais: 0 });
  assert.deepEqual(r.carte, []);
});

test('étages : temps et linge par catégorie, valeurs fausses retirées', () => {
  const e = lireReglagesModule('etages', {
    temps_defaut: { depart: 40, recouche: 2 },
    types: [
      { categorie: 'Double', depart: 35, linge: { draps: 2, serviettes: 4, inconnu: 3, peignoirs: 0 } },
      { categorie: ' double ', depart: 50 },
      { categorie: '', depart: 10 },
    ],
  });
  assert.deepEqual(e.temps_defaut, { depart: 40, recouche: 15 });
  assert.equal(e.types.length, 1);
  assert.deepEqual(e.types[0], { categorie: 'Double', depart: 35, recouche: 15, linge: { draps: 2, serviettes: 4 } });
  assert.equal(tempsMenage(e, 'double', 'depart'), 35);
  assert.equal(tempsMenage(e, 'Suite', 'recouche'), 15);
  assert.equal(tempsMenage(e, 'Suite', 'depart'), 40);
  assert.deepEqual(lingeDepart(e, 'Double'), { draps: 2, serviettes: 4 });
  assert.deepEqual(lingeDepart(e, 'Simple'), {});
});

test('demandes : une liste réglée, même vide, remplace celle d\'origine', () => {
  const d = lireReglagesModule('demandes', { categories: [
    { libelle: 'Peignoir', pole: 'etages', priorite: 'haute', delai_minutes: 20 },
    { libelle: 'peignoir', pole: 'etages' },
    { libelle: 'Inconnu', pole: 'jardin' },
    { libelle: 'Réveil', pole: 'reception', priorite: 'folle', delai_minutes: 1 },
  ] });
  assert.equal(d.categoriesReglees, true);
  assert.deepEqual(d.categories, [
    { libelle: 'Peignoir', pole: 'etages', priorite: 'haute', delai_minutes: 20 },
    { libelle: 'Réveil', pole: 'reception', priorite: 'normale', delai_minutes: null },
  ]);
  assert.deepEqual(lireReglagesModule('demandes', { categories: [] }).categories, []);
});

test('repas : horaires, room service et carte', () => {
  const r = lireReglagesModule('repas', {
    horaires: { petit_dejeuner: { debut: '07:00', fin: '10:30' }, diner: { debut: '21:00', fin: '19:00' } },
    room_service: { heures: { debut: '11:00', fin: '22:00' }, frais: 5 },
    carte: [{ libelle: 'Club sandwich', prix: 24 }, { libelle: 'club sandwich', prix: 20 }, { libelle: 'Eau', prix: -1 }],
  });
  assert.deepEqual(r.horaires.petit_dejeuner, { debut: '07:00', fin: '10:30' });
  assert.equal(r.horaires.diner, null);
  assert.deepEqual(r.room_service, { heures: { debut: '11:00', fin: '22:00' }, frais: 5 });
  assert.deepEqual(r.carte, [{ libelle: 'Club sandwich', prix: 24 }]);
});
