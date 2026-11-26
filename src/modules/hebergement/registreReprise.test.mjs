// node --test : reprise du registre d'un habitué (registreReprise.js, lot 13 du panel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { accompagnantsDuDernierSejour, completerFormulaire, dernierPassage, lectureTronquee } from './registreReprise.js';

const o = (id, sejourId, extra = {}) => ({
  id, sejourId, hoteId: null, prenom: '', nom: '', dateNaissance: '', nationalite: '', domicileAdresse: '', domicileLocalite: '',
  domicilePays: '', pieceType: '', pieceNumero: '', arrivee: '', depart: '', exonereTaxe: false, exonereMotif: '', createdAt: '', ...extra,
});

test('dernierPassage : la ligne la plus récente de la fiche hôte, hors séjour courant', () => {
  const occupants = [
    o('a', 's1', { hoteId: 'h1', arrivee: '2026-03-01', domicileLocalite: 'Sion' }),
    o('b', 's2', { hoteId: 'h1', arrivee: '2026-09-01', domicileLocalite: 'Sierre' }),
    o('c', 's3', { hoteId: 'h1', arrivee: '2026-11-20', domicileLocalite: 'Courant' }),
    o('d', 's4', { hoteId: 'h2', arrivee: '2026-10-01', domicileLocalite: 'Autre' }),
    o('e', 's2', { hoteId: null, arrivee: '2026-10-05', nom: 'Même nom' }),
  ];
  assert.equal(dernierPassage(occupants, 'h1', 's3').id, 'b');
  assert.equal(dernierPassage(occupants, 'h1', 's9').id, 'c');
  assert.equal(dernierPassage(occupants, null, 's3'), null);
  assert.equal(dernierPassage(occupants, '', 's3'), null);
  assert.equal(dernierPassage(occupants, 'h9', 's3'), null);
});

test('completerFormulaire : champs vides seulement, fiche hôte prioritaire, jamais l\'exonération', () => {
  const passage = o('p', 's1', { prenom: 'Ancien', nom: 'Nom', nationalite: 'France', domicileLocalite: 'Lyon', domicilePays: 'FR', pieceType: 'passeport', pieceNumero: 'X1', exonereTaxe: true, exonereMotif: 'Chauffeur' });
  const form = { prenom: 'Anna', nom: 'Muster', dateNaissance: '', nationalite: '', domicileAdresse: '', domicileLocalite: 'Saisi', domicilePays: '', pieceType: '', pieceNumero: '', exonereTaxe: false, exonereMotif: '' };
  const r = completerFormulaire(form, { prenom: 'Anna', nom: 'Muster', nationalite: 'Suisse' }, passage);
  assert.equal(r.prenom, 'Anna');
  assert.equal(r.nationalite, 'Suisse');
  assert.equal(r.domicileLocalite, 'Saisi');
  assert.equal(r.domicilePays, 'FR');
  assert.equal(r.pieceType, 'passeport');
  assert.equal(r.pieceNumero, 'X1');
  assert.equal(r.exonereTaxe, false);
  assert.equal(r.exonereMotif, '');
});

test('accompagnantsDuDernierSejour : dernier séjour arrivé du même hôte, sans les personnes déjà inscrites', () => {
  const sejour = { id: 'cur', hoteId: 'h1', arrivee: '2026-11-27' };
  const sejours = [
    sejour,
    { id: 'vieux', hoteId: 'h1', statut: 'parti', arrivee: '2026-05-01' },
    { id: 'dernier', hoteId: 'h1', statut: 'parti', arrivee: '2026-11-15' },
    { id: 'futur', hoteId: 'h1', statut: 'prevu', arrivee: '2026-12-10' },
    { id: 'annule', hoteId: 'h1', statut: 'annule', arrivee: '2026-11-20' },
    { id: 'prevuAvant', hoteId: 'h1', statut: 'prevu', arrivee: '2026-11-22' },
    { id: 'autre', hoteId: 'h2', statut: 'parti', arrivee: '2026-11-25' },
  ];
  const occupants = [
    o('v1', 'vieux', { prenom: 'Vieux' }),
    o('d1', 'dernier', { hoteId: 'h1', prenom: 'Élise', nom: 'Dupré', dateNaissance: '1980-01-01' }),
    o('d2', 'dernier', { prenom: 'Léo', nom: 'Dupré', dateNaissance: '2015-01-01' }),
    o('f1', 'futur', { prenom: 'Futur' }),
    o('a1', 'annule', { prenom: 'Annulé' }),
    o('p1', 'prevuAvant', { prenom: 'Prévu' }),
    o('x1', 'autre', { prenom: 'Autre' }),
  ];
  assert.deepEqual(accompagnantsDuDernierSejour({ sejours, occupants, sejour }).map((x) => x.id), ['d1', 'd2']);
  // Déjà inscrite au séjour courant, avec une autre casse et sans accents.
  const avecInscrit = [...occupants, o('c1', 'cur', { prenom: 'ELISE', nom: 'dupre', dateNaissance: '1980-01-01' })];
  assert.deepEqual(accompagnantsDuDernierSejour({ sejours, occupants: avecInscrit, sejour }).map((x) => x.id), ['d2']);
  // Même nom mais autre date de naissance : ce n'est pas la même personne.
  const homonyme = [...occupants, o('c2', 'cur', { prenom: 'Léo', nom: 'Dupré', dateNaissance: '2016-01-01' })];
  assert.deepEqual(accompagnantsDuDernierSejour({ sejours, occupants: homonyme, sejour }).map((x) => x.id), ['d1', 'd2']);
});

test('accompagnantsDuDernierSejour : liste vide pour un hôte jamais venu ou un séjour sans fiche', () => {
  const sejours = [{ id: 'cur', hoteId: 'h1', arrivee: '2026-11-27' }, { id: 'futur', hoteId: 'h1', statut: 'prevu', arrivee: '2026-12-10' }];
  const occupants = [o('f1', 'futur', { prenom: 'Futur' })];
  assert.deepEqual(accompagnantsDuDernierSejour({ sejours, occupants, sejour: sejours[0] }), []);
  assert.deepEqual(accompagnantsDuDernierSejour({ sejours, occupants, sejour: { id: 'x', hoteId: null, arrivee: '2026-11-27' } }), []);
});

test('lectureTronquee : 1000 lignes ou la limite du hook', () => {
  assert.equal(lectureTronquee(1000, 20000), true);
  assert.equal(lectureTronquee(20000, 20000), true);
  assert.equal(lectureTronquee(999, 20000), false);
  assert.equal(lectureTronquee(1001, 20000), false);
});
