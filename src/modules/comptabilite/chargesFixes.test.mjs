// node --test : charges fixes de la Comptabilité (chargesFixes.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  coutSurPeriode, echeancesCharge, chargesSurPeriode, doublonsCharges, moyenneMensuelle, memeFournisseur, coutMensuel,
} from './chargesFixes.js';

const loyer = { id: 'c1', libelle: 'Loyer', categorie: 'loyer', montant: 6500, tvaTaux: 0, periodicite: 'mensuelle', debut: '2026-01-01', fin: null, jourEcheance: 1 };
const assurance = { id: 'c2', libelle: 'Assurances', categorie: 'assurances', montant: 4200, tvaTaux: 0, periodicite: 'annuelle', debut: '2026-01-01', fin: null, jourEcheance: 31 };
const energie = { id: 'c3', libelle: 'Électricité et chauffage', categorie: 'energie', montant: 1450, tvaTaux: 8.1, periodicite: 'trimestrielle', debut: '2026-01-01', fin: null, jourEcheance: 15, fournisseur: 'Romande Énergie' };

test('loyer mensuel : 6 500.00 sur octobre', () => {
  assert.deepEqual(coutSurPeriode(loyer, '2026-10-01', '2026-10-31'), { ttc: 6500, ht: 6500, tva: 0 });
});

test('assurance annuelle de 4 200 : 350.00 par mois', () => {
  assert.equal(coutMensuel(assurance), 350);
  assert.equal(coutSurPeriode(assurance, '2026-02-01', '2026-02-28').ttc, 350);
  assert.equal(coutSurPeriode(assurance, '2026-01-01', '2026-12-31').ttc, 4200);
});

test('mois partiel au prorata de ses jours, TVA sortie du TTC', () => {
  // 30 jours sur 31 d'octobre : 6 500 x 30 / 31
  assert.equal(coutSurPeriode(loyer, '2026-10-01', '2026-10-30').ttc, 6290.32);
  // énergie : 1 450 x 4 / 12 = 483.33 par mois TTC, à 8,1 %
  assert.deepEqual(coutSurPeriode(energie, '2026-10-01', '2026-10-31'), { ttc: 483.33, ht: 447.11, tva: 36.22 });
});

test('charge close ou pas encore commencée', () => {
  const close = { ...loyer, fin: '2026-10-15' };
  assert.equal(coutSurPeriode(close, '2026-10-01', '2026-10-31').ttc, round(6500 * 15 / 31));
  assert.equal(coutSurPeriode(close, '2026-11-01', '2026-11-30').ttc, 0);
  const future = { ...loyer, debut: '2026-12-01' };
  assert.equal(coutSurPeriode(future, '2026-10-01', '2026-10-31').ttc, 0);
});

test('échéance du 31 en février, trimestrielle depuis le mois du début', () => {
  const mensuelle31 = { ...loyer, jourEcheance: 31 };
  assert.deepEqual(echeancesCharge(mensuelle31, '2026-02-01', '2026-03-31').map(e => e.date), ['2026-02-28', '2026-03-31']);
  assert.deepEqual(echeancesCharge(energie, '2026-01-01', '2026-12-31').map(e => e.date), ['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);
  const sansJour = { ...loyer, jourEcheance: null, debut: '2026-03-12' };
  assert.deepEqual(echeancesCharge(sansJour, '2026-03-01', '2026-04-30').map(e => e.date), ['2026-03-12', '2026-04-12']);
  assert.equal(echeancesCharge(energie, '2026-10-01', '2026-10-31')[0].montant, 1450);
});

test('toutes les charges d\'une période ; aucune saisie = n/a', () => {
  const r = chargesSurPeriode([loyer, assurance, energie], '2026-10-01', '2026-10-31');
  assert.equal(r.ttc, 7333.33);
  assert.equal(r.ht, 7297.11);
  assert.equal(r.lignes.length, 3);
  assert.deepEqual(r.parTaux.map(x => x.taux), [8.1, 0]);
  const vide = chargesSurPeriode([], '2026-10-01', '2026-10-31');
  assert.equal(vide.ht, null);
  assert.equal(vide.saisies, false);
});

test('moyenne mensuelle des charges actives', () => {
  assert.deepEqual(moyenneMensuelle([loyer, assurance, { ...energie, fin: '2026-06-30' }], '2026-10-30'), { n: 2, ttc: 6850 });
});

test('doublon Romande Énergie : facture du même fournisseur pendant la charge', () => {
  const factures = [
    { id: 'f1', fournisseurNom: 'Romande Energie SA', dateDocument: '2026-10-18' },
    { id: 'f2', fournisseurNom: 'Transgourmet', dateDocument: '2026-10-18' },
    { id: 'f3', fournisseurNom: 'Romande Énergie', dateDocument: '2025-12-18' },
  ];
  const d = doublonsCharges([loyer, energie], factures);
  assert.equal(d.length, 1);
  assert.equal(d[0].facture.id, 'f1');
  assert.equal(d[0].charge.id, 'c3');
  assert.equal(memeFournisseur('SIG', 'SIG'), false);
  assert.equal(memeFournisseur('Fellay Vins', 'Fellay'), true);
});

function round(n) { return Math.round(n * 100) / 100; }
