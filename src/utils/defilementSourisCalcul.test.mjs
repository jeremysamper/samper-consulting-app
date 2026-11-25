import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerCible, estBande } from './defilementSourisCalcul.js';

const bande = { overflowX: 'auto', overflowY: 'hidden', scrollWidth: 1800, clientWidth: 1100, scrollHeight: 38, clientHeight: 38, hauteur: 38 };

test('une rangée d\'onglets qui déborde est une bande', () => {
  assert.equal(estBande(bande), true);
});

test('pas de bande : rien ne déborde, overflow visible, trop haute, ou défilement vertical', () => {
  assert.equal(estBande({ ...bande, scrollWidth: 1100 }), false);
  assert.equal(estBande({ ...bande, overflowX: 'visible' }), false);
  assert.equal(estBande({ ...bande, hauteur: 400 }), false);
  assert.equal(estBande({ ...bande, overflowY: 'auto', scrollHeight: 900, clientHeight: 400 }), false);
});

test('la molette avance la bande, en pixels comme en lignes', () => {
  assert.equal(calculerCible({ deltaY: 100, position: 0, largeurVisible: 1100, largeurTotale: 1800 }), 100);
  assert.equal(calculerCible({ deltaY: 3, deltaMode: 1, position: 0, largeurVisible: 1100, largeurTotale: 1800 }), 48);
  assert.equal(calculerCible({ deltaY: -100, position: 300, largeurVisible: 1100, largeurTotale: 1800 }), 200);
});

test('les crans rapprochés s\'additionnent à la cible en cours', () => {
  assert.equal(calculerCible({ deltaY: 100, position: 40, cibleEnCours: 200, largeurVisible: 1100, largeurTotale: 1800 }), 300);
});

test('la bande ne dépasse pas ses bords', () => {
  assert.equal(calculerCible({ deltaY: 500, position: 600, largeurVisible: 1100, largeurTotale: 1800 }), 700);
  assert.equal(calculerCible({ deltaY: -500, position: 100, largeurVisible: 1100, largeurTotale: 1800 }), 0);
});

test('au bout de la bande, la page reprend la main', () => {
  assert.equal(calculerCible({ deltaY: 100, position: 700, largeurVisible: 1100, largeurTotale: 1800 }), null);
  assert.equal(calculerCible({ deltaY: -100, position: 0, largeurVisible: 1100, largeurTotale: 1800 }), null);
  assert.equal(calculerCible({ deltaY: 0, position: 300, largeurVisible: 1100, largeurTotale: 1800 }), null);
});
