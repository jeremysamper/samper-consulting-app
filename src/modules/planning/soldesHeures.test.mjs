// node --test : solde d'heures par personne (soldesHeures.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bornesMois, calcHeures, formatSolde, joursEntre, periodeEnCours, retardsDuJour, soldeMois, soldePersonne,
} from './soldesHeures.js';

const proche = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} au lieu de ${b}`);
const contrat = (extra = {}) => ({ id: 'k1', profileId: 'u1', taux: 100, heuresSemaine: 42, debut: '2026-01-01', fin: null, ...extra });
const horaire = (date, debut, fin, extra = {}) => ({ userId: 'u1', date, debut, fin, pause: 0, pointageDebut: debut, pointageFin: fin, ...extra });
const absence = (motif, dateDebut, dateFin = dateDebut) => ({ userId: 'u1', motif, dateDebut, dateFin });

test('mois plein de 31 jours à 100 % et 42 h : 186 h dues', () => {
  const r = soldeMois({ mois: '2026-12', userId: 'u1', contrats: [contrat()], shifts: [], absences: [] });
  proche(r.heuresDues, 42 * 31 / 7);
  assert.equal(r.joursDus, 31);
  assert.equal(r.heuresFaites, 0);
  proche(r.solde, -186);
});

test('mois à 30 jours (novembre) : 180 h dues', () => {
  const r = soldeMois({ mois: '2026-11', userId: 'u1', contrats: [contrat()], shifts: [], absences: [] });
  proche(r.heuresDues, 180);
});

test('mois à 28 jours (février 2027) : 168 h dues', () => {
  assert.deepEqual(bornesMois('2027-02'), { debut: '2027-02-01', fin: '2027-02-28' });
  const r = soldeMois({ mois: '2027-02', userId: 'u1', contrats: [contrat()], shifts: [], absences: [] });
  proche(r.heuresDues, 168);
});

test('passage à l\'heure d\'hiver (25.10.2026) : octobre compte 31 jours, pas 30,96', () => {
  assert.equal(joursEntre('2026-10-01', '2026-10-31').length, 31);
  assert.ok(joursEntre('2026-10-24', '2026-10-27').join() === '2026-10-24,2026-10-25,2026-10-26,2026-10-27');
  const r = soldeMois({ mois: '2026-10', userId: 'u1', contrats: [contrat()], shifts: [horaire('2026-10-25', '10:00', '15:00')], absences: [] });
  proche(r.heuresDues, 186);
  proche(r.heuresFaites, 5);
});

test('service coupé : les deux créneaux du jour comptent, pause déduite', () => {
  const r = soldeMois({
    mois: '2026-10', userId: 'u1', contrats: [contrat()], absences: [],
    shifts: [horaire('2026-10-05', '10:00', '15:00', { pause: 30 }), horaire('2026-10-05', '17:00', '23:00')],
  });
  proche(r.heuresFaites, 4.5 + 6);
});

test('horaire sans départ pointé : rien de fait, comme au relevé CCNT', () => {
  const r = soldeMois({ mois: '2026-10', userId: 'u1', contrats: [contrat()], absences: [], shifts: [horaire('2026-10-05', '10:00', '15:00', { pointageFin: null })] });
  assert.equal(r.heuresFaites, 0);
});

test('chaque motif d\'absence : congé, vacances, formation et jour férié créditent un jour', () => {
  for (const motif of ['conge', 'vacances', 'formation', 'ferie']) {
    const r = soldeMois({ mois: '2026-11', userId: 'u1', contrats: [contrat()], shifts: [], absences: [absence(motif, '2026-11-02')] });
    assert.equal(r.joursDus, 29, motif);
    proche(r.heuresDues, 42 * 29 / 7);
    assert.equal(r.joursParMotif[motif], 1, motif);
  }
});

test('« absence » ne crédite pas : jours dus inchangés, jour compté à part', () => {
  const r = soldeMois({ mois: '2026-11', userId: 'u1', contrats: [contrat()], shifts: [], absences: [absence('absence', '2026-11-02', '2026-11-04')] });
  assert.equal(r.joursDus, 30);
  proche(r.heuresDues, 180);
  assert.equal(r.joursParMotif.absence, 3);
});

test('vacances sur une semaine qui déborde du mois : seuls les jours du mois comptent', () => {
  const r = soldeMois({ mois: '2026-11', userId: 'u1', contrats: [contrat()], shifts: [], absences: [absence('vacances', '2026-10-28', '2026-11-03')] });
  assert.equal(r.joursParMotif.vacances, 3);
  assert.equal(r.joursDus, 27);
});

test('contrat commencé le 16 du mois : 16 jours dus sur 31', () => {
  const r = soldeMois({ mois: '2026-10', userId: 'u1', contrats: [contrat({ debut: '2026-10-16' })], shifts: [horaire('2026-10-02', '08:00', '12:00')], absences: [] });
  assert.equal(r.joursDus, 16);
  proche(r.heuresDues, 42 * 16 / 7);
  proche(r.heuresFaites, 4); // les heures pointées avant le contrat restent faites (même mesure que le relevé)
});

test('taux 50 % : moitié des heures dues', () => {
  const r = soldeMois({ mois: '2026-11', userId: 'u1', contrats: [contrat({ taux: 50 })], shifts: [], absences: [] });
  proche(r.heuresDues, 90);
  assert.equal(r.contrat.taux, 50);
});

test('changement de taux en cours de mois : chaque jour prend son contrat', () => {
  const r = soldeMois({
    mois: '2026-11', userId: 'u1', shifts: [], absences: [],
    contrats: [contrat({ id: 'a', debut: '2026-01-01', fin: '2026-11-15' }), contrat({ id: 'b', taux: 50, debut: '2026-11-16' })],
  });
  proche(r.heuresDues, 42 * 15 / 7 + 21 * 15 / 7);
  assert.equal(r.contrat.id, 'b');
});

test('retard de 4 minutes non compté, de 6 minutes compté', () => {
  const r = soldeMois({
    mois: '2026-10', userId: 'u1', contrats: [contrat()], absences: [],
    shifts: [
      horaire('2026-10-05', '10:00', '15:00', { pointageDebut: '10:04' }),
      horaire('2026-10-06', '10:00', '15:00', { pointageDebut: '10:06' }),
      horaire('2026-10-07', '10:00', '15:00', { pointageDebut: '10:05' }),
      horaire('2026-10-08', '10:00', '15:00', { pointageDebut: '09:50' }),
    ],
  });
  assert.deepEqual(r.retards, { nombre: 1, minutes: 6 });
});

test('sans contrat : solde et heures dues non calculés (null, jamais 0), heures faites gardées', () => {
  const r = soldeMois({ mois: '2026-10', userId: 'u1', contrats: [contrat({ profileId: 'autre' })], shifts: [horaire('2026-10-05', '10:00', '15:00')], absences: [] });
  assert.equal(r.avecContrat, false);
  assert.equal(r.solde, null);
  assert.equal(r.heuresDues, null);
  proche(r.heuresFaites, 5);
  assert.equal(formatSolde(r.solde), '');
});

test('contrat fini avant la période : sans contrat', () => {
  const r = soldeMois({ mois: '2026-10', userId: 'u1', contrats: [contrat({ fin: '2026-09-30' })], shifts: [], absences: [] });
  assert.equal(r.avecContrat, false);
});

test('calcHeures : même résultat que le relevé CCNT, départ après minuit négatif compris', () => {
  assert.equal(calcHeures('10:00', '15:00', 30), 4.5);
  assert.equal(calcHeures('18:00', '00:30', 0), -17.5);
  assert.equal(calcHeures('', '15:00', 0), null);
});

test('période en cours : du 1er à hier, le 1er le mois précédent entier', () => {
  assert.deepEqual(periodeEnCours('2026-10-29'), { debut: '2026-10-01', fin: '2026-10-28', complet: false });
  assert.deepEqual(periodeEnCours('2026-11-01'), { debut: '2026-10-01', fin: '2026-10-31', complet: true });
  assert.deepEqual(periodeEnCours('2027-03-01'), { debut: '2027-02-01', fin: '2027-02-28', complet: true });
});

test('retards du jour : par personne, le plus en retard d\'abord', () => {
  const r = retardsDuJour([
    horaire('2026-10-29', '10:00', '15:00', { userId: 'a', pointageDebut: '10:07' }),
    horaire('2026-10-29', '17:00', '23:00', { userId: 'a', pointageDebut: '17:10' }),
    horaire('2026-10-29', '08:00', '12:00', { userId: 'b', pointageDebut: '08:30' }),
    horaire('2026-10-29', '08:00', '12:00', { userId: 'c', pointageDebut: '08:03' }),
    horaire('2026-10-28', '08:00', '12:00', { userId: 'd', pointageDebut: '09:00' }),
  ], '2026-10-29');
  assert.deepEqual(r, [{ userId: 'b', minutes: 30 }, { userId: 'a', minutes: 17 }]);
});

test('formatSolde : signe et minutes', () => {
  assert.equal(formatSolde(3.25), '+3 h 15');
  assert.equal(formatSolde(-1 - 5 / 60), '-1 h 05');
  assert.equal(formatSolde(0.001), '0 h');
  assert.equal(formatSolde(null), '');
});

test('période libre (semaine) : même règle que le mois', () => {
  const r = soldePersonne({ userId: 'u1', debut: '2026-10-26', fin: '2026-11-01', contrats: [contrat()], shifts: [], absences: [] });
  proche(r.heuresDues, 42);
});
