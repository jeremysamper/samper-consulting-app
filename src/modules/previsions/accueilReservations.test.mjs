// node --test : chiffres de l'accueil des Réservations (accueilReservations.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiffresDuJour } from './accueilReservations.js';

test('par service : no-shows exclus, brunch avec le midi', () => {
  const { jour, services } = chiffresDuJour([
    { service: 'midi', nb_couverts: 4, statut: 'arrive' },
    { service: 'brunch', nb_couverts: 2, statut: 'parti' },
    { service: 'midi', nb_couverts: 3, statut: 'no_show' },
    { service: 'soir', nb_couverts: 6, statut: 'confirme', est_groupe: true },
    { service: 'soir', nb_couverts: 2, statut: 'demande' },
  ]);
  assert.deepEqual(services.midi, { couverts: 6, arrives: 6, attables: 4, reservations: 2 });
  assert.deepEqual(services.soir, { couverts: 8, arrives: 0, attables: 0, reservations: 2 });
  assert.deepEqual(jour, { couverts: 14, arrives: 6, attables: 4, reservations: 4, groupes: 1 });
});

test('le total du jour compte tous les couverts sauf les no-shows', () => {
  const resas = [
    { service: 'midi', nb_couverts: 5, statut: 'confirme' },
    { service: 'soir', nb_couverts: 2, statut: 'no_show' },
    { service: 'soir', nb_couverts: null, statut: 'confirme' },
  ];
  const tuile = resas.filter((r) => r.statut !== 'no_show').reduce((s, r) => s + (r.nb_couverts || 0), 0);
  assert.equal(chiffresDuJour(resas).jour.couverts, tuile);
});

test('sans réservation : des zéros', () => {
  const { jour, services } = chiffresDuJour(null);
  assert.equal(jour.couverts, 0);
  assert.equal(services.midi.reservations + services.soir.reservations, 0);
});
