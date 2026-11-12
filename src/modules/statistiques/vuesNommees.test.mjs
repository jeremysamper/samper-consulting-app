// node --test : vues enregistrées et nommées du module Statistiques (Q4).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_VUES, enregistrerVueNommee, nettoyerVue, renommerVueNommee, retirerVueNommee, vuesNommeesLues,
} from './vueStatistiques.js';

const vue = (mesures) => ({ periode: { id: 'mois' }, pas: 'jour', comparaison: '', graphiques: [{ mesures, ventilation: '', type: '', choix: {} }] });

test('enregistrer : une vue neuve en tête, un nom déjà pris remplace sa vue, vingt au plus', () => {
  let r = enregistrerVueNommee([], { id: 'v1', nom: '  Ventes   du mois ', vue: vue(['a']) });
  assert.equal(r.resultat, 'ajoutee');
  assert.equal(r.liste[0].nom, 'Ventes du mois');
  r = enregistrerVueNommee(r.liste, { id: 'v2', nom: 'Pertes', vue: vue(['b']) });
  assert.deepEqual(r.liste.map((v) => v.id), ['v2', 'v1']);
  r = enregistrerVueNommee(r.liste, { id: 'v3', nom: 'ventes DU mois', vue: vue(['c']) });
  assert.equal(r.resultat, 'remplacee');
  assert.deepEqual(r.liste.map((v) => v.id), ['v2', 'v1']);
  assert.deepEqual(r.liste[1].vue.graphiques[0].mesures, ['c']);
  assert.equal(enregistrerVueNommee(r.liste, { id: 'v4', nom: '   ', vue: vue([]) }).resultat, 'sans_nom');
  let pleine = [];
  for (let i = 0; i < MAX_VUES; i += 1) pleine = enregistrerVueNommee(pleine, { id: `p${i}`, nom: `Vue ${i}`, vue: vue([]) }).liste;
  assert.equal(enregistrerVueNommee(pleine, { id: 'x', nom: 'De trop', vue: vue([]) }).resultat, 'pleine');
});

test('renommer et retirer : nom vide ou pris refusé, vue absente signalée', () => {
  const liste = [{ id: 'v1', nom: 'A', vue: vue([]) }, { id: 'v2', nom: 'B', vue: vue([]) }];
  assert.equal(renommerVueNommee(liste, 'v1', 'b').resultat, 'pris');
  assert.equal(renommerVueNommee(liste, 'v1', '').resultat, 'sans_nom');
  assert.equal(renommerVueNommee(liste, 'zz', 'C').resultat, 'absente');
  assert.equal(renommerVueNommee(liste, 'v1', 'C').liste[0].nom, 'C');
  assert.deepEqual(retirerVueNommee(liste, 'v1').map((v) => v.id), ['v2']);
});

test('lecture : une forme fausse est écartée ; à l\'ouverture, une mesure qu\'on ne voit plus disparaît', () => {
  assert.deepEqual(vuesNommeesLues(null), []);
  assert.deepEqual(vuesNommeesLues([{ id: 1, nom: 'x', vue: {} }, { id: 'ok', nom: 'Ok', vue: vue(['a']) }, 'z']).map((v) => v.id), ['ok']);
  const visibles = [{ id: 'a', unite: 'chf', ventilations: [] }];
  const ouverte = nettoyerVue(vue(['a', 'cachee']), visibles, '2026-11-12');
  assert.deepEqual(ouverte.graphiques[0].mesures, ['a']);
});
