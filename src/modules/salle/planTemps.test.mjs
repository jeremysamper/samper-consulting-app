// node --test : le temps sur le plan de salle (occupation d'une table à une
// heure, retard, proposition de table, placement de tout le monde) et la
// géométrie partagée (cadrage, chaises, guides d'alignement).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bornesCurseur, chevauche, enRetard, etatTablee, fenetre, hhmm, minutesDe, planifier, proposer, tableesLibres,
} from './planTemps.js';
import { aligner, cadrage, chaises } from './planVue.js';

const R = (id, heure, nb, statut = 'confirme', service = 'soir') => ({ id, heure_arrivee: heure, nb_couverts: nb, statut, service });

test('minutes et heures', () => {
  assert.equal(minutesDe('19:30:00'), 1170);
  assert.equal(minutesDe(''), null);
  assert.equal(hhmm(1170), '19:30');
  assert.equal(hhmm(1440 + 5), '00:05');
});

test('fenêtre : 2 h le soir, 1 h 30 à midi, un client arrivé reste jusqu’à maintenant', () => {
  assert.deepEqual(fenetre(R('a', '19:00', 2)), { debut: 1140, fin: 1260 });
  assert.deepEqual(fenetre(R('a', '12:00', 2, 'confirme', 'midi')), { debut: 720, fin: 810 });
  assert.equal(fenetre(R('a', '19:00', 2, 'arrive'), 1290).fin, 1305);
  assert.equal(chevauche({ debut: 0, fin: 10 }, { debut: 10, fin: 20 }), false);
});

test('retard au-delà de 15 minutes, seulement pour une réservation attendue', () => {
  assert.equal(enRetard(R('a', '19:00', 2), 1150), 0);
  assert.equal(enRetard(R('a', '19:00', 2), 1160), 20);
  assert.equal(enRetard(R('a', '19:00', 2, 'arrive'), 1200), 0);
  assert.equal(enRetard(R('a', '19:00', 2), null), 0);
});

test('état d’une table : active à l’heure, puis la suivante, parti libère', () => {
  const meier = R('m', '18:30', 4, 'arrive');
  const keller = R('k', '21:00', 4);
  let e = etatTablee([meier, keller], 1140, 1140);
  assert.equal(e.etat, 'atable');
  assert.equal(e.affichee.id, 'm');
  assert.equal(e.suivante.id, 'k');
  e = etatTablee([keller], 1140, 1140);
  assert.equal(e.etat, 'reservee');
  assert.equal(e.aVenir, true);
  assert.equal(etatTablee([R('p', '18:00', 2, 'parti')], 1140).etat, 'libre');
  assert.equal(etatTablee([R('f', '18:30', 3)], 1140, 1140).etat, 'retard');
  // Sans heure choisie : la première réservation du service.
  assert.equal(etatTablee([keller, meier], null).affichee.id, 'm');
});

test('bornes du curseur : une demi-heure avant la première arrivée, jusqu’à la dernière fin', () => {
  assert.deepEqual(bornesCurseur([R('a', '19:10', 2), R('b', '21:00', 2)]), { min: 1110, max: 1380, pas: 15 });
  assert.equal(bornesCurseur([]), null);
});

const tb = (nom, places, ids = [nom], extra = {}) => ({ id: 't' + nom, nom, places, salleId: 's1', tabouret: false, tableIds: ids.map((i) => 't' + i), ...extra });

test('proposer : assez de places, libre sur la fenêtre, le moins de places perdues', () => {
  const tablees = [tb('1', 2), tb('2', 4), tb('3', 6), tb('B1', 1, ['B1'], { tabouret: true })];
  const occ = new Map([['t2', [R('x', '19:00', 4)]]]);
  assert.equal(proposer(R('w', '19:30', 4), tablees, occ).nom, '3');
  assert.equal(proposer(R('w', '21:30', 4), tablees, occ).nom, '2');
  assert.equal(proposer(R('w', '19:30', 2), tablees, occ).nom, '1');
  assert.equal(proposer(R('w', '19:30', 1), tablees, occ).nom, 'B1');
  assert.equal(proposer(R('w', '19:30', 9), tablees, occ), null);
  // Une réservation partie ne bloque plus la table.
  const occParti = new Map([['t2', [R('x', '19:00', 4, 'parti')]]]);
  assert.equal(tableesLibres(R('w', '19:30', 4), tablees, occParti).map((t) => t.nom).join(), '2,3');
});

test('placer tout le monde : chacune prend sa table, la suivante en tient compte', () => {
  const tablees = [tb('1', 4), tb('2', 4)];
  const plan = planifier([R('b', '19:30', 4), R('a', '19:00', 4), R('c', '19:15', 4)], tablees, new Map());
  assert.deepEqual(plan.map((p) => [p.resa.id, p.tablee?.nom ?? null]), [['a', '1'], ['c', '2'], ['b', null]]);
});

test('cadrage : contour plus marge, minimum 300 sur 210, tout le canevas sans rien', () => {
  assert.deepEqual(cadrage([]), { x0: 0, y0: 0, w: 1000, h: 700 });
  const c = cadrage([{ pos_x: 100, pos_y: 100, largeur: 400, hauteur: 300 }]);
  assert.deepEqual(c, { x0: 60, y0: 60, w: 480, h: 380 });
});

test('chaises : une par place, aucune sur un tabouret ni à petite échelle', () => {
  assert.equal(chaises({ nb_places: 4, forme: 'rectangle' }, 120, 60, 1).length, 4);
  assert.equal(chaises({ nb_places: 6, forme: 'ronde' }, 100, 100, 1).length, 6);
  assert.equal(chaises({ nb_places: 1, forme: 'tabouret' }, 40, 40, 1).length, 0);
  assert.equal(chaises({ nb_places: 4, forme: 'carree' }, 40, 40, 0.3).length, 0);
});

test('guides : une table proche d’un bord s’y cale', () => {
  const r = aligner({ pos_x: 104, pos_y: 300, largeur: 80, hauteur: 80 }, [{ pos_x: 100, pos_y: 50, largeur: 80, hauteur: 80 }]);
  assert.equal(r.pos_x, 100);
  assert.equal(r.pos_y, 300);
  assert.deepEqual(r.guides, [{ axe: 'x', v: 100 }]);
});
