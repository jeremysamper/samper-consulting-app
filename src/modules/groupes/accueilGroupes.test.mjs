// node --test : repères de l'accueil des Groupes (accueilGroupes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reperesGroupes } from './accueilGroupes.js';

test('à venir, à lire, à préparer : annulés et passés exclus', () => {
  const r = reperesGroupes([
    { dateEvenement: '2026-11-10', nbPax: 20, statut: 'pret' },
    { dateEvenement: '2026-11-11', nbPax: 12, statut: 'a_lire' },
    { dateEvenement: '2026-11-13', nbPax: 82, statut: 'lu' },
    { dateEvenement: '2026-11-14', nbPax: '40' },
    { dateEvenement: '2026-11-21', nbPax: 35, statut: 'pret' },
    { dateEvenement: '2026-11-22', nbPax: 50, statut: 'a_lire', annule: true },
  ], '2026-11-11');
  assert.deepEqual(r, { aVenir: 4, pax: 169, aLire: 2, aPreparer: 1 });
});

test('sans groupe : des zéros', () => {
  assert.deepEqual(reperesGroupes(undefined, '2026-11-11'), { aVenir: 0, pax: 0, aLire: 0, aPreparer: 0 });
});
