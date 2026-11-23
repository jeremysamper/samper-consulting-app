import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILTRES_VIDES, TOUS, champsChanges, filtrerJournal, filtresPoses, lireFiltres, listeEnMots, modulesDuJournal,
  motAction, personnesDuJournal, phraseChangement, regrouperJournal,
} from './journalLogique.js';
import { lireReglagesModule } from '../../utils/reglagesModules.js';

const ligne = (id, heure, x = {}) => ({
  id, jour: '2026-11-19', heure, acteur_id: 'u1', acteur_nom: 'Claire Martin', acteur_role: 'patron',
  module: 'inventaires', operation: 'UPDATE', libelle: 'Général', colonnes_modifiees: ['lignes', 'updated_at'], ...x,
});

test('les lignes identiques qui se suivent font une seule entrée', () => {
  const lignes = [
    ligne('7', '08:40'), ligne('6', '08:35'), ligne('5', '08:30'), ligne('4', '08:25'),
    ligne('3', '08:20'), ligne('2', '08:15'), ligne('1', '08:12'),
  ];
  const jours = regrouperJournal(lignes);
  assert.equal(jours.length, 1);
  assert.equal(jours[0].entrees.length, 1);
  const e = jours[0].entrees[0];
  assert.equal(e.n, 7);
  assert.equal(e.heureDebut, '08:12');
  assert.equal(e.heureFin, '08:40');
  assert.equal(`${e.n} ${motAction('UPDATE', e.n)}`, '7 modifications');
});

test("une autre personne, un autre élément ou un autre jour coupe le groupe", () => {
  const jours = regrouperJournal([
    ligne('4', '09:00'),
    ligne('3', '08:50', { acteur_id: 'u2', acteur_nom: 'Paul' }),
    ligne('2', '08:40', { libelle: 'Cave' }),
    ligne('1', '18:00', { jour: '2026-11-18' }),
  ]);
  assert.equal(jours.length, 2);
  assert.equal(jours[0].entrees.length, 3);
  assert.ok(jours[0].entrees.every((e) => e.n === 1));
});

test('vue ligne par ligne : aucun regroupement', () => {
  const jours = regrouperJournal([ligne('2', '08:40'), ligne('1', '08:30')], { regrouper: false });
  assert.equal(jours[0].entrees.length, 2);
});

test('les champs changés se disent en mots, sans les colonnes de service', () => {
  assert.deepEqual(champsChanges(ligne('1', '08:00')), ["lignes de l'inventaire"]);
  assert.equal(phraseChangement('UPDATE', [ligne('1', '08:00', { colonnes_modifiees: ['nom', 'prix_vente'] })]), 'nom et prix de vente changés');
  assert.equal(phraseChangement('INSERT', [ligne('1', '08:00')]), '');
  assert.equal(listeEnMots(['a', 'b', 'c']), 'a, b et c');
  assert.equal(motAction('DELETE', 1), 'Suppression');
});

test('filtres : personne, module, action et recherche par mots', () => {
  const lignes = [
    ligne('1', '08:00'),
    ligne('2', '08:10', { acteur_id: 'u2', acteur_nom: 'Paul Roux', module: 'recettes', operation: 'INSERT', libelle: 'Tarte aux pommes', colonnes_modifiees: [] }),
  ];
  assert.equal(filtrerJournal(lignes, { personne: 'u2' }).length, 1);
  assert.equal(filtrerJournal(lignes, { module: 'inventaires' })[0].id, '1');
  assert.equal(filtrerJournal(lignes, { action: 'INSERT' })[0].id, '2');
  assert.equal(filtrerJournal(lignes, { recherche: 'tarte pommes' })[0].id, '2');
  assert.equal(filtrerJournal(lignes, { recherche: 'paul' }).length, 1);
  assert.equal(filtrerJournal(lignes, FILTRES_VIDES).length, 2);
  assert.deepEqual(personnesDuJournal(lignes).map((p) => p.label), ['Claire Martin', 'Paul Roux']);
  assert.deepEqual(modulesDuJournal(lignes).map((m) => m.id), ['recettes', 'inventaires']);
});

test('filtre gardé : lecture prudente', () => {
  assert.deepEqual(lireFiltres(null), FILTRES_VIDES);
  assert.deepEqual(lireFiltres({ personne: 'u1', module: 'pertes', action: 'XXX' }), { personne: 'u1', module: 'pertes', action: TOUS });
  assert.equal(filtresPoses(FILTRES_VIDES), false);
  assert.equal(filtresPoses({ ...FILTRES_VIDES, action: 'DELETE' }), true);
});

test('réglage de la maison : vue et export, défauts', () => {
  assert.deepEqual(lireReglagesModule('journal', null), { vue: 'regroupee', export: 'csv' });
  assert.deepEqual(lireReglagesModule('journal', { vue: 'detail', export: 'xlsx' }), { vue: 'detail', export: 'xlsx' });
  assert.deepEqual(lireReglagesModule('journal', { vue: 'autre', export: 1 }), { vue: 'regroupee', export: 'csv' });
  assert.deepEqual(lireReglagesModule('statistiques', { vue_defaut: 'meilleur_jour' }), { vue_defaut: 'meilleur_jour' });
  assert.deepEqual(lireReglagesModule('statistiques', { vue_defaut: 'Pas bon !' }), { vue_defaut: null });
});
