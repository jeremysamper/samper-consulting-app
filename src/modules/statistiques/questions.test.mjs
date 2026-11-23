// Plan 15, lot 5 : réponses toutes faites, vue d'office de la maison.
import test from 'node:test';
import assert from 'node:assert/strict';
import { vueDepuisLien } from './vueStatistiques.js';
import { mesuresVisibles } from './catalogueMesures.js';
import { OPTIONS_VUE_MAISON, QUESTIONS, demandeQuestion } from './questionsStatistiques.js';

const AUJ = '2026-11-22';
const visibles = (direction) => mesuresVisibles({ familles: ['comptabilite', 'reservations'], niveauCaisse: null, direction, droits: { factures_achat: true } });

test('chaque question ouvre une vue pour la direction', () => {
  for (const q of QUESTIONS) {
    const v = vueDepuisLien(demandeQuestion(q.id), visibles(true), AUJ);
    assert.ok(v, q.id);
    assert.ok(v.graphiques.length >= 1, q.id);
  }
});

test('ce mois contre le mois dernier : comparaison aux mêmes jours', () => {
  const v = vueDepuisLien(demandeQuestion('mois_contre_mois'), visibles(true), AUJ);
  assert.equal(v.periode.id, 'mois');
  assert.equal(v.comparaison, 'precedente');
});

test('le coût du personnel tombe hors de la direction', () => {
  assert.equal(vueDepuisLien(demandeQuestion('cout_personnel'), visibles(false), AUJ), null);
  assert.ok(vueDepuisLien(demandeQuestion('meilleur_jour'), visibles(false), AUJ));
});

test("options de la vue d'office : la vue de l'app puis les questions", () => {
  assert.equal(OPTIONS_VUE_MAISON[0].id, 'app');
  assert.equal(OPTIONS_VUE_MAISON.length, QUESTIONS.length + 1);
  assert.equal(demandeQuestion('inconnue'), null);
});
