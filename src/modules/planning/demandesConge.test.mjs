// node --test : demandes de congé (demandesConge.js) et lecture des statuts
// (utils/absences.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { contexteDemande, demandesATraiter, mesDemandes, verifierDemande } from './demandesConge.js';
import { absenceDe, absencesDuJour, estAcceptee, mapAbsenceFromDB } from '../../utils/absences.js';

const ligne = (extra = {}) => ({ id: 'a1', userId: 'u1', motif: 'conge', dateDebut: '2026-12-10', dateFin: '2026-12-12', statut: 'demande', createdAt: '2026-11-20T10:00:00Z', ...extra });

test('une ligne sans statut (avant la migration) est une absence acceptée', () => {
  const a = mapAbsenceFromDB({ id: 'x', etablissement_id: 'e', user_id: 'u1', motif: 'conge', date_debut: '2026-12-01', date_fin: '2026-12-01' });
  assert.equal(a.statut, 'acceptee');
  assert.ok(estAcceptee(a));
  assert.equal(mapAbsenceFromDB({ statut: 'bizarre', date_debut: 'x', date_fin: 'x' }).statut, 'acceptee');
  assert.equal(mapAbsenceFromDB({ statut: 'demande', date_debut: 'x', date_fin: 'x' }).statut, 'demande');
});

test('une demande ou un refus ne compte pas comme absence dans la grille', () => {
  const lignes = [ligne(), ligne({ id: 'a2', userId: 'u2', statut: 'refusee' }), ligne({ id: 'a3', userId: 'u3', statut: 'acceptee' })];
  assert.equal(absenceDe(lignes, 'u1', '2026-12-11'), null);
  assert.equal(absenceDe(lignes, 'u2', '2026-12-11'), null);
  assert.equal(absenceDe(lignes, 'u3', '2026-12-11').id, 'a3');
  assert.deepEqual(absencesDuJour(lignes, '2026-12-11').map((a) => a.id), ['a3']);
});

test('verifierDemande : motif, dates, passé, ordre', () => {
  const base = { motif: 'conge', dateDebut: '2026-12-10', dateFin: '2026-12-12', aujourdhui: '2026-11-22', userId: 'u1' };
  assert.equal(verifierDemande(base), null);
  assert.equal(verifierDemande({ ...base, motif: 'absence' }), 'Choisissez un motif.');
  assert.equal(verifierDemande({ ...base, motif: 'ferie' }), 'Choisissez un motif.');
  assert.equal(verifierDemande({ ...base, dateFin: '' }), 'Indiquez les dates.');
  assert.match(verifierDemande({ ...base, dateDebut: '2026-11-21' }), /aujourd'hui ou plus tard/);
  assert.equal(verifierDemande({ ...base, dateDebut: '2026-11-22', dateFin: '2026-11-22' }), null, 'aujourd\'hui est permis');
  assert.match(verifierDemande({ ...base, dateFin: '2026-12-09' }), /après la date de début/);
  assert.match(verifierDemande({ ...base, dateFin: '2028-01-10' }), /un an au plus/);
});

test('verifierDemande : chevauchement d\'une demande ou d\'une absence, pas d\'un refus', () => {
  const base = { motif: 'vacances', dateDebut: '2026-12-11', dateFin: '2026-12-15', aujourdhui: '2026-11-22', userId: 'u1' };
  assert.match(verifierDemande({ ...base, lignes: [ligne()] }), /déjà une demande en attente/);
  assert.match(verifierDemande({ ...base, lignes: [ligne({ statut: 'acceptee' })] }), /déjà une absence/);
  assert.equal(verifierDemande({ ...base, lignes: [ligne({ statut: 'refusee' })] }), null);
  assert.equal(verifierDemande({ ...base, lignes: [ligne({ userId: 'u2' })] }), null, 'la ligne d\'un collègue ne bloque pas');
  assert.equal(verifierDemande({ ...base, dateDebut: '2026-12-13', lignes: [ligne()] }), null, 'jour suivant la fin : libre');
});

test('mesDemandes : les siennes, à venir, de la plus proche à la plus lointaine', () => {
  const lignes = [
    ligne({ id: 'b', dateDebut: '2027-01-05', dateFin: '2027-01-06' }),
    ligne({ id: 'a', dateDebut: '2026-12-01', dateFin: '2026-12-02', statut: 'acceptee' }),
    ligne({ id: 'passee', dateDebut: '2026-11-01', dateFin: '2026-11-03' }),
    ligne({ id: 'autre', userId: 'u2' }),
    ligne({ id: 'encours', dateDebut: '2026-11-20', dateFin: '2026-11-22', statut: 'refusee' }),
  ];
  assert.deepEqual(mesDemandes({ lignes, userId: 'u1', aujourdhui: '2026-11-22' }).map((a) => a.id), ['encours', 'a', 'b']);
});

test('contexteDemande : autres absents (une fois chacun) et services de la personne', () => {
  const demande = ligne({ dateDebut: '2026-12-10', dateFin: '2026-12-11' });
  const absences = [
    { id: 'x', userId: 'u2', dateDebut: '2026-12-11', dateFin: '2026-12-20', statut: 'acceptee' },
    { id: 'y', userId: 'u2', dateDebut: '2026-12-10', dateFin: '2026-12-10', statut: 'acceptee' },
    { id: 'z', userId: 'u3', dateDebut: '2026-12-10', dateFin: '2026-12-10', statut: 'demande' },
    { id: 'w', userId: 'u4', dateDebut: '2026-12-12', dateFin: '2026-12-13', statut: 'acceptee' },
  ];
  const shifts = [
    { id: 's2', userId: 'u1', date: '2026-12-11', debut: '18:00', fin: '22:00' },
    { id: 's1', userId: 'u1', date: '2026-12-10', debut: '09:00', fin: '14:00' },
    { id: 's3', userId: 'u1', date: '2026-12-12', debut: '09:00', fin: '14:00' },
    { id: 's4', userId: 'u2', date: '2026-12-10', debut: '09:00', fin: '14:00' },
  ];
  const c = contexteDemande({ demande, absences, shifts });
  assert.deepEqual(c.autresAbsents, ['u2']);
  assert.deepEqual(c.services.map((s) => s.id), ['s1', 's2']);
  assert.equal(c.jours, 2);
});

test('demandesATraiter : seules les demandes, la plus ancienne d\'abord', () => {
  const l = [
    ligne({ id: 'n', createdAt: '2026-11-21T08:00:00Z' }),
    ligne({ id: 'v', createdAt: '2026-11-19T08:00:00Z' }),
    ligne({ id: 'ok', statut: 'acceptee', createdAt: '2026-11-01T08:00:00Z' }),
  ];
  assert.deepEqual(demandesATraiter(l).map((a) => a.id), ['v', 'n']);
});
