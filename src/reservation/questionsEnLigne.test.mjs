// node --test : questions à choix de la réservation d'une table en ligne
// (lot 18). Nettoyage des réglages, message envoyé, réponses manquantes,
// miroir du déclencheur et accord avec la migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  LIMITES, composerMessage, erreurQuestion, etiquettesDepuisNotes, lignesReponses, nettoyerQuestions, questionsSansReponse,
} from './questionsEnLigne.js';

const Q = (libelle, choix, extra = {}) => ({ id: 'formule', libelle, choix, obligatoire: false, ...extra });
const FORMULE = { id: 'formule', libelle: 'Formule', choix: ['Menu du marché', 'À la carte'], obligatoire: true };
const SIEGE = { id: 'siege', libelle: 'Siège', choix: ['Terrasse', 'Salle'], obligatoire: false };

test('nettoyerQuestions : une valeur qui n\'est pas un tableau rend []', () => {
  for (const v of [null, undefined, {}, 'Formule', 3]) assert.deepEqual(nettoyerQuestions(v), []);
});

test('nettoyerQuestions : la troisième question et le septième choix sont coupés', () => {
  const sept = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const r = nettoyerQuestions([Q('Un', sept, { id: 'un' }), Q('Deux', ['x', 'y'], { id: 'deux' }), Q('Trois', ['x', 'y'], { id: 'trois' })]);
  assert.equal(r.length, LIMITES.questions);
  assert.deepEqual(r[0].choix, sept.slice(0, 6));
  assert.deepEqual(r.map((q) => q.libelle), ['Un', 'Deux']);
});

test('nettoyerQuestions : libellé « allergies », libellé avec « : » et question à un choix retirés', () => {
  assert.deepEqual(nettoyerQuestions([Q('allergies', ['a', 'b'])]), []);
  assert.deepEqual(nettoyerQuestions([Q(' Allergies ', ['a', 'b'])]), []);
  assert.deepEqual(nettoyerQuestions([Q('Formule : midi', ['a', 'b'])]), []);
  assert.deepEqual(nettoyerQuestions([Q('Formule', ['Menu'])]), []);
  assert.deepEqual(nettoyerQuestions([Q('Formule\nmidi', ['a', 'b'])]), []);
  assert.deepEqual(nettoyerQuestions([Q('x'.repeat(41), ['a', 'b'])]), []);
});

test('nettoyerQuestions : choix en double réduit, choix vides ou hors forme retirés', () => {
  const [q] = nettoyerQuestions([Q('Formule', ['Menu', 'Menu', ' menu ', '', 'a : b', 'Carte', 'x'.repeat(41)])]);
  assert.deepEqual(q.choix, ['Menu', 'Carte']);
});

test('nettoyerQuestions : ids uniques, un id absent ou hors forme devient q1 ou q2', () => {
  const memes = nettoyerQuestions([Q('Un', ['a', 'b'], { id: 'pareil' }), Q('Deux', ['a', 'b'], { id: 'pareil' })]);
  assert.notEqual(memes[0].id, memes[1].id);
  assert.equal(memes[0].id, 'pareil');
  const hors = nettoyerQuestions([Q('Un', ['a', 'b'], { id: undefined }), Q('Deux', ['a', 'b'], { id: 'Pas Bon!' })]);
  assert.deepEqual(hors.map((q) => q.id), ['q1', 'q2']);
  const croises = nettoyerQuestions([Q('Un', ['a', 'b'], { id: 'q2' }), Q('Deux', ['a', 'b'], { id: 'x'.repeat(30) })]);
  assert.equal(new Set(croises.map((q) => q.id)).size, 2);
});

test('nettoyerQuestions : seules les clés attendues sortent', () => {
  const [q] = nettoyerQuestions([{ ...FORMULE, secret: 'non', prix: 12 }]);
  assert.deepEqual(Object.keys(q).sort(), ['choix', 'id', 'libelle', 'obligatoire']);
  assert.equal(nettoyerQuestions([{ ...FORMULE, obligatoire: 'oui' }])[0].obligatoire, false);
});

test('erreurQuestion : phrases des réglages', () => {
  assert.equal(erreurQuestion(FORMULE), null);
  assert.equal(erreurQuestion({ ...FORMULE, choix: ['Menu du marché', ''] }), 'Ajoutez au moins deux choix à cette question.');
  assert.equal(erreurQuestion({ ...FORMULE, choix: ['Menu', 'menu'] }), 'Deux choix portent le même nom.');
  assert.equal(erreurQuestion({ ...FORMULE, libelle: 'Allergies' }), 'Ce nom de question est réservé : choisissez-en un autre.');
  assert.equal(erreurQuestion({ ...FORMULE, libelle: ' ' }), 'Donnez un nom à cette question.');
});

test('composerMessage : allergènes, réponses, ligne vide, mot', () => {
  const m = composerMessage({ ligneAllergies: 'Allergies : Gluten', lignes: ['Formule : À la carte', 'Siège : Terrasse'], mot: ' Anniversaire ' });
  const lignes = m.split('\n');
  assert.ok(lignes[0].startsWith('Allergies : '));
  assert.deepEqual(lignes, ['Allergies : Gluten', 'Formule : À la carte', 'Siège : Terrasse', '', 'Anniversaire']);
  assert.equal(composerMessage({ lignes: ['Formule : À la carte'], mot: 'Bonjour' }).split('\n')[0], 'Formule : À la carte');
  assert.equal(composerMessage({ mot: '  Bonjour  ' }), 'Bonjour');
  assert.equal(composerMessage({ ligneAllergies: 'Allergies : Gluten', mot: 'Merci' }), 'Allergies : Gluten\n\nMerci');
  assert.equal(composerMessage({ lignes: ['Formule : À la carte'] }), 'Formule : À la carte');
});

test('lignesReponses : une réponse hors des choix ne produit aucune ligne', () => {
  assert.deepEqual(lignesReponses([FORMULE, SIEGE], { formule: 'Buffet', siege: 'Salle' }), ['Siège : Salle']);
  assert.deepEqual(lignesReponses([SIEGE, FORMULE], { formule: 'À la carte', siege: 'Salle' }), ['Siège : Salle', 'Formule : À la carte']);
});

test('questionsSansReponse : obligatoire sans réponse rendue, facultative jamais', () => {
  assert.deepEqual(questionsSansReponse([FORMULE, SIEGE], {}).map((q) => q.id), ['formule']);
  assert.deepEqual(questionsSansReponse([FORMULE, SIEGE], { formule: 'Hors liste' }).map((q) => q.id), ['formule']);
  assert.deepEqual(questionsSansReponse([FORMULE, SIEGE], { formule: 'À la carte' }), []);
});

test('etiquettesDepuisNotes : miroir du déclencheur', () => {
  const qs = [FORMULE, SIEGE];
  assert.deepEqual(etiquettesDepuisNotes('Allergies : Gluten\nFormule : Menu du marché\n\nmot', qs),
    [{ type_tag: 'autre', valeur: 'Formule : Menu du marché', libre: true }]);
  assert.deepEqual(etiquettesDepuisNotes('Formule : Buffet', qs), []);
  assert.deepEqual(etiquettesDepuisNotes('Bonjour\n\nFormule : À la carte', qs), []);
  assert.deepEqual(etiquettesDepuisNotes('formule : menu du marché', qs), []);
  assert.equal(etiquettesDepuisNotes('Formule : À la carte\r\nFormule : Menu du marché', qs).length, 1);
  assert.equal(etiquettesDepuisNotes('Formule : À la carte\nSiège : Salle', qs).length, 2);
  assert.deepEqual(etiquettesDepuisNotes(null, qs), []);
});

test('accord avec la migration : limite, type et déclencheur', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261125_resa_questions_en_ligne.sql', import.meta.url)), 'utf8');
  assert.match(sql, new RegExp(`jsonb_array_length\\(questions_en_ligne\\) <= ${LIMITES.questions}\\b`));
  assert.match(sql, new RegExp(`>= ${LIMITES.questions};`));
  assert.match(sql, new RegExp(`>= ${LIMITES.choixMax};`));
  assert.match(sql, new RegExp(`between 1 and ${LIMITES.longueur}\\b`));
  assert.ok(sql.includes("'autre'"));
  assert.ok(sql.includes('trg_resa_tags_questions_en_ligne'));
});
