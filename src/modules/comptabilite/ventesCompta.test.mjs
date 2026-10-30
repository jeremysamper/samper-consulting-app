// node --test : ventes de la Comptabilité (ventesCompta.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventesParJour, totauxVentes, joursSansChiffre, couvertureVentes, resumeVentes } from './ventesCompta.js';

test('la saisie à la main du jour remplace la caisse ; la caisse seule compte à 8,1', () => {
  const parJour = ventesParJour({
    manuel: [{ jour: '2026-10-28', taux: 8.1, montantTtc: 2650 }, { jour: '2026-10-28', taux: 2.6, montantTtc: 190 }],
    pos: [{ jour: '2026-10-28', montantTtc: 1500 }, { jour: '2026-10-28', montantTtc: 1312.4 }, { jour: '2026-10-29', montantTtc: 980.5 }],
  });
  assert.equal(parJour.length, 2);
  assert.deepEqual(parJour[0].parTaux, { 8.1: 2650, 2.6: 190 });
  assert.equal(parJour[0].source, 'manuel');
  assert.equal(parJour[0].ttc, 2840);
  assert.equal(parJour[0].posTtc, 2812.4);
  assert.deepEqual(parJour[1].parTaux, { 8.1: 980.5 });
  assert.equal(parJour[1].source, 'pos');
});

test('une saisie à zéro est un jour saisi (fermé ou sans vente)', () => {
  const parJour = ventesParJour({ manuel: [{ jour: '2026-10-26', taux: 8.1, montantTtc: 0 }], pos: [{ jour: '2026-10-26', montantTtc: 100 }] });
  assert.equal(parJour[0].source, 'manuel');
  assert.equal(parJour[0].ttc, 0);
});

test('lignes de note de séjour : hors encaissements et taxes, remise négative déduite', () => {
  const parJour = ventesParJour({
    notes: [
      { jour: '2026-10-20', type: 'nuitee', montant: 480, tvaTaux: 3.8 },
      { jour: '2026-10-20', type: 'pension', montant: 90, tvaTaux: 8.1 },
      { jour: '2026-10-20', type: 'remise', montant: -50, tvaTaux: 3.8 },
      { jour: '2026-10-20', type: 'taxe_sejour', montant: 7, tvaTaux: null },
      { jour: '2026-10-20', type: 'taxe_hebergement', montant: 1, tvaTaux: null },
      { jour: '2026-10-20', type: 'paiement', montant: -527, tvaTaux: null },
    ],
  });
  assert.deepEqual(parJour[0].parTaux, { 3.8: 430, 8.1: 90 });
  assert.equal(parJour[0].source, null);
  assert.equal(parJour[0].notesTtc, 520);
  const t = totauxVentes(parJour);
  assert.equal(t.jours.notes, 1);
  assert.equal(t.notesTtc, 520);
});

test('hors TVA arrondi sur le total de la période, pas jour par jour', () => {
  const manuel = [];
  for (let j = 1; j <= 3; j += 1) manuel.push({ jour: `2026-10-0${j}`, taux: 8.1, montantTtc: 10.01 });
  const t = totauxVentes(ventesParJour({ manuel }));
  // 30.03 / 1.081 = 27.7798... → 27.78 (jour par jour : 3 x 9.26 = 27.78 aussi ;
  // le cas suivant départage)
  assert.equal(t.ttc, 30.03);
  assert.equal(t.ht, 27.78);
  assert.equal(t.tva, 2.25);
  const t2 = totauxVentes(ventesParJour({ manuel: [{ jour: '2026-10-01', taux: 2.6, montantTtc: 1.03 }, { jour: '2026-10-02', taux: 2.6, montantTtc: 1.03 }] }));
  // 2.06 / 1.026 = 2.0078 → 2.01 ; jour par jour 1.0039 → 1.00 x 2 = 2.00
  assert.equal(t2.ht, 2.01);
  assert.equal(t2.tva, 0.05);
});

test('totaux par taux dans l\'ordre de l\'écran ; période vide = n/a', () => {
  const t = totauxVentes(ventesParJour({ manuel: [
    { jour: '2026-10-01', taux: 2.6, montantTtc: 102.6 },
    { jour: '2026-10-01', taux: 8.1, montantTtc: 1081 },
  ] }));
  assert.deepEqual(t.parTaux.map(l => l.taux), [8.1, 2.6]);
  assert.deepEqual(t.parTaux[0], { taux: 8.1, ttc: 1081, ht: 1000, tva: 81 });
  assert.deepEqual(t.parTaux[1], { taux: 2.6, ttc: 102.6, ht: 100, tva: 2.6 });
  assert.equal(t.ht, 1100);
  const vide = totauxVentes([]);
  assert.equal(vide.ttc, null);
  assert.equal(vide.ht, null);
});

test('jours sans chiffre : jours ouverts passés, aujourd\'hui seulement s\'il est saisi', () => {
  const parJour = ventesParJour({ manuel: [
    { jour: '2026-10-26', taux: 8.1, montantTtc: 1000 },
    { jour: '2026-10-28', taux: 8.1, montantTtc: 1000 },
  ] });
  const ouverts = new Set(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30']);
  const args = { parJour, joursOuverts: ouverts, debut: '2026-10-25', finEffective: '2026-10-30', aujourdhui: '2026-10-30' };
  assert.deepEqual(joursSansChiffre(args), ['2026-10-27', '2026-10-29']);
  assert.deepEqual(couvertureVentes(args), { avec: 2, attendus: 4, manquants: ['2026-10-27', '2026-10-29'] });
  const saisiAujourdhui = ventesParJour({ manuel: [{ jour: '2026-10-30', taux: 8.1, montantTtc: 5 }] });
  assert.equal(couvertureVentes({ ...args, parJour: saisiAujourdhui }).avec, 1);
});

test('aucun horaire sur la période : tous les jours comptent', () => {
  const r = resumeVentes({ parJour: [], joursOuverts: new Set(['2026-09-12']), debut: '2026-10-01', finEffective: '2026-10-04', aujourdhui: '2026-10-30' });
  assert.equal(r.attendus, 4);
  assert.equal(r.manquants.length, 4);
  assert.equal(r.ttc, null);
});
