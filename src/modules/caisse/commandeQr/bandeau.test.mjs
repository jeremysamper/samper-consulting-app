// node --test : bandeau des commandes QR de la caisse (lot L3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOTIFS_REFUS, ageCommande, lieuCommande } from './bandeau.js';

const T0 = Date.parse('2026-11-22T18:00:00Z');

test('âge : à l\'instant, minutes, heures', () => {
  assert.deepEqual(ageCommande('2026-11-22T17:59:30Z', T0), { unite: 'instant', valeur: 0 });
  assert.deepEqual(ageCommande('2026-11-22T17:56:00Z', T0), { unite: 'min', valeur: 4 });
  assert.deepEqual(ageCommande('2026-11-22T16:30:00Z', T0), { unite: 'h', valeur: 1 });
});

test('âge : une horloge en retard ne rend pas un âge négatif', () => {
  assert.deepEqual(ageCommande('2026-11-22T18:02:00Z', T0), { unite: 'instant', valeur: 0 });
});

test('lieu : au bar, ou la table gardée à la commande', () => {
  assert.deepEqual(lieuCommande({ au_bar: true, table_nom: null }), { auBar: true, table: null });
  assert.deepEqual(lieuCommande({ au_bar: false, table_nom: '12' }), { auBar: false, table: '12' });
  assert.deepEqual(lieuCommande({ au_bar: false, table_nom: null }), { auBar: false, table: '?' });
});

test('motifs : chacun passe la borne du serveur (3 à 200 signes)', () => {
  assert.ok(MOTIFS_REFUS.length >= 3);
  MOTIFS_REFUS.forEach((m) => assert.ok(m.length >= 3 && m.length <= 200, m));
});
