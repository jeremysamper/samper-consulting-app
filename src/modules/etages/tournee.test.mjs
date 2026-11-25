// node --test : tournée des étages (plan 15, lot 6b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeLisible, etapeSuivante, natureMenage, ordreTournee } from './tournee.js';

const J = '2026-11-22';
const ch = (id, numero, statutMenage) => ({ id, numero, statutMenage });
const sejours = [
  { chambreId: 'a', statut: 'prevu', arrivee: J, depart: '2026-11-24' },
  { chambreId: 'b', statut: 'en_maison', arrivee: '2026-11-20', depart: J },
  { chambreId: 'c', statut: 'en_maison', arrivee: '2026-11-21', depart: '2026-11-25' },
  { chambreId: 'd', statut: 'annule', arrivee: J, depart: '2026-11-23' },
];

test('nature du ménage : arrivée, départ, recouche ; une chambre libre se fait à fond', () => {
  assert.equal(natureMenage(ch('a', '101'), sejours, J), 'arrivee');
  assert.equal(natureMenage(ch('b', '102'), sejours, J), 'depart');
  assert.equal(natureMenage(ch('c', '103'), sejours, J), 'recouche');
  assert.equal(natureMenage(ch('d', '104'), sejours, J), 'depart');
});

test('ordre de la tournée : arrivées, départs, recouches ; propres et hors service exclues', () => {
  const chambres = [ch('c', '103', 'a_faire'), ch('b', '102', 'en_cours'), ch('a', '101', 'a_faire'), ch('e', '105', 'propre'), ch('f', '106', 'hors_service'), ch('d', '104', 'a_faire')];
  assert.deepEqual(ordreTournee(chambres, sejours, J).map((c) => c.numero), ['101', '104', '102', '103']);
});

test('étape suivante en un toucher', () => {
  assert.deepEqual(etapeSuivante('a_faire', false), { statut: 'en_cours', label: 'Commencer' });
  assert.deepEqual(etapeSuivante('en_cours', false), { statut: 'propre', label: 'Terminer' });
  assert.equal(etapeSuivante('propre', false), null);
  assert.deepEqual(etapeSuivante('propre', true), { statut: 'inspectee', label: 'Inspecter' });
  assert.equal(etapeSuivante('inspectee', true), null);
  assert.equal(etapeSuivante('hors_service', true), null);
});

test('durée lisible', () => {
  assert.equal(dureeLisible(45), '45 min');
  assert.equal(dureeLisible(90), '1 h 30');
  assert.equal(dureeLisible(120), '2 h');
});
