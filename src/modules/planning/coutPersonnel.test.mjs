// node --test : coût prévu du personnel et part du chiffre d'affaires
// (coutPersonnel.js). Aujourd'hui : mercredi 18.11.2026 ; semaine affichée :
// lundi 16 au dimanche 22.11.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ventesParJour } from '../comptabilite/ventesCompta.js';
import {
  caPrevu, coutPrevu, heuresSemainePour, joursDe, memesJoursAvant, partDuCa, tauxHoraireDuJour,
} from './coutPersonnel.js';

const AUJ = '2026-11-18';
const JOURS = joursDe('2026-11-16', '2026-11-22');
let n = 0;
const h = (userId, date, debut, fin, pause = 0) => ({ id: `s${(n += 1)}`, userId, date, debut, fin, pause });
const horaire = (profileId, montant, debut = '2026-01-01', fin = null) => ({ profileId, mode: 'horaire', montant, treizieme: true, debut, fin });
const mensuel = (profileId, montant, extra = {}) => ({ profileId, mode: 'mensuel', montant, treizieme: true, debut: '2026-01-01', fin: null, ...extra });
const contrat = (profileId, taux, heuresSemaine = 42) => ({ profileId, taux, heuresSemaine, debut: '2026-01-01', fin: null });
// Ventes TTC à 8,1 % : 1 081 TTC = 1 000 hors TVA.
const vente = (jour, montantTtc) => ({ jour, taux: 8.1, montantTtc, source: 'manuel' });
const ventes = (lignes) => ventesParJour({ manuel: lignes });
const proche = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} attendu ${b}`);

test('jours de la semaine et mêmes jours avant aujourd\'hui', () => {
  assert.deepEqual(JOURS, ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
  // Vendredi 20 : les 4 derniers vendredis avant le mercredi 18.
  assert.deepEqual(memesJoursAvant('2026-11-20', AUJ), ['2026-11-13', '2026-11-06', '2026-10-30', '2026-10-23']);
  // Aujourd'hui : jamais lui-même, les 4 mercredis d'avant.
  assert.deepEqual(memesJoursAvant(AUJ, AUJ), ['2026-11-11', '2026-11-04', '2026-10-28', '2026-10-21']);
  // Un lundi de la semaine suivante : les 4 derniers lundis passés.
  assert.deepEqual(memesJoursAvant('2026-11-23', AUJ), ['2026-11-16', '2026-11-09', '2026-11-02', '2026-10-26']);
});

test('taux horaire : 8 h à 30 CHF, charges de 16 % ajoutées', () => {
  const r = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-16', '09:00', '17:30', 30)], salaires: [horaire('a', 30)], chargesPct: 16 });
  assert.equal(r.parJour['2026-11-16'].minutes, 480);
  assert.equal(r.parJour['2026-11-16'].cout, 278.4);
  assert.equal(r.total, 278.4);
  assert.deepEqual(r.sansTaux, []);
  assert.equal(r.chargesPct, 16);
});

test('salaire mensuel : ramené à l\'heure par le contrat, sinon par la durée CCNT', () => {
  // 5 000 x 13 / 12 = 5 416,67 par mois ; / (52 / 12) / 42 h = 29,76 de l'heure.
  const t = tauxHoraireDuJour({ salaires: [mensuel('a', 5000)], contrats: [contrat('a', 100)], jour: '2026-11-16', heuresEtab: 45 });
  assert.equal(t.source, 'mensuel');
  assert.equal(t.base, 'contrat');
  proche(t.taux, 65000 / 2184);
  // Contrat à 50 % : 21 h par semaine, l'heure coûte le double.
  const mi = tauxHoraireDuJour({ salaires: [mensuel('a', 5000)], contrats: [contrat('a', 50)], jour: '2026-11-16', heuresEtab: 45 });
  proche(mi.taux, 2 * 65000 / 2184);
  // Sans contrat : la durée CCNT de l'établissement (45 h).
  const ccnt = tauxHoraireDuJour({ salaires: [mensuel('a', 5000)], contrats: [], jour: '2026-11-16', heuresEtab: 45 });
  assert.equal(ccnt.base, 'ccnt');
  proche(ccnt.taux, 65000 / (52 * 45));
  // Sans 13e salaire.
  const sans13 = tauxHoraireDuJour({ salaires: [mensuel('a', 5200, { treizieme: false })], contrats: [contrat('a', 100)], jour: '2026-11-16', heuresEtab: 42 });
  proche(sans13.taux, 5200 * 12 / 52 / 42);
  // Coût : 8 h au taux du contrat, charges de 16 %.
  const r = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-17', '09:00', '17:30', 30)], salaires: [mensuel('a', 5000)], contrats: [contrat('a', 100)], chargesPct: 16, heuresEtab: 45 });
  assert.equal(r.parJour['2026-11-17'].cout, Math.round(65000 / 2184 * 8 * 1.16 * 100) / 100);
  assert.equal(heuresSemainePour(null, 0), null);
});

test('pause déduite : 10 h à 15 h avec une heure de pause comptent 4 h', () => {
  const r = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-18', '10:00', '15:00', 60)], salaires: [horaire('a', 25)], chargesPct: 0 });
  assert.equal(r.parJour['2026-11-18'].minutes, 240);
  assert.equal(r.parJour['2026-11-18'].cout, 100);
});

test('service coupé : midi et soir le même jour s\'additionnent, l\'intervalle ne compte pas', () => {
  const shifts = [h('a', '2026-11-19', '10:00', '14:00'), h('a', '2026-11-19', '18:00', '22:30', 30)];
  const r = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 10 });
  assert.equal(r.parJour['2026-11-19'].minutes, 480);
  assert.equal(r.parJour['2026-11-19'].cout, 264);
});

test('personne sans taux : heures comptées à part et nommées, jamais chiffrées à zéro', () => {
  const shifts = [h('a', '2026-11-16', '09:00', '17:00'), h('b', '2026-11-16', '09:00', '13:00'), h('b', '2026-11-17', '09:00', '15:00')];
  const r = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 0 });
  assert.equal(r.parJour['2026-11-16'].cout, 240);
  assert.equal(r.parJour['2026-11-16'].minutesSansTaux, 240);
  assert.equal(r.minutesSansTaux, 600);
  assert.deepEqual(r.sansTaux, [{ userId: 'b', minutes: 600 }]);
  assert.equal(r.total, 240);
  // Avec le coût horaire moyen de la maison : chiffrée, charges déjà comprises.
  const m = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 16, coutMoyen: 40 });
  assert.deepEqual(m.sansTaux, []);
  assert.deepEqual(m.auCoutMoyen, ['b']);
  assert.equal(m.parJour['2026-11-17'].cout, 240);
  assert.equal(m.parJour['2026-11-16'].cout, Math.round((8 * 30 * 1.16 + 4 * 40) * 100) / 100);
});

test('réglages illisibles : coût brut, sans charges', () => {
  const r = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-16', '09:00', '17:00')], salaires: [horaire('a', 30)], chargesPct: null });
  assert.equal(r.total, 240);
  assert.equal(r.chargesPct, null);
});

test('horaires hors de la semaine, sans personne ou de durée nulle : ignorés', () => {
  const shifts = [h('a', '2026-11-23', '09:00', '17:00'), h(null, '2026-11-16', '09:00', '17:00'), h('a', '2026-11-16', '09:00', '09:00')];
  const r = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 16 });
  assert.equal(r.total, 0);
  assert.equal(r.minutes, 0);
});

test('CA en échec : aucun chiffre, aucune part, jamais un CA nul', () => {
  const cout = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-16', '09:00', '17:00')], salaires: [horaire('a', 30)], chargesPct: 0 });
  const ca = caPrevu({ jours: JOURS, ventes: [], statut: 'error', aujourdhui: AUJ });
  assert.deepEqual(ca.parJour, {});
  const p = partDuCa({ jours: JOURS, cout, ca });
  assert.equal(p.total.part, null);
  assert.equal(p.total.ht, null);
  assert.equal(p.total.raison, 'ca_non_lu');
  assert.equal(p.parJour['2026-11-16'].raison, 'ca_non_lu');
  assert.equal(p.parJour['2026-11-16'].ht, null);
  assert.equal(p.total.cout, 240);
  // En cours de lecture : même chose, raison « chargement ».
  assert.equal(partDuCa({ jours: JOURS, cout, ca: caPrevu({ jours: JOURS, statut: 'loading', aujourdhui: AUJ }) }).total.raison, 'chargement');
});

test('CA à zéro : la part ne se calcule pas, la raison le dit', () => {
  const cout = coutPrevu({ jours: JOURS, shifts: [h('a', '2026-11-16', '09:00', '17:00')], salaires: [horaire('a', 30)], chargesPct: 0 });
  const ca = caPrevu({ jours: JOURS, ventes: ventes([vente('2026-11-16', 0)]), statut: 'ready', aujourdhui: AUJ });
  assert.deepEqual(ca.parJour['2026-11-16'], { ht: 0, base: 'realise' });
  const p = partDuCa({ jours: JOURS, cout, ca });
  assert.equal(p.parJour['2026-11-16'].raison, 'ca_nul');
  assert.equal(p.total.part, null);
  assert.equal(p.total.raison, 'ca_nul');
  assert.equal(p.total.ht, 0);
});

test('jour passé : CA réalisé ; sans chiffre, « manquant » et hors de la part', () => {
  const shifts = [h('a', '2026-11-16', '09:00', '17:00'), h('a', '2026-11-17', '09:00', '17:00')];
  const cout = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 0 });
  const ca = caPrevu({ jours: JOURS, ventes: ventes([vente('2026-11-16', 1081)]), statut: 'ready', aujourdhui: AUJ });
  assert.deepEqual(ca.parJour['2026-11-16'], { ht: 1000, base: 'realise' });
  assert.deepEqual(ca.parJour['2026-11-17'], { ht: null, base: 'manquant' });
  const p = partDuCa({ jours: JOURS, cout, ca });
  proche(p.parJour['2026-11-16'].part, 0.24);
  assert.equal(p.parJour['2026-11-17'].raison, 'sans_ca');
  assert.deepEqual(p.joursSansCa, ['2026-11-17']);
  // La part de la semaine ne prend que le jour qui a un chiffre ; le coût total garde les deux.
  assert.equal(p.total.cout, 480);
  assert.equal(p.total.coutBase, 240);
  assert.equal(p.total.ht, 1000);
  proche(p.total.part, 0.24);
  assert.deepEqual(p.bases, { realise: 1, moyenne: 0 });
});

test('jour à venir : moyenne des mêmes jours sur les 4 dernières semaines', () => {
  const lignes = [
    vente('2026-11-13', 1081), vente('2026-11-06', 2162), vente('2026-10-30', 1081), vente('2026-10-23', 2162),
    // Mercredis : 3 sur 4 ont un chiffre (le 04.11 manque).
    vente('2026-11-11', 1081), vente('2026-10-28', 1081), vente('2026-10-21', 4324),
    // Le vendredi de la semaine affichée n'est pas encore passé : un chiffre saisi
    // à l'avance ne remplace pas la moyenne.
    vente('2026-11-20', 99999),
  ];
  const ca = caPrevu({ jours: JOURS, ventes: ventes(lignes), statut: 'ready', aujourdhui: AUJ });
  assert.deepEqual(ca.parJour['2026-11-20'], { ht: 1500, base: 'moyenne', semaines: 4 });
  assert.deepEqual(ca.parJour[AUJ], { ht: 2000, base: 'moyenne', semaines: 3 });
  // Dimanche : aucun chiffre sur les 4 derniers dimanches.
  assert.deepEqual(ca.parJour['2026-11-22'], { ht: null, base: 'sans_moyenne' });

  const shifts = [h('a', '2026-11-20', '09:00', '19:00'), h('a', '2026-11-22', '10:00', '14:00')];
  const cout = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 0 });
  const p = partDuCa({ jours: JOURS, cout, ca });
  proche(p.parJour['2026-11-20'].part, 0.2);
  assert.equal(p.parJour['2026-11-20'].semaines, 4);
  assert.deepEqual(p.joursSansCa, ['2026-11-22']);
  assert.deepEqual(p.bases, { realise: 0, moyenne: 1 });
  proche(p.total.part, 0.2);
  // Un jour sans horaire n'entre pas dans la part, même avec un chiffre moyen.
  assert.equal(p.parJour[AUJ].raison, 'sans_horaire');
});

test('notes de séjour : elles ne couvrent un jour que pour un hôtel sans saisie ni caisse', () => {
  const lignes = ventesParJour({ notes: [{ jour: '2026-11-16', type: 'nuitee', montant: 1038, tvaTaux: 3.8 }] });
  assert.deepEqual(caPrevu({ jours: JOURS, ventes: lignes, aujourdhui: AUJ }).parJour['2026-11-16'], { ht: null, base: 'manquant' });
  assert.deepEqual(caPrevu({ jours: JOURS, ventes: lignes, aujourdhui: AUJ, notesCouvrent: true }).parJour['2026-11-16'], { ht: 1000, base: 'realise' });
});

test('jour dont toutes les heures sont sans taux : hors de la part, jamais 0 %', () => {
  const shifts = [h('a', '2026-11-16', '09:00', '17:00'), h('b', '2026-11-16', '09:00', '13:00'), h('b', '2026-11-17', '09:00', '17:00')];
  const cout = coutPrevu({ jours: JOURS, shifts, salaires: [horaire('a', 30)], chargesPct: 0 });
  const ca = caPrevu({ jours: JOURS, ventes: ventes([vente('2026-11-16', 1081), vente('2026-11-17', 1081)]), aujourdhui: AUJ });
  const p = partDuCa({ jours: JOURS, cout, ca });
  // Mardi : seule b, sans taux, travaille.
  assert.equal(p.parJour['2026-11-17'].part, null);
  assert.equal(p.parJour['2026-11-17'].raison, 'sans_taux');
  // Lundi : a est chiffrée, b ne l'est pas ; le jour entre dans la part.
  proche(p.parJour['2026-11-16'].part, 0.24);
  assert.equal(p.total.ht, 1000);
  proche(p.total.part, 0.24);
  // Une semaine où personne n'a de taux : la raison le dit.
  const rien = coutPrevu({ jours: JOURS, shifts: [h('b', '2026-11-17', '09:00', '17:00')], salaires: [] });
  assert.equal(partDuCa({ jours: JOURS, cout: rien, ca }).total.raison, 'sans_taux');
});

test('semaine sans aucun horaire : pas de part, raison « sans horaire »', () => {
  const cout = coutPrevu({ jours: JOURS, shifts: [], salaires: [] });
  const ca = caPrevu({ jours: JOURS, ventes: ventes([vente('2026-11-16', 1081)]), aujourdhui: AUJ });
  const p = partDuCa({ jours: JOURS, cout, ca });
  assert.equal(p.total.raison, 'sans_horaire');
  assert.equal(p.total.part, null);
});
