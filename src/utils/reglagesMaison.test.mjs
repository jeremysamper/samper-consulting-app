// node --test : réglages de la maison, lecture prudente et fermetures.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAUTS, jourIsoDe, maisonFermee, normaliserLigne, normaliserFermetures, normaliserObjectifs, normaliserPointage, versBase } from './reglagesMaison.js';

// Cas partagés avec la copie TypeScript de l'évaluateur d'alertes
// (supabase/functions/alerts-evaluator/helpers/fermetures.ts) : mêmes entrées,
// mêmes réponses.
export const CAS_FERMETURES = [
  { f: { jours_fermes: [1] }, date: '2026-11-16', service: null, ferme: true },   // lundi
  { f: { jours_fermes: [1] }, date: '2026-11-17', service: null, ferme: false },  // mardi
  { f: { periodes: [{ du: '2026-12-24', au: '2027-01-05', motif: 'Vacances' }] }, date: '2026-12-31', service: null, ferme: true },
  { f: { periodes: [{ du: '2026-12-24', au: '2027-01-05' }] }, date: '2027-01-06', service: null, ferme: false },
  { f: { services_fermes: { 2: ['soir'] } }, date: '2026-11-17', service: 'soir', ferme: true },
  { f: { services_fermes: { 2: ['soir'] } }, date: '2026-11-17', service: 'midi', ferme: false },
  { f: { services_fermes: { 2: ['soir'] } }, date: '2026-11-17', service: null, ferme: false },
  { f: {}, date: '2026-11-22', service: null, ferme: false },
  { f: { jours_fermes: [7] }, date: '2026-11-22', service: null, ferme: true },     // dimanche
];

test('jour ISO sans heure locale', () => {
  assert.equal(jourIsoDe('2026-11-16'), 1);
  assert.equal(jourIsoDe('2026-11-22'), 7);
  assert.equal(jourIsoDe('2026-03-29'), 7); // passage à l'heure d'été
});

test('fermetures : jours, périodes, services', () => {
  for (const c of CAS_FERMETURES) {
    assert.equal(maisonFermee(normaliserFermetures(c.f), c.date, c.service), c.ferme, JSON.stringify(c));
  }
});

test('lecture prudente : ligne absente ou illisible = défauts', () => {
  assert.deepEqual(normaliserLigne(null), DEFAUTS);
  assert.deepEqual(normaliserLigne({ fermetures: 'x', pointage: null, objectifs: 3 }), DEFAUTS);
  const f = normaliserFermetures({ jours_fermes: [1, 1, 9, '3'], services_fermes: { 2: ['soir', 'nuit'], 8: ['midi'] }, periodes: [{ du: '2026-02-01', au: '2026-01-01' }, { du: '2026-01-01', au: '2026-01-02', motif: 7 }] });
  assert.deepEqual(f, { joursFermes: [1, 3], servicesFermes: { 2: ['soir'] }, periodes: [{ du: '2026-01-01', au: '2026-01-02', motif: '' }] });
  assert.deepEqual(normaliserPointage({ arrondi_min: 7, avance: 'autre' }), DEFAUTS.pointage);
  assert.deepEqual(normaliserPointage({ arrondi_min: 15, avance: 'prevue' }), { arrondiMin: 15, avance: 'prevue', clotureAutoH: null });
  assert.deepEqual(normaliserObjectifs({ matiere_pct: '28,5', personnel_pct: 120, ca_mensuel_ht: 90000 }), { matierePct: 28.5, personnelPct: null, caMensuelHt: 90000 });
});

test("clôture d'office : un entier de 8 à 16, sinon jamais", () => {
  assert.equal(DEFAUTS.pointage.clotureAutoH, null);
  assert.equal(normaliserPointage({}).clotureAutoH, null);
  assert.equal(normaliserPointage({ cloture_auto_h: 8 }).clotureAutoH, 8);
  assert.equal(normaliserPointage({ cloture_auto_h: 16 }).clotureAutoH, 16);
  for (const v of [7, 17, 12.5, '12', null, true, -1]) {
    assert.equal(normaliserPointage({ cloture_auto_h: v }).clotureAutoH, null, String(v));
  }
  assert.deepEqual(versBase.pointage({ arrondiMin: 0, avance: 'pointee', clotureAutoH: null }), { arrondi_min: 0, avance: 'pointee', cloture_auto_h: null });
  // Un bloc écrit sans le champ (valeur d'avant ce réglage) envoie « jamais ».
  assert.equal(versBase.pointage({ arrondiMin: 0, avance: 'pointee' }).cloture_auto_h, null);
});

test('aller-retour avec la base : rien ne se perd', () => {
  const lisible = {
    fermetures: { joursFermes: [1], servicesFermes: { 2: ['soir'] }, periodes: [{ du: '2026-12-24', au: '2027-01-05', motif: 'Vacances' }] },
    pointage: { arrondiMin: 5, avance: 'prevue', clotureAutoH: 12 },
    objectifs: { matierePct: 28, personnelPct: 35, caMensuelHt: 120000 },
  };
  const ligne = Object.fromEntries([['fermetures', versBase.fermetures(lisible.fermetures)], ['pointage', versBase.pointage(lisible.pointage)], ['objectifs', versBase.objectifs(lisible.objectifs)]]);
  assert.deepEqual(normaliserLigne(JSON.parse(JSON.stringify(ligne))), lisible);
});
