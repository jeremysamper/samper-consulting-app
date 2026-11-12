// node --test : périodes du rapport des réservations (periodesRapport.js),
// dont la comparaison reprise par le module Statistiques.
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { ajouterMois, bornesComparaison, bornesPeriode, finMois, jourIso, listeJours, nbJours } from './periodesRapport.js';

test('période précédente : un mois entier recule sur un mois entier, février compris', () => {
  assert.deepEqual(bornesComparaison({ debut: '2026-03-01', fin: '2026-03-31' }, 'precedente'), { debut: '2026-02-01', fin: '2026-02-28' });
  assert.deepEqual(bornesComparaison({ debut: '2024-03-01', fin: '2024-03-31' }, 'precedente'), { debut: '2024-02-01', fin: '2024-02-29' });
});

test('période précédente : un trimestre et une année reculent du même nombre de mois', () => {
  assert.deepEqual(bornesComparaison({ debut: '2026-10-01', fin: '2026-12-31' }, 'precedente'), { debut: '2026-07-01', fin: '2026-09-30' });
  assert.deepEqual(bornesComparaison({ debut: '2026-01-01', fin: '2026-12-31' }, 'precedente'), { debut: '2025-01-01', fin: '2025-12-31' });
});

test('période précédente : des jours quelconques reculent du même nombre de jours', () => {
  assert.deepEqual(bornesComparaison({ debut: '2026-11-05', fin: '2026-11-11' }, 'precedente'), { debut: '2026-10-29', fin: '2026-11-04' });
  assert.deepEqual(bornesComparaison({ debut: '2026-11-11', fin: '2026-11-11' }, 'precedente'), { debut: '2026-11-10', fin: '2026-11-10' });
});

test('un an plus tôt : des semaines entières reculent de 52 semaines et gardent le lundi', () => {
  const c = bornesComparaison({ debut: '2026-11-09', fin: '2026-11-15' }, 'n1');
  assert.deepEqual(c, { debut: '2025-11-10', fin: '2025-11-16' });
  assert.equal(jourIso(c.debut), 1);
});

test('un an plus tôt : un mois et des jours quelconques reculent de douze mois', () => {
  assert.deepEqual(bornesComparaison({ debut: '2026-02-01', fin: '2026-02-28' }, 'n1'), { debut: '2025-02-01', fin: '2025-02-28' });
  assert.deepEqual(bornesComparaison({ debut: '2024-02-01', fin: '2024-02-29' }, 'n1'), { debut: '2023-02-01', fin: '2023-02-28' });
  assert.deepEqual(bornesComparaison({ debut: '2026-10-13', fin: '2026-11-11' }, 'n1'), { debut: '2025-10-13', fin: '2025-11-11' });
});

test('calendrier : mois, jours et jour de la semaine ISO', () => {
  assert.equal(ajouterMois('2026-03-31', -1), '2026-02-28');
  assert.equal(finMois('2026-02-10'), '2026-02-28');
  assert.equal(nbJours('2026-01-01', '2026-12-31'), 365);
  assert.equal(listeJours('2026-10-24', '2026-10-26').length, 3);
  assert.equal(jourIso('2026-11-11'), 3);
  assert.deepEqual(bornesPeriode('semaine', '2026-11-11'), { debut: '2026-11-09', fin: '2026-11-15' });
});
