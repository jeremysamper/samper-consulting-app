// node --test : durée d'un horaire (dureeHoraire.js), et le même nombre sur
// chaque écran qui la lit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dureeHeures, dureeMinutes } from './dureeHoraire.js';
import { calcHeures, heuresFaites } from './soldesHeures.js';
import { heuresSegment } from './planningModeles.js';
import { payloadPersonnes, payloadPointages } from './planningExport.js';
import { chiffresGestion } from '../dashboard/tableauLogique.js';
import { heuresHoraire } from '../comptabilite/personnelCompta.js';

test('dans la journée : fin moins début moins la pause', () => {
  assert.equal(dureeHeures('10:00', '15:00'), 5);
  assert.equal(dureeHeures('16:00', '23:00', 45), 6.25);
  assert.equal(dureeMinutes('09:15', '17:40', 30), 475);
});

test('fin avant le début : le lendemain', () => {
  assert.equal(dureeHeures('08:00', '01:30'), 17.5);
  assert.equal(dureeHeures('22:00', '02:00'), 4);
  assert.equal(dureeHeures('18:00', '00:00'), 6);
  assert.equal(dureeHeures('08:00', '01:30', 30), 17);
});

test('fin égale au début : 0, jamais 24 h', () => {
  assert.equal(dureeHeures('00:00', '00:00'), 0);
  // Pointage hors planning : l'horaire naît avec fin = début.
  assert.equal(dureeHeures('14:02', '14:02'), 0);
});

test('pause plus longue que l\'horaire : 0, jamais négatif', () => {
  assert.equal(dureeHeures('10:00', '10:30', 45), 0);
});

test('heure absente ou illisible : null ; secondes de la base acceptées', () => {
  assert.equal(dureeHeures(null, '15:00'), null);
  assert.equal(dureeHeures('10:00', ''), null);
  assert.equal(dureeHeures('dix', '15:00'), null);
  assert.equal(dureeHeures('10:00:00', '15:30:00'), 5.5);
});

test('08:00 à 01:30, pause 30 : 17 h sur la grille, le relevé, les exports, le tableau de bord et la Comptabilité', () => {
  const s = { id: 'n1', userId: 'u1', date: '2026-11-10', debut: '08:00', fin: '01:30', pause: 30, pointageDebut: '08:00', pointageFin: '01:30' };
  assert.equal(calcHeures(s.debut, s.fin, s.pause), 17);                 // grille, totaux, relevé CCNT
  assert.equal(heuresFaites([s]), 17);                                   // soldes, feuille Soldes
  assert.equal(heuresSegment(s), 17);                                    // Mon planning, Excel
  const pdf = payloadPersonnes({ debut: s.date, fin: s.date, personnes: [{ id: 'u1' }], shifts: [s], nomDe: () => 'Sara' });
  assert.equal(pdf.personnes[0].total, '17 h');                          // PDF de l'équipe
  const pointages = payloadPointages({ debut: s.date, fin: s.date, personnesIds: ['u1'], shifts: [s], nomDe: () => 'Sara' });
  assert.equal(pointages.jours[0].lignes[0].duree, '17 h');              // PDF des pointages
  assert.equal(pointages.jours[0].lignes[0].ecart, '');
  assert.equal(chiffresGestion({ pertes: [], shifts: [s], couverts: [], aujourdhui: s.date }).heures, 17); // carte du tableau de bord
  assert.deepEqual(heuresHoraire(s, '2026-11-15'), { heures: 17, prevues: false, apresMinuit: false });   // Comptabilité, Statistiques
});
