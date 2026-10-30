// node --test : coût du personnel de la Comptabilité (personnelCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coutPersonnel, heuresHoraire, mensuelBrut, salaireDuJour } from './personnelCompta.js';

const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} au lieu de ${b}`);
const mensuel = (extra = {}) => ({ id: 's1', profileId: 'u1', mode: 'mensuel', montant: 4950, treizieme: true, debut: '2026-01-01', fin: null, ...extra });
const horaire = (extra = {}) => ({ id: 's2', profileId: 'u2', mode: 'horaire', montant: 26.5, treizieme: false, debut: '2026-01-01', fin: null, ...extra });
// Horaire pointé de 8 h nettes (8 h 30 moins 30 minutes de pause).
const shift = (userId, date, extra = {}) => ({ userId, date, debut: '08:00', fin: '16:30', pause: 30, pointageDebut: '08:00', pointageFin: '16:30', ...extra });
const OCTOBRE = { debut: '2026-10-01', fin: '2026-10-31' };
const APRES = '2026-11-15'; // octobre est passé

test('mensuel avec 13e salaire, mois entier, sans charges : 4 950 x 13 / 12', () => {
  const r = coutPersonnel({ salaires: [mensuel()], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, 5362.5);
  assert.equal(r.lignes[0].source, 'mensuel');
  assert.equal(r.parSource.mensuel, 1);
});

test('mensuel sans 13e salaire, avec 16 % de charges', () => {
  const r = coutPersonnel({ salaires: [mensuel({ treizieme: false })], reglages: { chargesSocialesPct: 16 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, 5742);
  assert.equal(mensuelBrut(mensuel({ treizieme: false })), 4950);
});

test('charges sociales par défaut : 16 %', () => {
  const r = coutPersonnel({ salaires: [mensuel({ treizieme: false })], reglages: {}, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.chargesPct, 16);
  assert.equal(r.total, 5742);
});

test('mensuel au prorata : période en cours (15 jours sur 31) et salaire commencé en cours de mois', () => {
  const enCours = coutPersonnel({ salaires: [mensuel({ treizieme: false })], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: '2026-10-15' });
  assert.equal(enCours.total, Math.round(4950 * 15 / 31 * 100) / 100);
  const depuis = coutPersonnel({ salaires: [mensuel({ treizieme: false, debut: '2026-10-22' })], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(depuis.total, Math.round(4950 * 10 / 31 * 100) / 100);
});

test('horaire : taux x heures pointées, charges ajoutées', () => {
  const shifts = [shift('u2', '2026-10-02'), shift('u2', '2026-10-03', { pointageFin: '17:30' })];
  const r = coutPersonnel({ salaires: [horaire()], shifts, reglages: { chargesSocialesPct: 15 }, ...OCTOBRE, aujourdhui: APRES });
  const l = r.lignes[0];
  proche(l.heures, 17);
  assert.equal(l.cout, Math.round(17 * 26.5 * 1.15 * 100) / 100);
  assert.equal(r.total, l.cout);
});

test('sans salaire : coût horaire moyen, charges déjà comprises', () => {
  const r = coutPersonnel({ shifts: [shift('u3', '2026-10-02'), shift('u3', '2026-10-09')], reglages: { chargesSocialesPct: 16, coutHoraireMoyen: 32 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.lignes[0].source, 'moyen');
  assert.equal(r.total, 512);
  assert.equal(r.sansCout, 0);
});

test('personne sans salaire ni coût moyen : heures non chiffrées, coût inconnu', () => {
  const r = coutPersonnel({ personnes: ['u4'], shifts: [shift('u3', '2026-10-02')], reglages: {}, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, null);
  assert.equal(r.sansCout, 2);
  proche(r.heuresNonChiffrees, 8);
  const u4 = r.lignes.find(l => l.userId === 'u4');
  assert.equal(u4.source, 'aucun');
  assert.equal(u4.cout, null);
});

test('total partiel : les personnes chiffrées s\'additionnent, les autres sont comptées à part', () => {
  const r = coutPersonnel({ salaires: [mensuel({ treizieme: false })], shifts: [shift('u3', '2026-10-02')], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, 4950);
  assert.equal(r.sansCout, 1);
});

test('horaire passé non pointé : heures prévues comptées et signalées ; aujourd\'hui non pointé : rien', () => {
  const shifts = [
    shift('u2', '2026-10-02', { pointageDebut: null, pointageFin: null }),
    shift('u2', '2026-10-15', { pointageDebut: '08:00', pointageFin: null }),
  ];
  const r = coutPersonnel({ salaires: [horaire()], shifts, reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: '2026-10-15' });
  proche(r.heuresPrevues, 8);
  proche(r.heures, 0);
  assert.equal(r.total, 212);
  assert.equal(heuresHoraire(shifts[1], '2026-10-15'), null);
  assert.deepEqual(heuresHoraire(shifts[0], '2026-10-15'), { heures: 8, prevues: true, apresMinuit: false });
});

test('horaire après minuit : non compté, signalé', () => {
  const r = coutPersonnel({ salaires: [horaire()], shifts: [shift('u2', '2026-10-02', { pointageDebut: '18:00', pointageFin: '01:00', pause: 0 })], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.apresMinuit, 1);
  assert.equal(r.total, 0);
});

test('salaire changé en cours de mois : chaque horaire prend le salaire de son jour', () => {
  const salaires = [horaire({ id: 'a', fin: '2026-10-15' }), horaire({ id: 'b', montant: 30, debut: '2026-10-16' })];
  const r = coutPersonnel({ salaires, shifts: [shift('u2', '2026-10-10'), shift('u2', '2026-10-20')], reglages: { chargesSocialesPct: 0 }, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, 8 * 26.5 + 8 * 30);
  assert.equal(r.lignes[0].salaire.id, 'b');
  assert.equal(salaireDuJour(salaires, '2026-10-15').id, 'a');
});

test('horaire hors période ignoré ; salaire clos avant la période ignoré ; aucune personne : n/a', () => {
  const r = coutPersonnel({ salaires: [mensuel({ fin: '2026-09-30' })], shifts: [shift('u2', '2026-09-30')], reglages: {}, ...OCTOBRE, aujourdhui: APRES });
  assert.equal(r.total, null);
  assert.equal(r.lignes.length, 0);
});
