// node --test : logique pure du tableau de bord (tableauLogique.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aFaire, chiffresGestion, equipeParService, etatDuService, jourIso, minutesEcoulees, reperesDuJour, serviceDuShift,
} from './tableauLogique.js';

const JOUR = '2026-10-30'; // un vendredi
const DEMAIN = '2026-10-31';
const h = (hhmm) => { const [a, b] = hhmm.split(':').map(Number); return a * 60 + b; };
const sh = (id, userId, debut, fin, typeShift = 'simple', extra = {}) => ({
  id, userId, date: JOUR, debut, fin, pause: 30, poste: '', typeShift, pointageDebut: null, pointageFin: null, note: '', ...extra,
});

// Midi 12:00 à 13:30, soir 19:00 à 21:00, tous les jours de la semaine.
const PARAMETRES = {
  horaires: Object.fromEntries(['1', '2', '3', '4', '5', '6', '7'].map((j) => [j, { midi: { de: '12:00', a: '13:30' }, soir: { de: '19:00', a: '21:00' } }])),
  jours_fermes: [],
  services_fermes: {},
};
const COUVERTS = { midi: 42, soir: 68, brunch: 0, total: 110 };
const COUVERTS_DEMAIN = { midi: 35, soir: 54, brunch: 0, total: 89 };
const etat = (heure, extra = {}) => etatDuService({
  couverts: COUVERTS, couvertsDemain: COUVERTS_DEMAIN, parametres: PARAMETRES, aujourdhui: JOUR, maintenant: h(heure), ...extra,
});

test('minutesEcoulees : horloge en retard, service passé minuit', () => {
  assert.equal(minutesEcoulees(h('10:52'), h('11:30')), 38);
  // Pointage confirmé à 10:52, appareil à 10:50 : 0, jamais 23 h 58.
  assert.equal(minutesEcoulees(h('10:52'), h('10:50')), 0);
  assert.equal(minutesEcoulees(h('10:52'), h('09:52')), 0);
  // Arrivée à 22:00, il est 01:30 : 3 h 30.
  assert.equal(minutesEcoulees(h('22:00'), h('01:30')), 210);
});

test('serviceDuShift : le type posé, sinon le début avant 16 h', () => {
  assert.equal(serviceDuShift(sh('a', 'u', '18:00', '22:00', 'midi')), 'midi');
  assert.equal(serviceDuShift(sh('a', 'u', '09:00', '14:00', 'soir')), 'soir');
  assert.equal(serviceDuShift(sh('a', 'u', '08:00', '15:00')), 'midi');
  assert.equal(serviceDuShift(sh('a', 'u', '17:00', '23:00')), 'soir');
});

test('equipeParService : un service coupé dans les deux groupes, groupe vide retiré', () => {
  const shifts = [
    sh('k1', 'karim', '09:00', '14:30', 'midi'),
    sh('k2', 'karim', '18:00', '22:30', 'soir'),
    sh('l1', 'lea', '08:00', '15:00', 'midi'),
    { ...sh('x', 'autre', '10:00', '15:00', 'midi'), date: DEMAIN },
  ];
  const groupes = equipeParService(shifts, JOUR);
  assert.deepEqual(groupes.map((g) => g.id), ['midi', 'soir']);
  assert.deepEqual(groupes[0].personnes.map((p) => p.userId), ['lea', 'karim']);
  assert.deepEqual(groupes[0].personnes[1].shifts.map((s) => s.id), ['k1']);
  assert.deepEqual(groupes[1].personnes.map((p) => p.userId), ['karim']);
  assert.deepEqual(groupes[1].personnes[0].shifts.map((s) => s.id), ['k2']);

  const midiSeul = equipeParService([sh('l1', 'lea', '08:00', '15:00', 'midi')], JOUR);
  assert.deepEqual(midiSeul.map((g) => g.id), ['midi']);
  assert.deepEqual(equipeParService([], JOUR), []);
});

test('etatDuService : compte à rebours, service en cours, journée terminée', () => {
  assert.deepEqual(etat('10:50'), { etat: 'a_venir', service: 'midi', dans: 70, heure: '12:00', couverts: 42, demain: null });
  assert.deepEqual(etat('08:00'), { etat: 'a_venir', service: 'midi', dans: 240, heure: '12:00', couverts: 42, demain: null });
  assert.deepEqual(etat('12:30'), { etat: 'en_cours', service: 'midi', dans: null, heure: '12:00', couverts: 42, demain: null });
  // Fin estimée du midi : 13:30 + 90 min = 15:00 ; à 15:30 vient le soir.
  assert.deepEqual(etat('14:59').etat, 'en_cours');
  assert.deepEqual(etat('15:30'), { etat: 'a_venir', service: 'soir', dans: 210, heure: '19:00', couverts: 68, demain: null });
  const fin = etat('23:00');
  assert.equal(fin.etat, 'termine');
  assert.equal(fin.service, null);
  assert.deepEqual(fin.demain, COUVERTS_DEMAIN);
});

test('etatDuService : jour fermé, service fermé ce jour', () => {
  const vide = { midi: 0, soir: 0, brunch: 0, total: 0 };
  const soirSeul = { midi: 0, soir: 68, brunch: 0, total: 68 };
  assert.equal(etat('10:50', { couverts: vide, parametres: { ...PARAMETRES, jours_fermes: [JOUR] } }).etat, 'ferme');
  const sansMidi = etat('10:50', { couverts: soirSeul, parametres: { ...PARAMETRES, services_fermes: { [JOUR]: ['midi'] } } });
  assert.deepEqual(sansMidi, { etat: 'a_venir', service: 'soir', dans: 490, heure: '19:00', couverts: 68, demain: null });
  // Fermé un autre jour : rien ne change aujourd'hui.
  assert.equal(etat('10:50', { parametres: { ...PARAMETRES, services_fermes: { [DEMAIN]: ['midi'] } } }).service, 'midi');
});

test('etatDuService : fermé en ligne mais avec des couverts (privatisation, groupe)', () => {
  // Jour fermé à la réservation en ligne, 110 couverts : jamais « fermé »,
  // et sans compte à rebours.
  const jourFerme = etat('10:50', { parametres: { ...PARAMETRES, jours_fermes: [JOUR] } });
  assert.deepEqual(jourFerme, { etat: 'sans_heure', service: 'midi', dans: null, heure: null, couverts: 42, demain: null });
  assert.equal(etat('15:30', { parametres: { ...PARAMETRES, jours_fermes: [JOUR] } }).service, 'soir');
  // Midi fermé en ligne avec 42 couverts midi : le midi reste le prochain service.
  const midiComplet = etat('10:50', { parametres: { ...PARAMETRES, services_fermes: { [JOUR]: ['midi'] } } });
  assert.deepEqual(midiComplet, { etat: 'a_venir', service: 'midi', dans: 70, heure: '12:00', couverts: 42, demain: null });
});

test('etatDuService : sans paramètres, jamais d\'heure inventée', () => {
  const avant = etat('10:50', { parametres: null });
  assert.deepEqual(avant, { etat: 'sans_heure', service: 'midi', dans: null, heure: null, couverts: 42, demain: null });
  const apres = etat('15:30', { parametres: null });
  assert.deepEqual(apres, { etat: 'sans_heure', service: 'soir', dans: null, heure: null, couverts: 68, demain: null });
  assert.equal(etat('22:30', { parametres: null }).etat, 'termine');
  // Paramètres sans horaire pour ce jour : même règle.
  assert.equal(etat('10:50', { parametres: { ...PARAMETRES, horaires: {} } }).etat, 'sans_heure');
  // Brunch seul avant 15 h.
  const brunch = etat('10:00', { parametres: null, couverts: { midi: 0, soir: 0, brunch: 24, total: 24 } });
  assert.equal(brunch.service, 'brunch');
  assert.equal(brunch.couverts, 24);
});

test('etatDuService : aucun couvert', () => {
  const vide = { midi: 0, soir: 0, brunch: 0, total: 0 };
  assert.equal(etat('10:50', { parametres: null, couverts: vide }).etat, 'aucun');
  // Avec des horaires, le compte à rebours reste, à zéro couvert.
  assert.deepEqual(etat('10:50', { couverts: vide }), { etat: 'a_venir', service: 'midi', dans: 70, heure: '12:00', couverts: 0, demain: null });
});

test('etatDuService : un dimanche se lit sur la clé 7', () => {
  const dimanche = '2026-11-01';
  assert.equal(jourIso(dimanche), '7');
  assert.equal(jourIso('2026-11-02'), '1');
  const parametres = { horaires: { 7: { brunch: { de: '10:00', a: '13:00' } } }, jours_fermes: [], services_fermes: {} };
  const r = etatDuService({ couverts: { midi: 0, soir: 0, brunch: 24, total: 24 }, parametres, aujourdhui: dimanche, maintenant: h('09:00') });
  assert.deepEqual(r, { etat: 'a_venir', service: 'brunch', dans: 60, heure: '10:00', couverts: 24, demain: null });
  // Le samedi (clé 6) n'a pas d'horaire : sans heure.
  const samedi = etatDuService({ couverts: { midi: 10, soir: 0, brunch: 0, total: 10 }, parametres, aujourdhui: DEMAIN, maintenant: h('09:00') });
  assert.equal(samedi.etat, 'sans_heure');
});

test('reperesDuJour : chiffres, détail en parties', () => {
  const r = reperesDuJour({
    couverts: COUVERTS,
    groupes: [{ id: 'g', nbPax: 14, heure: '19:30' }],
    equipe: [{ userId: 'a' }, { userId: 'b' }],
    absents: [{ userId: 'c' }],
    absencesLues: true,
    avecCouverts: true, avecGroupes: true, avecPlanning: true,
  });
  assert.deepEqual(r.map((x) => [x.id, x.page, x.valeur, x.vide, x.echec]), [
    ['couverts', 'previsions', 110, false, false],
    ['groupes', 'groupes', 1, false, false],
    ['equipe', 'planning', 2, false, false],
  ]);
  assert.deepEqual(r[0].detail, [{ n: 42 }, { t: 'à midi' }, { t: ',' }, { n: 68 }, { t: 'le soir' }]);
  assert.deepEqual(r[1].detail, [{ n: 14 }, { t: 'personnes à' }, { n: '19 h 30' }]);
  assert.equal(r[1].libelle, 'groupe aujourd\'hui');
  assert.deepEqual(r[2].detail, [{ n: 1 }, { t: 'absence' }]);
});

test('reperesDuJour : vide, non lu, absences en échec', () => {
  const vide = reperesDuJour({
    couverts: { midi: 0, soir: 0, brunch: 0, total: 0 }, groupes: [], equipe: [], absents: [], absencesLues: true,
    avecCouverts: true, avecGroupes: true, avecPlanning: true,
  });
  assert.deepEqual(vide.map((x) => [x.vide, x.echec, x.texte]), [
    [true, false, 'Aucune réservation aujourd\'hui'],
    [true, false, 'Aucun groupe aujourd\'hui'],
    [true, false, 'Personne au planning aujourd\'hui'],
  ]);
  assert.deepEqual(vide[2].detail, [{ t: 'Aucune absence' }]);

  const nonLu = (s) => s === 'shifts' || s === 'couverts';
  const echec = reperesDuJour({
    couverts: { midi: 0, soir: 0, brunch: 0, total: 0 }, groupes: [], equipe: [], absents: [], absencesLues: false,
    avecCouverts: true, avecGroupes: true, avecPlanning: true, nonLu,
  });
  assert.deepEqual(echec.map((x) => [x.id, x.vide, x.echec, x.texte]), [
    ['couverts', false, true, 'Réservations indisponibles pour l\'instant'],
    ['groupes', true, false, 'Aucun groupe aujourd\'hui'],
    ['equipe', false, true, 'Planning indisponible pour l\'instant'],
  ]);
  // Absences en échec : rien n'est dit des absences.
  assert.equal(echec[2].detail, null);

  // Modules désactivés : aucun repère.
  assert.deepEqual(reperesDuJour({ avecCouverts: false, avecGroupes: false, avecPlanning: false }), []);
});

test('aFaire et chiffresGestion : inchangés', () => {
  const items = aFaire({
    aujourdhui: JOUR,
    maintenant: h('10:50'),
    haccp: {
      zones: [{ id: 'z1', actif: true }, { id: 'z2', actif: true }],
      creneaux: [{ id: 'c1', heure: '08:00', label: 'Ouverture', actif: true }],
      releves: [{ date: JOUR, zoneId: 'z1', heure: '08:05' }],
    },
    groupes: [{ id: 'g1', nom: 'Séminaire', statut: 'a_lire', dateEvenement: DEMAIN, typeGroupe: 'seminaire', nbPax: 22, heure: '12:00' }],
    shifts: [sh('k1', 'karim', '09:00', '14:30', 'midi')],
    absences: [],
    nbMessages: 1,
    pertes: [{ valide: false }],
    avecHaccp: true, avecGroupes: true, avecPlanning: true, direction: true,
    nomDe: () => 'Karim',
  });
  assert.deepEqual(items.map((i) => [i.id, i.ton, i.page]), [
    ['haccp-c1', 'danger', 'haccp'],
    ['groupe-g1', 'danger', 'groupes'],
    ['retard-k1', 'warning', 'pointage'],
    ['messages', 'info', 'messages'],
    ['pertes', 'info', 'pertes'],
  ]);
  assert.equal(items[0].titre, 'Relevé de 08:00 pas terminé');
  assert.equal(items[0].detail, '1 zone sur 2, Ouverture');
  assert.equal(items[2].titre, 'Karim n\'a pas pointé');

  const c = chiffresGestion({
    pertes: [{ date: '2026-10-02', quantite: 2, valeurUnit: 7.5, valide: false }, { date: '2026-09-28', quantite: 1, valeurUnit: 10, valide: true }],
    shifts: [sh('k1', 'karim', '09:00', '14:30'), sh('k2', 'karim', '18:00', '22:30')],
    couverts: [{ couverts_midi: 42, couverts_soir: 68 }, { couverts_midi: 35, couverts_soir: 54, couverts_brunch: 0 }],
    aujourdhui: JOUR,
  });
  assert.deepEqual(c, { valeurPertes: 15, aValider: 1, heures: 9, couvertsSemaine: 199 });
});
