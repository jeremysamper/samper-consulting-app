// node --test : chambre proposée au check-in (plan 15, lot 6b).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chambreLibre, chambreProposee } from './checkin.js';

const chambres = [
  { id: 'c101', numero: '101', categorie: 'Simple', capacite: 1, statutMenage: 'a_faire', actif: true },
  { id: 'c102', numero: '102', categorie: 'Simple', capacite: 1, statutMenage: 'inspectee', actif: true },
  { id: 'c103', numero: '103', categorie: 'Double', capacite: 2, statutMenage: 'inspectee', actif: true },
  { id: 'c104', numero: '104', categorie: 'Simple', capacite: 1, statutMenage: 'hors_service', actif: true },
  { id: 'c105', numero: '105', categorie: 'Simple', capacite: 1, statutMenage: 'propre', actif: false },
];
const sejour = { id: 's1', statut: 'prevu', arrivee: '2026-11-22', depart: '2026-11-23', nbAdultes: 1, nbEnfants: 0, chambreId: null };

test('la catégorie du tarif d\'abord, une chambre prête avant une chambre à faire', () => {
  assert.equal(chambreProposee(chambres, [], sejour, { categorie: 'Simple' }).numero, '102');
});

test('une chambre prise sur une nuit du séjour, hors service ou inactive ne se propose pas', () => {
  const pris = [{ id: 's2', statut: 'en_maison', chambreId: 'c102', arrivee: '2026-11-21', depart: '2026-11-23' }];
  assert.equal(chambreLibre(chambres[1], pris, sejour), false);
  assert.equal(chambreProposee(chambres, pris, sejour, { categorie: 'Simple' }).numero, '101');
  // Un départ le jour de l'arrivée libère la chambre pour la nuit.
  const part = [{ id: 's3', statut: 'en_maison', chambreId: 'c102', arrivee: '2026-11-20', depart: '2026-11-22' }];
  assert.equal(chambreProposee(chambres, part, sejour, { categorie: 'Simple' }).numero, '102');
});

test('sans tarif : la chambre prête et assez grande', () => {
  const famille = { ...sejour, nbAdultes: 2 };
  assert.equal(chambreProposee(chambres, [], famille, null).numero, '103');
  assert.equal(chambreProposee([], [], sejour, null), null);
});
