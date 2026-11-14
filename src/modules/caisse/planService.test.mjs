// node --test src/modules/caisse/planService.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  serviceDuMoment, ajustementsDuService, tablesDuService, tableesDe, ticketsSurPlan,
  reservationDirecte, reservationsPosees, lignesReunion, lignesSeparation, lignesDeplacement,
  decalageBorne, tableSous,
} from './planService.js';

const tbl = (id, nom, x, y, l = 100, h = 100) => ({ id, nom, pos_x: x, pos_y: y, largeur: l, hauteur: h, nb_places: 4 });
const TABLES = [tbl('t1', '1', 100, 100), tbl('t2', '2', 300, 100), tbl('t3', '3', 500, 100, 200, 90), tbl('t10', '10', 100, 400)];
const JOUR = '2026-11-14';

test('le service du moment bascule au soir à 16 h', () => {
  assert.equal(serviceDuMoment(12 * 60), 'midi');
  assert.equal(serviceDuMoment(15 * 60 + 59), 'midi');
  assert.equal(serviceDuMoment(16 * 60), 'soir');
});

test('le plan du service applique place, quart de tour et tablée du seul service lu', () => {
  const ajust = [
    { table_id: 't2', service: 'soir', pos_x: 200, pos_y: 100, fusion: 't1' },
    { table_id: 't1', service: 'soir', pos_x: null, pos_y: null, fusion: 't1' },
    { table_id: 't3', service: 'soir', pos_x: null, pos_y: null, fusion: null, pivotee: true },
    { table_id: 't10', service: 'midi', pos_x: 900, pos_y: 600, fusion: null },
  ];
  const vues = tablesDuService(TABLES, ajustementsDuService(ajust, 'soir'));
  const t = Object.fromEntries(vues.map((x) => [x.id, x]));
  assert.equal(t.t2.pos_x, 200);
  assert.equal(t.t1.pos_x, 100);
  assert.equal(t.t2.fusion, 't1');
  assert.deepEqual([t.t3.largeur, t.t3.hauteur], [90, 200]);
  assert.equal(t.t10.pos_x, 100, 'un écart du midi ne touche pas le soir');
});

test('une tablée a une principale : la table de la clé, sinon le plus petit numéro', () => {
  const vues = [{ ...TABLES[0], fusion: 't2' }, { ...TABLES[1], fusion: 't2' }, { ...TABLES[2], fusion: 'x' }, { ...TABLES[3], fusion: 'x' }];
  const tablees = tableesDe(vues);
  assert.equal(tablees.get('t1').principale.id, 't2');
  assert.equal(tablees.get('t1').membres.length, 2);
  assert.equal(tablees.get('t10').principale.id, 't3', '3 avant 10 en ordre numérique');
  const seule = tableesDe([{ ...TABLES[0], fusion: 'perdue' }]);
  assert.equal(seule.get('t1').membres.length, 1);
});

test('le ticket couvre sa tablée et les tables de sa réservation, sans prendre la table d\'un autre ticket', () => {
  const vues = [{ ...TABLES[0], fusion: 't1' }, { ...TABLES[1], fusion: 't1' }, TABLES[2], TABLES[3]];
  const tablees = tableesDe(vues);
  const tickets = [
    { id: 'k1', table_id: 't1', reservation_id: 'r1' },
    { id: 'k2', table_id: 't10', reservation_id: null },
  ];
  const resas = [{ id: 'r1', reservation_tables: [{ table_id: 't2' }, { table_id: 't3' }, { table_id: 't10' }] }];
  const plan = ticketsSurPlan(tickets, tablees, resas);
  assert.equal(plan.t1.id, 'k1');
  assert.equal(plan.t2.id, 'k1');
  assert.equal(plan.t3.id, 'k1');
  assert.equal(plan.t10.id, 'k2');
});

test('un ticket changé de table ne laisse pas les tables de sa réservation occupées', () => {
  const tablees = tableesDe(TABLES);
  const plan = ticketsSurPlan([{ id: 'k1', table_id: 't10', reservation_id: 'r1' }], tablees, [{ id: 'r1', reservation_tables: [{ table_id: 't3' }] }]);
  assert.equal(plan.t10.id, 'k1');
  assert.equal(plan.t3, undefined);
});

const resa = (id, heure, tables, extra = {}) => ({
  id, nom: id, date_service: JOUR, service: 'soir', statut: 'confirme', heure_arrivee: heure,
  reservation_tables: tables.map((table_id) => ({ table_id })), ...extra,
});

test('un toucher ouvre la seule réservation du service posée sur la tablée, dès 45 min avant', () => {
  const resas = [resa('dupont', '19:30:00', ['t2']), resa('midi', '12:00:00', ['t2'], { service: 'midi' })];
  const base = { jour: JOUR, service: 'soir', tableIds: ['t1', 't2'] };
  assert.equal(reservationDirecte(resas, { ...base, maintenantMinutes: 18 * 60 + 44 }), null, 'trop tôt : la fiche choisit');
  assert.equal(reservationDirecte(resas, { ...base, maintenantMinutes: 18 * 60 + 45 }).id, 'dupont');
  assert.equal(reservationDirecte(resas, { ...base, maintenantMinutes: 21 * 60 }).id, 'dupont', 'en retard : toujours elle');
});

test('deux réservations sur la tablée, une déjà assise ailleurs ou arrivée : la règle tient', () => {
  const deux = [resa('a', '19:00:00', ['t1']), resa('b', '21:30:00', ['t1'])];
  assert.equal(reservationDirecte(deux, { jour: JOUR, service: 'soir', tableIds: ['t1'], maintenantMinutes: 19 * 60 }), null);
  const prise = [resa('a', '19:00:00', ['t1'])];
  assert.equal(reservationDirecte(prise, { jour: JOUR, service: 'soir', tableIds: ['t1'], maintenantMinutes: 19 * 60, tickets: [{ reservation_id: 'a' }] }), null);
  const arrivee = [resa('a', '21:00:00', ['t1'], { statut: 'arrive' })];
  assert.equal(reservationDirecte(arrivee, { jour: JOUR, service: 'soir', tableIds: ['t1'], maintenantMinutes: 19 * 60 }).id, 'a');
  const brunch = [resa('br', '11:00:00', ['t1'], { service: 'brunch' })];
  assert.equal(reservationsPosees(brunch, { jour: JOUR, service: 'midi', tableIds: ['t1'] }).length, 1, 'le brunch se range au midi');
});

test('réunir pose le groupe glissé bord contre bord, côté du lâcher, sous la clé de la cible', () => {
  const source = [TABLES[1]]; // t2 : 300..400
  const cible = [TABLES[3]];  // t10 : 100..200, 400..500
  const droite = lignesReunion(source, cible, { x: 260, y: 450 }, new Map());
  const l2 = droite.find((l) => l.table_id === 't2');
  assert.deepEqual([l2.pos_x, l2.pos_y, l2.fusion], [200, 400, 't10']);
  const t10 = droite.find((l) => l.table_id === 't10');
  assert.deepEqual([t10.pos_x, t10.fusion], [null, 't10'], 'la cible garde sa place');
  const dessus = lignesReunion(source, cible, { x: 150, y: 380 }, new Map());
  const d2 = dessus.find((l) => l.table_id === 't2');
  assert.deepEqual([d2.pos_x, d2.pos_y], [100, 300]);
});

test('réunir près du bord : le côté qui sortirait du canevas cède au côté opposé', () => {
  const source = [tbl('t4', '4', 620, 60, 90, 220)];
  const cible = [tbl('t1', '1', 60, 60, 95, 95)];
  const lignes = lignesReunion(source, cible, { x: 100, y: 107 }, new Map());
  const l4 = lignes.find((l) => l.table_id === 't4');
  assert.deepEqual([l4.pos_x, l4.pos_y], [160, 60], 'à droite (aimanté), pas à gauche hors du canevas');
});

test('réunir à une tablée garde sa clé, et le quart de tour est repris', () => {
  const cible = [{ ...TABLES[0], fusion: 't1' }, { ...TABLES[1], fusion: 't1' }];
  const ajust = new Map([['t3', { table_id: 't3', pivotee: true }]]);
  const lignes = lignesReunion([TABLES[2]], cible, { x: 450, y: 150 }, ajust);
  assert.ok(lignes.every((l) => l.fusion === 't1'));
  assert.equal(lignes.find((l) => l.table_id === 't3').pivotee, true);
});

test('séparer garde les places et efface les tables revenues au plan de base', () => {
  const ajust = new Map([
    ['t1', { table_id: 't1', pos_x: null, pos_y: null, fusion: 't1' }],
    ['t2', { table_id: 't2', pos_x: 200, pos_y: 100, fusion: 't1' }],
  ]);
  const { lignes, effacer } = lignesSeparation([TABLES[0], TABLES[1]], ajust);
  assert.deepEqual(effacer, ['t1']);
  assert.deepEqual(lignes, [{ table_id: 't2', pos_x: 200, pos_y: 100, fusion: null, pivotee: false }]);
});

test('un déplacement reste dans le canevas, aimanté sur la grille', () => {
  const { dx, dy } = decalageBorne([TABLES[2]], 1000, -1000);
  assert.deepEqual([dx, dy], [300, -100]);
  const fin = decalageBorne([TABLES[0]], 13, 26);
  assert.deepEqual([fin.dx, fin.dy], [10, 30]);
  const lignes = lignesDeplacement([TABLES[0]], fin.dx, fin.dy, new Map([['t1', { fusion: 'k', pivotee: true }]]));
  assert.deepEqual(lignes[0], { table_id: 't1', pos_x: 110, pos_y: 130, fusion: 'k', pivotee: true });
});

test('la table sous un point ignore les exclues', () => {
  assert.equal(tableSous(TABLES, { x: 150, y: 150 }).id, 't1');
  assert.equal(tableSous(TABLES, { x: 150, y: 150 }, new Set(['t1'])), null);
});
