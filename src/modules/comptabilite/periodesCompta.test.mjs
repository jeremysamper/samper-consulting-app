// node --test : périodes de la Comptabilité (periodesCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  periodeMois, periodeTrimestre, periodeAnnee, periodesInventaire, periodePrecedente, periodeSuivante,
  periodeCourante, finEffective, libellePeriode, prorata, nbJours, listeJours,
} from './periodesCompta.js';

test('bornes de mois de 28 à 31 jours', () => {
  assert.deepEqual(periodeMois('2026-02-14'), { type: 'mois', debut: '2026-02-01', fin: '2026-02-28' });
  assert.deepEqual(periodeMois('2028-02-03'), { type: 'mois', debut: '2028-02-01', fin: '2028-02-29' });
  assert.equal(periodeMois('2026-04-30').fin, '2026-04-30');
  assert.equal(periodeMois('2026-10-01').fin, '2026-10-31');
  assert.equal(periodeMois('2026-12-31').debut, '2026-12-01');
});

test('trimestre et année civils', () => {
  assert.deepEqual(periodeTrimestre('2026-10-30'), { type: 'trimestre', numero: 4, debut: '2026-10-01', fin: '2026-12-31' });
  assert.deepEqual(periodeTrimestre('2026-02-28'), { type: 'trimestre', numero: 1, debut: '2026-01-01', fin: '2026-03-31' });
  assert.equal(periodeTrimestre('2026-09-30').fin, '2026-09-30');
  assert.deepEqual(periodeAnnee('2026-07-04'), { type: 'annee', debut: '2026-01-01', fin: '2026-12-31' });
});

test('précédente et suivante, jamais au-delà de la période en cours', () => {
  const oct = periodeMois('2026-10-30');
  assert.deepEqual(periodePrecedente(oct), periodeMois('2026-09-01'));
  assert.equal(periodeSuivante(oct, '2026-10-30'), null);
  assert.deepEqual(periodeSuivante(periodeMois('2026-09-10'), '2026-10-30'), oct);
  assert.deepEqual(periodePrecedente(periodeTrimestre('2026-01-15')), periodeTrimestre('2025-12-01'));
  assert.equal(periodeSuivante(periodeTrimestre('2026-10-30'), '2026-10-30'), null);
  assert.deepEqual(periodePrecedente(periodeAnnee('2026-05-01')), periodeAnnee('2025-05-01'));
  assert.equal(periodeSuivante(periodeAnnee('2025-05-01'), '2026-10-30').debut, '2026-01-01');
  assert.equal(periodeSuivante(periodeAnnee('2026-05-01'), '2026-10-30'), null);
});

test('inventaires sur deux périmètres le même jour : une seule borne', () => {
  const inv = [
    { date: '2026-08-31', statut: 'validé', nom: 'Général' },
    { date: '2026-09-30', statut: 'validé', nom: 'Général' },
    { date: '2026-09-30', statut: 'validé', nom: 'Boissons' },
    { date: '2026-10-20', statut: 'en cours', nom: 'Général' },
  ];
  const p = periodesInventaire(inv, '2026-10-30');
  assert.equal(p.length, 2);
  assert.deepEqual(p[0], { type: 'inventaire', debut: '2026-09-01', fin: '2026-09-30', inventaireDebut: '2026-08-31', inventaireFin: '2026-09-30', ouverte: false });
  assert.deepEqual(p[1], { type: 'inventaire', debut: '2026-10-01', fin: '2026-10-30', inventaireDebut: '2026-09-30', inventaireFin: null, ouverte: true });
  assert.equal(libellePeriode(p[0]), 'du 1er au 30 septembre 2026');
  assert.equal(libellePeriode(p[1]), 'depuis le 30 septembre 2026');
  assert.deepEqual(periodePrecedente(p[1], { periodesInv: p }), p[0]);
  assert.equal(periodePrecedente(p[0], { periodesInv: p }), null);
  assert.deepEqual(periodeSuivante(p[0], '2026-10-30', { periodesInv: p }), p[1]);
  assert.equal(periodeSuivante(p[1], '2026-10-30', { periodesInv: p }), null);
  assert.deepEqual(periodeCourante('inventaire', '2026-10-30', { periodesInv: p }), p[1]);
});

test('aucun inventaire validé : aucune période d\'inventaire', () => {
  assert.deepEqual(periodesInventaire([{ date: '2026-10-01', statut: 'en cours' }], '2026-10-30'), []);
  assert.deepEqual(periodesInventaire([], '2026-10-30'), []);
  assert.equal(periodeCourante('inventaire', '2026-10-30', { periodesInv: [] }), null);
});

test('inventaire du jour : pas de période ouverte vide', () => {
  const p = periodesInventaire([{ date: '2026-09-30', statut: 'validé' }, { date: '2026-10-30', statut: 'validé' }], '2026-10-30');
  assert.equal(p.length, 1);
  assert.equal(p[0].fin, '2026-10-30');
});

test('libellés de période', () => {
  assert.equal(libellePeriode(periodeMois('2026-10-30')), 'octobre 2026');
  assert.equal(libellePeriode(periodeTrimestre('2026-10-30')), '4e trimestre 2026');
  assert.equal(libellePeriode(periodeTrimestre('2027-01-02')), '1er trimestre 2027');
  assert.equal(libellePeriode(periodeAnnee('2026-10-30')), 'année 2026');
});

test('fin effective, prorata et jours', () => {
  const oct = periodeMois('2026-10-30');
  assert.equal(finEffective(oct, '2026-10-30'), '2026-10-30');
  assert.equal(finEffective(periodeMois('2026-09-02'), '2026-10-30'), '2026-09-30');
  assert.deepEqual(prorata(oct, '2026-10-30'), { ecoules: 30, total: 31 });
  assert.equal(prorata(periodeMois('2026-09-02'), '2026-10-30'), null);
  assert.equal(nbJours('2026-10-01', '2026-10-31'), 31);
  assert.equal(nbJours('2026-10-02', '2026-10-01'), 0);
  assert.deepEqual(listeJours('2026-02-27', '2026-03-01'), ['2026-02-27', '2026-02-28', '2026-03-01']);
});
