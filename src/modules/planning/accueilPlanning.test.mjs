// node --test : chiffres de l'accueil du Planning (accueilPlanning.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipeParEtat, heuresPrevues } from './accueilPlanning.js';

const midi = 12 * 60;

test("l'équipe du jour par état de pointage, en personnes", () => {
  const c = equipeParEtat([
    { userId: 'a', debut: '08:00', fin: '15:00', pointageDebut: '07:58' },
    { userId: 'b', debut: '07:00', fin: '11:00', pointageDebut: '07:00', pointageFin: '11:02' },
    { userId: 'c', debut: '11:00', fin: '15:00' },
    { userId: 'd', debut: '11:50', fin: '15:00' },
    { userId: 'e', debut: '18:00', fin: '23:00' },
  ], midi);
  assert.deepEqual(c, { total: 5, en_poste: 1, attendu: 2, en_retard: 1, termine: 1 });
});

test('service coupé : une personne, son horaire en cours puis le prochain', () => {
  const coupe = [
    { userId: 'a', debut: '18:00', fin: '23:00' },
    { userId: 'a', debut: '10:00', fin: '14:00', pointageDebut: '10:00', pointageFin: '14:00' },
  ];
  assert.deepEqual(equipeParEtat(coupe, 15 * 60), { total: 1, en_poste: 0, attendu: 1, en_retard: 0, termine: 0 });
  assert.deepEqual(equipeParEtat(coupe, 23 * 60 + 30), { total: 1, en_poste: 0, attendu: 0, en_retard: 1, termine: 0 });
});

test('sans horaire : aucune personne', () => {
  assert.deepEqual(equipeParEtat([], midi), { total: 0, en_poste: 0, attendu: 0, en_retard: 0, termine: 0 });
  assert.deepEqual(equipeParEtat(undefined, midi).total, 0);
});

test('heures prévues : pause déduite, fin après minuit, horaire illisible ignoré', () => {
  assert.equal(heuresPrevues([
    { debut: '10:00', fin: '15:00', pause: 30 },
    { debut: '18:00', fin: '00:30' },
    { debut: '', fin: '12:00' },
  ]), 11);
  assert.equal(heuresPrevues([]), 0);
});
