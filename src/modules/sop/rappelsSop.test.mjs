import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jourSemaineIso, rappelsDuJour } from './rappelsSop.js';

const JOUR = '2026-11-22'; // un dimanche
const h = (x) => { const [a, b] = x.split(':').map(Number); return a * 60 + b; };
const sop = (id, x = {}) => ({ id, titre: `Procédure ${id}`, actif: true, rappelActif: true, rappelMoment: 'ouverture', rolesDesignes: [], rappelJours: null, ...x });
const shifts = [
  { userId: 'ines', date: JOUR, debut: '07:30', fin: '15:00' },
  { userId: 'lucas', date: JOUR, debut: '10:00', fin: '23:30' },
  { userId: 'sofia', date: JOUR, debut: '17:00', fin: '00:30' },
];
const base = { executions: [], shifts, jour: JOUR, role: 'cuisinier' };

test('dimanche = 7', () => { assert.equal(jourSemaineIso(JOUR), 7); });

test("ouverture : chez qui commence le plus tôt, de 30 min avant à 2 h après", () => {
  const sops = [sop('o')];
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'ines', maintenant: h('07:10') }).length, 1);
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'ines', maintenant: h('06:50') }).length, 0);
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'ines', maintenant: h('09:40') }).length, 0);
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'lucas', maintenant: h('07:40') }).length, 0);
});

test('fermeture : chez qui finit le plus tard, après minuit compris', () => {
  const sops = [sop('f', { rappelMoment: 'fermeture' })];
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'sofia', maintenant: h('23:45') }).length, 1);
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'lucas', maintenant: h('23:00') }).length, 0);
});

test('avant et après le service : sur l\'horaire de la personne', () => {
  const avant = [sop('a', { rappelMoment: 'avant_service' })];
  assert.equal(rappelsDuJour({ ...base, sops: avant, userId: 'lucas', maintenant: h('09:45') }).length, 1);
  assert.equal(rappelsDuJour({ ...base, sops: avant, userId: 'lucas', maintenant: h('12:00') }).length, 0);
  const apres = [sop('p', { rappelMoment: 'apres_service' })];
  assert.equal(rappelsDuJour({ ...base, sops: apres, userId: 'ines', maintenant: h('14:30') }).length, 1);
});

test("à une heure : chez qui travaille à cette heure, pendant 2 heures", () => {
  const sops = [sop('h', { rappelMoment: 'heure', rappelHeure: '16:00' })];
  const r = rappelsDuJour({ ...base, sops, userId: 'lucas', maintenant: h('16:30') });
  assert.equal(r.length, 1);
  assert.equal(r[0].detail, 'À faire à 16:00');
  assert.equal(rappelsDuJour({ ...base, sops, userId: 'ines', maintenant: h('16:30') }).length, 0);
});

test('rôles, jours, pas au planning, déjà terminée', () => {
  const t = h('07:10');
  assert.equal(rappelsDuJour({ ...base, sops: [sop('r', { rolesDesignes: ['serveur'] })], userId: 'ines', maintenant: t }).length, 0);
  assert.equal(rappelsDuJour({ ...base, sops: [sop('j', { rappelJours: [1, 2, 3] })], userId: 'ines', maintenant: t }).length, 0);
  assert.equal(rappelsDuJour({ ...base, sops: [sop('o')], userId: 'paul', maintenant: t }).length, 0);
  const executions = [{ sopId: 'o', statut: 'terminee', dateExecution: JOUR, operateurId: 'lucas' }];
  assert.equal(rappelsDuJour({ ...base, executions, sops: [sop('o')], userId: 'ines', maintenant: t }).length, 0);
  assert.equal(rappelsDuJour({ ...base, sops: [sop('x', { rappelActif: false })], userId: 'ines', maintenant: t }).length, 0);
});

test('une exécution commencée par la personne se reprend toute la journée', () => {
  const executions = [{ id: 'e1', sopId: 'x', statut: 'en_cours', dateExecution: JOUR, operateurId: 'ines', heureDebut: '2026-11-22T07:40:00Z' }];
  const r = rappelsDuJour({ ...base, executions, sops: [sop('x', { rappelActif: false })], userId: 'ines', maintenant: h('13:00') });
  assert.equal(r.length, 1);
  assert.equal(r[0].enCours, true);
  assert.equal(r[0].exec.id, 'e1');
  assert.equal(rappelsDuJour({ ...base, executions, sops: [sop('x')], userId: 'lucas', maintenant: h('13:00') }).length, 0);
});
