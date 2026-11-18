// node --test : contrôles du temps de travail sur les horaires prévus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlesTempsTravail, pauseExigee } from './tempsTravail.js';
import { DEFAUTS, normaliserTempsTravail } from '../../utils/reglagesMaison.js';

const R = DEFAUTS.tempsTravail;
const sh = (id, date, debut, fin, pause = 0, userId = 'u1') => ({ id, userId, date, debut, fin, pause });
const codes = (m, id) => (m.get(id) || []).map((a) => a.code);

test('pause exigée par la LTr selon la durée', () => {
  assert.equal(pauseExigee(5 * 60), 0);
  assert.equal(pauseExigee(5.5 * 60), 0);
  assert.equal(pauseExigee(6 * 60), 15);
  assert.equal(pauseExigee(8 * 60), 30);
  assert.equal(pauseExigee(9.5 * 60), 60);
});

test('repos de 9 h entre la fermeture et l\'ouverture : signalé sur le lendemain', () => {
  const m = controlesTempsTravail({ shifts: [sh('a', '2026-11-20', '15:00', '23:30', 30), sh('b', '2026-11-21', '08:30', '14:00')], regles: R });
  assert.deepEqual(codes(m, 'b'), ['repos']);
  assert.equal(m.get('b')[0].valeur, '9 h');
  assert.equal(m.has('a'), false);
});

test('fin après minuit : le repos se compte depuis le lendemain matin', () => {
  const m = controlesTempsTravail({ shifts: [sh('a', '2026-11-20', '18:00', '01:00', 30), sh('b', '2026-11-21', '11:00', '15:00')], regles: R });
  assert.deepEqual(codes(m, 'b'), ['repos']);
  assert.equal(m.get('b')[0].valeur, '10 h');
});

test('service coupé : la coupure compte comme pause, 11 h de repos respectées', () => {
  const m = controlesTempsTravail({ shifts: [sh('a', '2026-11-20', '10:00', '14:30'), sh('b', '2026-11-20', '17:30', '22:30'), sh('c', '2026-11-21', '10:00', '14:00')], regles: R });
  assert.equal(m.size, 0);
});

test('journée de 9 h 30 avec 30 min de pause : pause courte', () => {
  const m = controlesTempsTravail({ shifts: [sh('a', '2026-11-20', '08:00', '18:00', 30)], regles: R });
  assert.deepEqual(codes(m, 'a'), ['pause']);
});

test('semaine au-delà de 50 h et jours de repos sur une semaine entière', () => {
  const jours = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21'];
  const shifts = jours.map((d, i) => sh(`s${i}`, d, '08:00', '18:00', 60));
  const m = controlesTempsTravail({ shifts, regles: R, periode: { debut: '2026-11-16', fin: '2026-11-22' } });
  assert.deepEqual(codes(m, 's5').sort(), ['repos_semaine', 'semaine']);
  // Sans semaine entière dans la période, pas de compte des jours de repos.
  const m2 = controlesTempsTravail({ shifts, regles: R, periode: { debut: '2026-11-18', fin: '2026-11-22' } });
  assert.deepEqual(codes(m2, 's5'), ['semaine']);
});

test('contrôles éteints, ou personnes différentes : rien', () => {
  const shifts = [sh('a', '2026-11-20', '15:00', '23:30', 30), sh('b', '2026-11-21', '08:30', '14:00', 0, 'u2')];
  assert.equal(controlesTempsTravail({ shifts, regles: R }).size, 0);
  const off = normaliserTempsTravail({ actif: false });
  assert.equal(controlesTempsTravail({ shifts: [sh('a', '2026-11-20', '15:00', '23:30', 30), sh('b', '2026-11-21', '08:30', '14:00')], regles: off }).size, 0);
});
