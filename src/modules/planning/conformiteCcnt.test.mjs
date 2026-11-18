// node --test : conformité d'un planning à la CCNT et à la loi sur le travail
// (conformiteCcnt.js). Semaine de référence : lundi 16 au dimanche 22.11.2026.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyserPersonne, analyserEquipe, appliquerProjet, constatsParCase, decaler,
  infractionsCreees, journeesDe, libelleDuree, lundiDe, pauseDemandee,
} from './conformiteCcnt.js';

const U = 'u1';
let n = 0;
const h = (date, debut, fin, pause = 0, userId = U) => ({ id: `s${(n += 1)}`, userId, date, debut, fin, pause });
const LUNDI = '2026-11-16';
const jour = (i) => decaler(LUNDI, i);
const analyser = (shifts, extra = {}) => analyserPersonne({ userId: U, shifts, debut: LUNDI, fin: jour(6), ...extra });
const regles = (constats) => constats.map(c => `${c.regle}:${c.niveau}:${c.date}`);

// Semaine conforme : cinq journées de 8 h 30, pause de 30 min, deux jours de repos.
const semaineConforme = () => [0, 1, 2, 3, 4].map(i => h(jour(i), '09:00', '17:30', 30));

test('dates : lundi de la semaine, décalage, durée lisible', () => {
  assert.equal(lundiDe('2026-11-22'), LUNDI);
  assert.equal(lundiDe(LUNDI), LUNDI);
  assert.equal(lundiDe('2026-11-19'), LUNDI);
  assert.equal(decaler('2026-10-31', 1), '2026-11-01');
  assert.equal(libelleDuree(390), '6 h 30');
  assert.equal(libelleDuree(540), '9 h');
  assert.equal(libelleDuree(45), '45 min');
});

test('journées : service coupé, fin après minuit, durée nulle ignorée', () => {
  const j = journeesDe([
    h(jour(0), '10:00', '14:30'), h(jour(0), '18:00', '01:00', 15),
    h(jour(1), '14:02', '14:02'), // pointage hors planning : fin = début
  ]);
  const lundi = j.get(jour(0));
  assert.equal(lundi.debut, 600);
  assert.equal(lundi.fin, 1500);
  assert.equal(lundi.travail, 270 + 405);
  assert.equal(lundi.ecarts, 210);
  assert.equal(lundi.nuit, true);
  assert.equal(j.has(jour(1)), false);
});

test('pause demandée : LTr art. 15 al. 1', () => {
  assert.equal(pauseDemandee(330), 0);
  assert.equal(pauseDemandee(331), 15);
  assert.equal(pauseDemandee(421), 30);
  assert.equal(pauseDemandee(541), 60);
});

test('semaine conforme : aucun constat', () => {
  assert.deepEqual(analyser(semaineConforme()), []);
});

test('repos entre deux journées : sous 8 h infraction, une réduction par semaine en attention', () => {
  const court = analyser([h(jour(0), '16:00', '23:30', 30), h(jour(1), '06:00', '11:00')]);
  assert.deepEqual(regles(court), [`reposQuotidien:infraction:${jour(1)}`]);
  assert.equal(court[0].valeur, '6 h 30');

  const reduit = analyser([h(jour(0), '15:00', '23:00', 30), h(jour(1), '08:00', '12:00')]);
  assert.deepEqual(regles(reduit), [`reposQuotidien:attention:${jour(1)}`]);

  const deux = analyser([
    h(jour(0), '15:00', '23:00', 30), h(jour(1), '08:00', '12:00'),
    h(jour(2), '15:00', '23:00', 30), h(jour(3), '08:00', '12:00'),
  ]);
  assert.deepEqual(regles(deux), [`reposQuotidien:attention:${jour(1)}`, `reposQuotidien:infraction:${jour(3)}`]);

  // Fin après minuit : le repos part de la vraie fin.
  const minuit = analyser([h(jour(0), '18:00', '01:30', 30), h(jour(1), '09:00', '14:00')]);
  assert.deepEqual(regles(minuit), [`reposQuotidien:infraction:${jour(1)}`]);
  assert.equal(minuit[0].valeur, '7 h 30');
});

test('service coupé : pas de conflit, l\'intervalle compte comme pause', () => {
  const coupe = analyser([0, 1, 2, 3, 4].flatMap(i => [h(jour(i), '10:00', '14:30'), h(jour(i), '18:00', '22:30')]));
  assert.deepEqual(coupe.filter(c => c.regle === 'pauses'), []);
  // 9 h de travail sur une amplitude de 12 h 30 : rien.
  assert.deepEqual(coupe.filter(c => c.regle === 'amplitude'), []);
});

test('pauses : pause trop courte, service de plus de 5 h 30 sans pause', () => {
  const courte = analyser([h(jour(0), '08:00', '17:00', 15)]);
  assert.deepEqual(regles(courte), [`pauses:infraction:${jour(0)}`]);
  assert.equal(courte[0].valeur, '15 min / 8 h 45');
  const sansPause = analyser([h(jour(0), '17:00', '23:00')]);
  assert.deepEqual(regles(sansPause), [`pauses:infraction:${jour(0)}`]);
  const tranche = analyser([h(jour(0), '07:00', '13:00'), h(jour(0), '13:30', '15:00')]);
  assert.deepEqual(regles(tranche), [`pauses:infraction:${jour(0)}`]);
  assert.match(tranche[0].texte, /5 h 30 sans pause/);
});

test('amplitude : plus de 14 h entre 6 h et 23 h ; la journée qui déborde sur la nuit n\'est pas contrôlée', () => {
  const longue = analyser([h(jour(0), '07:00', '11:00'), h(jour(0), '17:30', '22:00')]);
  assert.deepEqual(regles(longue), [`amplitude:infraction:${jour(0)}`]);
  assert.equal(longue[0].valeur, '15 h');
  const nuit = analyser([h(jour(0), '10:00', '14:00'), h(jour(0), '19:00', '00:30')]);
  assert.deepEqual(nuit.filter(c => c.regle === 'amplitude'), []);
});

test('jours d\'affilée : 7e jour permis sous condition, sinon infraction, 8e toujours', () => {
  // Du lundi au dimanche, 8 h par jour, rien ensuite : permis, repos à prévoir.
  const sept = [0, 1, 2, 3, 4, 5, 6].map(i => h(jour(i), '09:00', '17:30', 30));
  const r = analyser(sept, { heuresSemaine: 60 });
  assert.deepEqual(regles(r), [`joursConsecutifs:attention:${jour(6)}`]);
  assert.match(r[0].texte, /prévoyez/);

  // Le lundi suivant est travaillé : 8 jours.
  const huit = analyserPersonne({ userId: U, shifts: [...sept, h(jour(7), '09:00', '17:30', 30)], debut: LUNDI, fin: jour(7), heuresSemaine: 60 });
  assert.deepEqual(regles(huit), [`joursConsecutifs:infraction:${jour(6)}`, `joursConsecutifs:infraction:${jour(7)}`]);
  assert.equal(huit[1].valeur, '8 jours');

  // 7 jours dont un de plus de 9 h.
  const long = analyser([...sept.slice(0, 6), h(jour(6), '07:30', '18:00', 60)], { heuresSemaine: 60 });
  assert.deepEqual(regles(long), [`joursConsecutifs:infraction:${jour(6)}`]);

  // 7 jours puis seulement 60 h de repos.
  const peuRepos = analyserPersonne({
    userId: U, shifts: [...sept, h(jour(9), '05:30', '10:00')], debut: LUNDI, fin: jour(9), heuresSemaine: 60,
  });
  assert.deepEqual(regles(peuRepos), [`joursConsecutifs:infraction:${jour(6)}`]);

  // 7 jours puis 83 h de repos : permis.
  const assez = analyserPersonne({
    userId: U, shifts: [...sept, h(jour(10), '09:00', '17:30', 30)], debut: LUNDI, fin: jour(6), heuresSemaine: 60,
  });
  assert.deepEqual(regles(assez), [`joursConsecutifs:attention:${jour(6)}`]);
  assert.doesNotMatch(assez[0].texte, /prévoyez/);
});

test('suite commencée la semaine d\'avant : comptée', () => {
  const shifts = [-3, -2, -1, 0, 1, 2, 3].map(i => h(jour(i), '09:00', '17:30', 30));
  assert.deepEqual(regles(analyser(shifts, { heuresSemaine: 60 })), [`joursConsecutifs:attention:${jour(3)}`]);
});

test('jours de repos : un seul jour en attention, aucun jour entier en infraction', () => {
  const six = [0, 1, 2, 3, 4, 5].map(i => h(jour(i), '09:00', '16:00', 30));
  assert.deepEqual(regles(analyser(six)), [`deuxJours:attention:${LUNDI}`]);
  const saison = analyser(six, { saisonnier: true });
  assert.match(saison[0].texte, /12 semaines/);

  // Six jours, le samedi finit à 02:00 et le lundi suivant commence à 01:00 :
  // le dimanche n'offre pas 24 h de repos.
  const grignote = analyserPersonne({
    userId: U,
    shifts: [...[0, 1, 2, 3, 4].map(i => h(jour(i), '09:00', '16:00', 30)), h(jour(5), '18:00', '02:00', 30), h(jour(7), '01:00', '06:00')],
    debut: LUNDI,
    fin: jour(6),
  });
  assert.deepEqual(regles(grignote).filter(r => r.startsWith('jourEntier')), [`jourEntier:infraction:${LUNDI}`]);
});

test('semaine qui porte une absence : jours de repos non contrôlés', () => {
  const six = [0, 1, 2, 3, 4, 5].map(i => h(jour(i), '09:00', '16:00', 30));
  const absences = [{ userId: U, dateDebut: jour(6), dateFin: jour(6), motif: 'conge' }];
  assert.deepEqual(analyser(six, { absences }), []);
  const autre = [{ userId: 'u2', dateDebut: jour(6), dateFin: jour(6), motif: 'conge' }];
  assert.equal(analyser(six, { absences: autre }).length, 1);
});

test('durée de la semaine : au-delà de la moyenne CCNT en attention', () => {
  const longue = [0, 1, 2, 3, 4].map(i => h(jour(i), '07:30', '18:00', 60));
  const r = analyser(longue);
  assert.deepEqual(regles(r), [`dureeSemaine:attention:${LUNDI}`]);
  assert.equal(r[0].valeur, '47 h 30 / 42 h');
  assert.equal(analyser(longue, { heuresSemaine: 45 })[0].valeur, '47 h 30 / 45 h');
  assert.deepEqual(analyser(longue, { heuresSemaine: 48 }), []);
});

test('constats par case : les règles du jour seulement', () => {
  const c = analyser([h(jour(0), '16:00', '23:30', 30), h(jour(1), '06:00', '11:00'), h(jour(2), '09:00', '17:30', 30), h(jour(3), '09:00', '17:30', 30), h(jour(4), '09:00', '17:30', 30), h(jour(5), '09:00', '17:30', 30)]);
  const cases = constatsParCase(c);
  assert.equal(cases.get(`${U}|${jour(1)}`).length, 1);
  assert.equal([...cases.values()].flat().every(x => x.portee === 'jour'), true);
  assert.equal(c.some(x => x.portee === 'semaine'), true);
});

test('équipe : chacun ses constats', () => {
  const shifts = [h(jour(0), '16:00', '23:30', 30), h(jour(1), '06:00', '11:00'), ...semaineConforme().map(s => ({ ...s, userId: 'u2' }))];
  const c = analyserEquipe({ userIds: [U, 'u2'], shifts, debut: LUNDI, fin: jour(6) });
  assert.deepEqual(c.map(x => x.userId), [U]);
});

test('projet : un ajout au même id remplace l\'existant', () => {
  const a = h(jour(0), '09:00', '17:00', 30);
  const b = h(jour(1), '09:00', '17:00', 30);
  const apres = appliquerProjet([a, b], { ajouts: [{ ...a, fin: '18:00' }], retraits: [b.id] });
  assert.equal(apres.length, 1);
  assert.equal(apres[0].fin, '18:00');
});

test('infractions créées : seulement les nouvelles, rien pour un horaire conforme', () => {
  const existants = semaineConforme();
  // Horaire conforme ajouté le samedi : aucune infraction créée.
  assert.deepEqual(infractionsCreees({ existants, ajouts: [h(jour(5), '10:00', '14:00')] }), []);
  // Fin du vendredi repoussée à 02:00 puis samedi 08:00 : repos de 6 h.
  const vendredi = existants[4];
  const creees = infractionsCreees({ existants: [...existants, h(jour(5), '08:00', '12:00')], ajouts: [{ ...vendredi, debut: '18:00', fin: '02:00' }] });
  assert.deepEqual(regles(creees), [`reposQuotidien:infraction:${jour(5)}`]);
  assert.equal(creees[0].valeur, '6 h');
  // Infraction déjà là : modifier un autre jour ne redemande rien.
  const deja = [h(jour(0), '16:00', '23:30', 30), h(jour(1), '06:00', '11:00')];
  assert.deepEqual(infractionsCreees({ existants: deja, ajouts: [h(jour(3), '09:00', '13:00')] }), []);
  // Déplacement vers une autre personne : contrôlé chez elle.
  const autre = h(jour(1), '06:00', '11:00', 0, 'u2');
  const chezU2 = [h(jour(0), '16:00', '23:30', 30, 'u2')];
  const deplace = infractionsCreees({ existants: [...chezU2, { ...autre, userId: U }], ajouts: [autre] });
  assert.deepEqual(deplace.map(c => `${c.userId}:${c.regle}`), ['u2:reposQuotidien']);
});

test('pointage hors planning (fin = début) : rien à signaler', () => {
  const existants = semaineConforme();
  assert.deepEqual(infractionsCreees({ existants, ajouts: [h(jour(5), '14:02', '14:02')] }), []);
});
