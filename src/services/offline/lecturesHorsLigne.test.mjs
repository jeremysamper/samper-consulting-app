// Lectures servies par le cache (lot 24) : tests purs, node --test.
import test from 'node:test';
import assert from 'node:assert/strict';

// Stockage de l'appareil simulé : storage.js lit globalThis.localStorage.
const memoire = new Map();
globalThis.localStorage = {
  getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
  setItem: (k, v) => { memoire.set(k, String(v)); },
  removeItem: (k) => { memoire.delete(k); },
};

const {
  CLE_LECTURES_HORS_LIGNE, estVue, libelleDerniereLecture, lireDerniereLecture, marquerVue, noterLecture,
  oublierLectures,
} = await import('./lecturesHorsLigne.js');

// 26.11.2026 14:32 à Zurich (UTC+1 en novembre).
const MAINTENANT = Date.UTC(2026, 10, 26, 13, 32);

test('même jour à Zurich : la phrase « à » et l\'heure seule', () => {
  assert.deepEqual(libelleDerniereLecture(Date.UTC(2026, 10, 26, 8, 5), MAINTENANT), {
    texte: 'Lu hors ligne, dernière lecture à', valeur: '09:05',
  });
});

test('autre jour : la date courte et l\'heure', () => {
  assert.deepEqual(libelleDerniereLecture(Date.UTC(2026, 10, 24, 17, 40), MAINTENANT), {
    texte: 'Lu hors ligne, dernière lecture le', valeur: '24.11, 18:40',
  });
});

test('minuit à Zurich : la veille en UTC compte pour le jour même', () => {
  // 26.11 00:20 à Zurich = 25.11 23:20 UTC.
  assert.equal(libelleDerniereLecture(Date.UTC(2026, 10, 25, 23, 20), MAINTENANT).valeur, '00:20');
});

test('autre année : la date entière', () => {
  assert.equal(libelleDerniereLecture(Date.UTC(2025, 11, 31, 10, 0), MAINTENANT).valeur, '31.12.2025, 11:00');
});

test('heure inconnue : la phrase courte, sans valeur', () => {
  assert.deepEqual(libelleDerniereLecture(null, MAINTENANT), { texte: 'Lu hors ligne.', valeur: null });
  assert.deepEqual(libelleDerniereLecture(undefined, MAINTENANT), { texte: 'Lu hors ligne.', valeur: null });
});

test('heure de lecture gardée par établissement et par source', () => {
  memoire.clear();
  noterLecture('etab-1', 'groupe_evenements', 1000);
  noterLecture('etab-1', 'groupe_menus', 2000);
  noterLecture('etab-2', 'groupe_evenements', 3000);
  assert.equal(lireDerniereLecture('etab-1', 'groupe_evenements'), 1000);
  assert.equal(lireDerniereLecture('etab-1', 'groupe_menus'), 2000);
  assert.equal(lireDerniereLecture('etab-2', 'groupe_evenements'), 3000);
  assert.equal(lireDerniereLecture('etab-2', 'groupe_menus'), null);
  assert.equal(lireDerniereLecture(null, 'groupe_menus'), null);
});

test('fiches ouvertes : par établissement, sans doublon, bornées aux plus récentes', () => {
  memoire.clear();
  marquerVue('etab-1', 'groupe_evenements', 'g1');
  marquerVue('etab-1', 'groupe_evenements', 'g1');
  assert.equal(estVue('etab-1', 'groupe_evenements', 'g1'), true);
  assert.equal(estVue('etab-2', 'groupe_evenements', 'g1'), false);
  assert.equal(estVue('etab-1', 'groupe_evenements', 'g2'), false);
  const brut = JSON.parse(memoire.get(CLE_LECTURES_HORS_LIGNE));
  assert.deepEqual(brut.vues['etab-1'].groupe_evenements, ['g1']);
  for (let i = 0; i < 310; i += 1) marquerVue('etab-1', 'groupe_evenements', `x${i}`);
  assert.equal(estVue('etab-1', 'groupe_evenements', 'g1'), false);
  assert.equal(estVue('etab-1', 'groupe_evenements', 'x309'), true);
  assert.equal(JSON.parse(memoire.get(CLE_LECTURES_HORS_LIGNE)).vues['etab-1'].groupe_evenements.length, 300);
});

test('oublier : heures et fiches partent ensemble', () => {
  memoire.clear();
  noterLecture('etab-1', 'groupe_evenements', 1000);
  marquerVue('etab-1', 'groupe_evenements', 'g1');
  oublierLectures();
  assert.equal(lireDerniereLecture('etab-1', 'groupe_evenements'), null);
  assert.equal(estVue('etab-1', 'groupe_evenements', 'g1'), false);
});

test('stockage illisible : rien n\'est inventé', () => {
  memoire.clear();
  memoire.set(CLE_LECTURES_HORS_LIGNE, '{pas du json');
  assert.equal(lireDerniereLecture('etab-1', 'groupe_evenements'), null);
  assert.equal(estVue('etab-1', 'groupe_evenements', 'g1'), false);
  noterLecture('etab-1', 'groupe_evenements', 5);
  assert.equal(lireDerniereLecture('etab-1', 'groupe_evenements'), 5);
});
