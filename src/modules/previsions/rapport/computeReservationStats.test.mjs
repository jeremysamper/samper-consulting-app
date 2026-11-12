// node --test : statistiques du rapport des réservations
// (computeReservationStats.js) et leur série par tranche (module Statistiques).
// Lancer : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReservationStats, serieReservations } from './computeReservationStats.js';

const AUJ = '2026-11-11';
let n = 0;
const resa = (date, service, couverts, statut, extra = {}) => ({
  id: `r${++n}`, date_service: date, service, heure_arrivee: service === 'soir' ? '19:30' : '12:15', nb_couverts: couverts,
  statut, origine: 'equipe', client_id: null, est_groupe: false, passeport_gourmand: false, created_at: `${date}T08:00:00Z`,
  nom: 'x', reservation_tables: [], reservation_tags: [], ...extra,
});
// Trois jours d'octobre : honorées, no-show, annulée, non pointée, en ligne.
const lignes = [
  resa('2026-10-05', 'midi', 4, 'parti'),
  resa('2026-10-05', 'soir', 2, 'no_show'),
  resa('2026-10-05', 'soir', 6, 'parti', { origine: 'en_ligne' }),
  resa('2026-10-06', 'midi', 3, 'annule'),
  resa('2026-10-06', 'soir', 5, 'arrive', { origine: 'passage' }),
  resa('2026-10-07', 'midi', 2, 'confirme'),
  resa('2026-10-07', 'soir', 8, 'parti'),
];
const periode = { debut: '2026-10-05', fin: '2026-10-07' };
const jours = ['2026-10-05', '2026-10-06', '2026-10-07'].map((d) => ({ debut: d, fin: d }));
const rapport = () => computeReservationStats({ lignes, periode, comparaison: { debut: '2026-10-02', fin: '2026-10-04' }, aujourdhui: AUJ, reference: AUJ });

test('rapport : couverts comptés, no-show et taux sur les échues', () => {
  const c = rapport().chiffres;
  // Comptées : 4 + 6 + 5 + 2 (non pointée) + 8 = 25 ; le no-show et l'annulée n'y sont pas.
  assert.equal(c.couverts, 25);
  assert.equal(c.tables, 6);
  assert.equal(c.noShowTables, 1);
  assert.equal(c.noShowCouverts, 2);
  assert.equal(c.annuleesTables, 1);
  assert.equal(c.nonPointeesTables, 1);
  // Échues : 6 valides, aucune prévue.
  assert.equal(c.tauxNoShow, 1 / 6);
  assert.equal(c.tauxAnnulationTables, 1 / 7);
});

test('rapport : une période sans réservation rend des taux null, jamais zéro', () => {
  const vide = computeReservationStats({ lignes, periode: { debut: '2026-09-01', fin: '2026-09-03' }, comparaison: periode, aujourdhui: AUJ, reference: AUJ });
  assert.equal(vide.vide, true);
  assert.equal(vide.chiffres.couverts, 0);
  assert.equal(vide.chiffres.tauxNoShow, null);
  assert.equal(vide.chiffres.tauxAnnulationTables, null);
  assert.equal(vide.chiffres.tailleMoyenne, null);
});

test('série : la somme des jours est le chiffre de la période', () => {
  const c = rapport().chiffres;
  const serie = serieReservations({ lignes, tranches: jours, aujourdhui: AUJ });
  const somme = (cle) => serie.reduce((s, p) => s + p.chiffres[cle], 0);
  ['couverts', 'tables', 'noShowTables', 'noShowCouverts', 'annuleesTables', 'nonPointeesTables', 'honoreesCouverts'].forEach((cle) => {
    assert.equal(somme(cle), c[cle], cle);
  });
  assert.deepEqual(serie.map((p) => p.chiffres.couverts), [10, 5, 10]);
});

test('série : une tranche égale à la période rend les chiffres du rapport, taux compris', () => {
  const r = rapport();
  const [tout] = serieReservations({ lignes, tranches: [periode], aujourdhui: AUJ });
  assert.deepEqual(tout.chiffres, r.chiffres);
  assert.deepEqual(tout.canaux, r.canaux.parCanal);
  assert.deepEqual(tout.services.map((s) => s.couverts), r.temporalite.repartition.map((s) => s.couverts));
});

test('série : le taux de no-show se recalcule sur la tranche, il ne se moyenne pas', () => {
  const serie = serieReservations({ lignes, tranches: jours, aujourdhui: AUJ });
  // Jour 1 : 1 no-show sur 3 échues ; jour 2 : 0 sur 1 ; jour 3 : 0 sur 2.
  assert.deepEqual(serie.map((p) => p.chiffres.tauxNoShow), [1 / 3, 0, 0]);
  const [tout] = serieReservations({ lignes, tranches: [periode], aujourdhui: AUJ });
  assert.equal(tout.chiffres.tauxNoShow, 1 / 6);
  assert.notEqual((1 / 3 + 0 + 0) / 3, tout.chiffres.tauxNoShow);
});

test('série : une tranche sans réservation est vide, ses taux valent null', () => {
  const serie = serieReservations({ lignes, tranches: [{ debut: '2026-10-04', fin: '2026-10-04' }, ...jours], aujourdhui: AUJ });
  assert.equal(serie[0].vide, true);
  assert.equal(serie[0].chiffres.tauxNoShow, null);
  assert.equal(serie[0].chiffres.occupation, null);
});

test('série : filtre de service, et brunch à part quand la maison en fait', () => {
  const soir = serieReservations({ lignes, tranches: [periode], aujourdhui: AUJ, service: 'soir' })[0];
  assert.equal(soir.chiffres.couverts, 6 + 5 + 8);
  const avecBrunch = [...lignes, resa('2026-10-06', 'brunch', 4, 'parti')];
  const [p] = serieReservations({ lignes: avecBrunch, tranches: [periode], aujourdhui: AUJ });
  assert.deepEqual(p.services.map((s) => s.service), ['midi', 'soir', 'brunch']);
  assert.equal(p.services[2].couverts, 4);
});

test('série : occupation sur la capacité des réglages, somme des capacités des jours', () => {
  const parametres = { horaires: { 1: { midi: true, soir: true }, 2: { midi: true, soir: true }, 3: { midi: true, soir: true } }, capacite_service: 20 };
  const serie = serieReservations({ lignes, tranches: jours, aujourdhui: AUJ, parametres });
  assert.deepEqual(serie.map((p) => p.chiffres.capacite), [40, 40, 40]);
  assert.equal(serie[0].chiffres.occupation, 10 / 40);
  const [tout] = serieReservations({ lignes, tranches: [periode], aujourdhui: AUJ, parametres });
  assert.equal(tout.chiffres.capacite, 120);
  assert.equal(tout.chiffres.occupation, 25 / 120);
});

test('série : plus de mille réservations sur un an, la somme des mois reste le total', () => {
  const beaucoup = [];
  for (let i = 0; i < 1460; i += 1) {
    const d = new Date(Date.UTC(2026, 0, 1 + Math.floor(i / 4))).toISOString().slice(0, 10);
    beaucoup.push(resa(d, i % 2 ? 'soir' : 'midi', 1 + (i % 5), ['parti', 'parti', 'no_show', 'annule'][i % 4]));
  }
  const an = { debut: '2026-01-01', fin: '2026-12-31' };
  const mois = Array.from({ length: 12 }, (_, m) => {
    const fin = new Date(Date.UTC(2026, m + 1, 0)).toISOString().slice(0, 10);
    return { debut: `2026-${String(m + 1).padStart(2, '0')}-01`, fin };
  });
  const total = computeReservationStats({ lignes: beaucoup, periode: an, comparaison: an, aujourdhui: '2027-01-02', reference: '2027-01-02' }).chiffres;
  const serie = serieReservations({ lignes: beaucoup, tranches: mois, aujourdhui: '2027-01-02' });
  assert.equal(serie.reduce((s, p) => s + p.chiffres.couverts, 0), total.couverts);
  assert.equal(serie.reduce((s, p) => s + p.chiffres.noShowTables, 0), total.noShowTables);
  assert.equal(serie.reduce((s, p) => s + p.chiffres.echuesTables, 0), total.echuesTables);
});
