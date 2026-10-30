// node --test : plans de duplication (planningDuplication.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planCopieVers, planDuplication, planReprendre, planSemaines, planVersSuivante, resumeDuplication } from './planningDuplication.js';

let n = 0;
const h = (userId, date, debut, fin, extra = {}) => {
  n += 1;
  return { id: 'h' + n, etablissementId: 'e1', userId, date, debut, fin, pause: 0, poste: '', typeShift: 'midi', statut: 'confirmé', note: '', pointageDebut: null, pointageFin: null, ...extra };
};
const pointe = { pointageDebut: '10:01', pointageFin: '14:59' };
// Semaine du lundi 26.10.2026 au dimanche 01.11.2026, puis celle du 02.11.
const S1 = '2026-10-26';
const S2 = '2026-11-02';
const aucuneAbsence = () => false;

test('garder ne supprime rien et compte les horaires déjà présents distincts', () => {
  const src = [h('a', '2026-10-27', '10:00', '15:00'), h('a', '2026-10-27', '17:00', '23:00')];
  // Un seul horaire long chez « a » le mardi suivant bloque les deux copies.
  const long = h('a', '2026-11-03', '09:00', '23:30');
  const plan = planVersSuivante({ semaine: S1, existants: [...src, long], estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aSupprimer, []);
  assert.equal(plan.aCreer.length, 0);
  assert.equal(plan.dejaPresents, 1);
});

test('Remplacer ne supprime jamais un horaire pointé', () => {
  const src = [h('a', '2026-10-27', '10:00', '15:00')];
  const pointeCible = h('a', '2026-11-03', '10:00', '15:00', pointe);
  const libre = h('a', '2026-11-05', '17:00', '23:00');
  const plan = planSemaines({ debutSource: S1, offsets: [7], existants: [...src, pointeCible, libre], remplacer: true, estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.ok(!plan.aSupprimer.includes(pointeCible.id));
  assert.ok(plan.aSupprimer.includes(libre.id));
  assert.equal(plan.pointesGardes, 1);
  // Rien n'est posé par-dessus le pointé.
  assert.equal(plan.aCreer.filter(c => c.date === '2026-11-03').length, 0);
});

test('jours d\'absence sautés : couples (personne, jour) distincts, une coupure compte 1', () => {
  const src = [h('a', '2026-10-28', '10:00', '15:00'), h('a', '2026-10-28', '17:00', '23:00'), h('b', '2026-10-28', '10:00', '15:00')];
  const estAbsent = (uid, d) => d === '2026-11-04';
  const plan = planReprendre({ semaine: S2, existants: src, estAbsent, etablissementId: 'e1' });
  assert.equal(plan.aCreer.length, 0);
  assert.equal(plan.joursAbsence, 2);
});

test('les pointages ne sont jamais copiés, une coupure donne deux horaires', () => {
  const src = [h('a', '2026-10-27', '10:00', '15:00', pointe), h('a', '2026-10-27', '17:00', '23:00', { typeShift: 'soir', pointageDebut: '17:00' })];
  const plan = planVersSuivante({ semaine: S1, existants: src, estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.equal(plan.aCreer.length, 2);
  plan.aCreer.forEach(c => {
    assert.equal(c.pointageDebut, null);
    assert.equal(c.pointageFin, null);
    assert.equal(c.date, '2026-11-03');
    assert.equal(c.statut, 'confirmé');
  });
  assert.deepEqual(plan.aCreer.map(c => c.typeShift), ['midi', 'soir']);
});

test('semaine source vide : rien à créer', () => {
  const plan = planReprendre({ semaine: S2, existants: [h('a', S2, '10:00', '15:00')], estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.equal(plan.sources.length, 0);
  assert.equal(plan.aCreer.length, 0);
});

test('reprendre la semaine précédente : copiés, gardés et sautés comme au banc', () => {
  const src = [
    h('lucie', '2026-10-27', '10:00', '15:00'), h('lucie', '2026-10-27', '17:00', '23:00'),
    h('marco', '2026-10-27', '10:00', '15:00'),
    h('sarah', '2026-10-28', '17:00', '23:00'),
    h('julie', '2026-10-28', '10:00', '15:00'), h('julie', '2026-10-29', '10:00', '15:00'),
    h('tom', '2026-10-30', '08:00', '16:00'),
  ];
  const deja = [h('lucie', '2026-11-03', '10:00', '15:00'), h('marco', '2026-11-03', '10:00', '15:00'), h('sarah', '2026-11-04', '18:00', '23:30')];
  const estAbsent = (uid, d) => uid === 'julie' && (d === '2026-11-04' || d === '2026-11-05');
  const plan = planReprendre({ semaine: S2, existants: [...src, ...deja], estAbsent, etablissementId: 'e1' });
  assert.equal(plan.aCreer.length, 2); // soir de Lucie, longue de Tom
  assert.equal(plan.dejaPresents, 3);
  assert.equal(plan.joursAbsence, 2);
  assert.deepEqual(plan.aSupprimer, []);
});

test('planCopieVers sur un créneau pointé qui chevauche : 0 suppression, 1 déjà pointé gardé (régression du 30.10.2026)', () => {
  const source = h('marco', '2026-10-27', '10:00', '15:00');
  const pointeMercredi = h('marco', '2026-10-28', '10:00', '15:00', pointe);
  const plan = planCopieVers({ sources: [source], userIds: new Set(['marco']), dates: new Set(['2026-10-28']), existants: [source, pointeMercredi], estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aSupprimer, []);
  assert.equal(plan.aCreer.length, 0);
  assert.equal(plan.pointesGardes, 1);
});

test('planCopieVers remplace un horaire non pointé qui chevauche, garde celui qui ne chevauche pas', () => {
  const source = h('marco', '2026-10-27', '10:00', '15:00');
  const midiLibre = h('julie', '2026-10-27', '11:00', '14:00');
  const soirJulie = h('julie', '2026-10-27', '17:00', '23:00');
  const plan = planCopieVers({ sources: [source], userIds: new Set(['julie']), dates: new Set(['2026-10-27']), existants: [source, midiLibre, soirJulie], estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aSupprimer, [midiLibre.id]);
  assert.equal(plan.aCreer.length, 1);
  assert.equal(plan.aCreer[0].userId, 'julie');
});

test('planCopieVers ne copie jamais une case sur elle-même et saute un jour d\'absence', () => {
  const source = h('marco', '2026-10-27', '10:00', '15:00');
  const estAbsent = (uid, d) => uid === 'marco' && d === '2026-10-29';
  const plan = planCopieVers({ sources: [source], userIds: new Set(['marco']), dates: new Set(['2026-10-27', '2026-10-28', '2026-10-29']), existants: [source], estAbsent, etablissementId: 'e1' });
  assert.deepEqual(plan.aCreer.map(c => c.date), ['2026-10-28']);
  assert.equal(plan.joursAbsence, 1);
  assert.equal(plan.aCreer[0].pointageDebut, null);
});

test('planDuplication d\'une journée en mode Remplacer : chevauchement remplacé, pointé gardé', () => {
  const src = h('a', '2026-10-27', '10:00', '15:00');
  const aRemplacer = h('a', '2026-10-28', '11:00', '13:00');
  const pointeJeudi = h('a', '2026-10-29', '10:00', '15:00', pointe);
  const plan = planDuplication({ sources: [src], cibles: () => ['2026-10-28', '2026-10-29'], existants: [src, aRemplacer, pointeJeudi], remplacer: true, estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aSupprimer, [aRemplacer.id]);
  assert.deepEqual(plan.aCreer.map(c => c.date), ['2026-10-28']);
  assert.equal(plan.pointesGardes, 1);
});

test('plusieurs semaines : chaque semaine reçoit sa copie', () => {
  const src = [h('a', '2026-10-27', '10:00', '15:00')];
  const plan = planSemaines({ debutSource: S1, offsets: [7, 14, 21], existants: src, estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aCreer.map(c => c.date), ['2026-11-03', '2026-11-10', '2026-11-17']);
});

test('toute la semaine vers la suivante en Remplacer : toute l\'équipe repart de la semaine affichée, pointé gardé', () => {
  // « Autres copies », Toute la semaine, Vers la semaine suivante, Remplacer.
  const src = [h('a', '2026-10-27', '10:00', '15:00'), h('b', '2026-10-28', '17:00', '23:00')];
  const brouillonA = h('a', '2026-11-05', '09:00', '17:00');
  const brouillonB = h('b', '2026-11-03', '10:00', '15:00');
  const pointeB = h('b', '2026-11-04', '17:00', '23:00', pointe);
  const plan = planSemaines({ debutSource: S1, offsets: [7], existants: [...src, brouillonA, brouillonB, pointeB], remplacer: true, estAbsent: aucuneAbsence, etablissementId: 'e1' });
  assert.deepEqual(plan.aSupprimer.sort(), [brouillonA.id, brouillonB.id].sort());
  assert.deepEqual(plan.aCreer.map(c => c.userId + c.date), ['a2026-11-03']);
  assert.equal(plan.pointesGardes, 1);
});

test('reprendre un vendredi sur la semaine en cours vide : aucun horaire avant aujourd\'hui', () => {
  // Semaine précédente de Tom du lundi 19 au vendredi 23.10 ; aujourd'hui = vendredi 30.10.
  const src = ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'].map(d => h('tom', d, '08:00', '16:00'));
  const plan = planReprendre({ semaine: S1, existants: src, estAbsent: aucuneAbsence, etablissementId: 'e1', aPartirDu: '2026-10-30' });
  assert.deepEqual(plan.aCreer.map(c => c.date), ['2026-10-30']);
  assert.equal(plan.aCreer.filter(c => c.date < '2026-10-30').length, 0);
  assert.equal(plan.joursPasses, 4);
  // Sans date du jour (tests, appels anciens) : la semaine entière, comme avant.
  assert.equal(planReprendre({ semaine: S1, existants: src, estAbsent: aucuneAbsence, etablissementId: 'e1' }).aCreer.length, 5);
});

test('Remplacer ne vide jamais un jour passé', () => {
  const src = [h('tom', '2026-10-20', '08:00', '16:00'), h('tom', '2026-10-24', '08:00', '16:00')];
  const passeLibre = h('tom', '2026-10-27', '10:00', '15:00');
  const avenirLibre = h('tom', '2026-10-31', '17:00', '23:00');
  const plan = planSemaines({ debutSource: '2026-10-19', offsets: [7], existants: [...src, passeLibre, avenirLibre], remplacer: true, estAbsent: aucuneAbsence, etablissementId: 'e1', aPartirDu: '2026-10-30' });
  assert.deepEqual(plan.aSupprimer, [avenirLibre.id]);
  assert.deepEqual(plan.aCreer.map(c => c.date), ['2026-10-31']);
  assert.equal(plan.joursPasses, 1);
});

test('resumeDuplication : morceaux accordés, compteurs nuls omis', () => {
  const parts = resumeDuplication({ aCreer: new Array(49), aSupprimer: [], dejaPresents: 3, pointesGardes: 0, joursAbsence: 1 }, { copies: ['horaire sera copié sur cette semaine', 'horaires seront copiés sur cette semaine'] });
  assert.deepEqual(parts.map(p => [p.n, p.texte]), [
    [49, 'horaires seront copiés sur cette semaine'],
    [3, 'déjà présents gardés'],
    [1, 'jour d\'absence sauté'],
  ]);
  const un = resumeDuplication({ aCreer: [1], aSupprimer: ['x', 'y'], pointesGardes: 1 });
  assert.deepEqual(un.map(p => [p.n, p.texte]), [[1, 'horaire sera copié'], [2, 'remplacés'], [1, 'déjà pointé gardé']]);
  const passes = resumeDuplication({ aCreer: [1], aSupprimer: [], joursPasses: 4 });
  assert.deepEqual(passes.map(p => [p.n, p.texte]), [[1, 'horaire sera copié'], [4, 'jours passés sautés']]);
});
