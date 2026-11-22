// node --test : la taille des tables selon la salle (bornes de l'échelle,
// gabarits par défaut, redimensionnement depuis le centre, retour à 100 %).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ECHELLE_MIN, ECHELLE_MAX, bornerEchelle, echelleDeSalle, echelleDisponible, enPourcent,
  redimensionnerTable, redimensionnerTables, tailleChangeeDeSalle, tailleParDefaut,
} from './planEchelle.js';
import { COTE_NUMERO_SEUL, numeroSeul } from './planVue.js';

const T = (id, x, y, w, h, extra = {}) => ({ id, pos_x: x, pos_y: y, largeur: w, hauteur: h, forme: 'carree', nb_places: 4, ...extra });

test('échelle bornée entre 0,6 et 1, 1 quand elle manque', () => {
  assert.equal(ECHELLE_MIN, 0.6);
  assert.equal(ECHELLE_MAX, 1);
  assert.equal(bornerEchelle(0.8), 0.8);
  assert.equal(bornerEchelle('0.75'), 0.75);
  assert.equal(bornerEchelle(0.3), 0.6);
  assert.equal(bornerEchelle(1.4), 1);
  assert.equal(bornerEchelle(null), 1);
  assert.equal(bornerEchelle(undefined), 1);
  assert.equal(bornerEchelle(''), 1);
  assert.equal(bornerEchelle('abc'), 1);
  assert.equal(bornerEchelle(0), 1);
  assert.equal(bornerEchelle(-2), 1);
  assert.equal(echelleDeSalle({ echelle_tables: 0.7 }), 0.7);
  assert.equal(echelleDeSalle({}), 1);
  assert.equal(echelleDeSalle(null), 1);
  assert.equal(enPourcent(0.65), 65);
  assert.equal(enPourcent(null), 100);
});

test('le réglage n’existe que si la base connaît la colonne', () => {
  assert.equal(echelleDisponible({ id: 's', echelle_tables: 1 }), true);
  assert.equal(echelleDisponible({ id: 's', echelle_tables: null }), true);
  assert.equal(echelleDisponible({ id: 's' }), false);
  assert.equal(echelleDisponible(null), false);
});

test('gabarits par défaut : inchangés à 100 %, réduits avec la salle', () => {
  assert.deepEqual(tailleParDefaut('carree', 2), { largeur: 96, hauteur: 96 });
  assert.deepEqual(tailleParDefaut('rectangle', 6), { largeur: 275, hauteur: 90 });
  assert.deepEqual(tailleParDefaut('ronde', 8), { largeur: 148, hauteur: 148 });
  assert.deepEqual(tailleParDefaut('tabouret', 1), { largeur: 50, hauteur: 50 });
  assert.deepEqual(tailleParDefaut('carree', 2, 0.6), { largeur: 57.6, hauteur: 57.6 });
  assert.deepEqual(tailleParDefaut('rectangle', 6, 0.8), { largeur: 220, hauteur: 72 });
  assert.deepEqual(tailleParDefaut('tabouret', 1, 0.6), { largeur: 30, hauteur: 30 });
  // Échelle hors bornes : ramenée, jamais une table minuscule
  assert.deepEqual(tailleParDefaut('tabouret', 1, 0.1), { largeur: 30, hauteur: 30 });
});

test('redimensionner depuis le centre : le centre ne bouge pas', () => {
  const t = T('a', 100, 200, 100, 60);
  const r = redimensionnerTable(t, 1, 0.6);
  assert.deepEqual(r, { id: 'a', pos_x: 120, pos_y: 212, largeur: 60, hauteur: 36 });
  assert.equal(r.pos_x + r.largeur / 2, 150);
  assert.equal(r.pos_y + r.hauteur / 2, 230);
});

test('une table tournée reste tournée (plus haute que large)', () => {
  const t = T('v', 300, 100, 90, 275, { forme: 'rectangle', nb_places: 6 });
  const r = redimensionnerTable(t, 1, 0.8);
  assert.equal(r.largeur, 72);
  assert.equal(r.hauteur, 220);
  assert.ok(r.hauteur > r.largeur);
});

test('le rapport part de l’échelle actuelle de la salle', () => {
  // 80 % vers 60 % : facteur 0,75
  const r = redimensionnerTable(T('a', 0, 0, 80, 80), 0.8, 0.6);
  assert.equal(r.largeur, 60);
  assert.equal(r.pos_x, 10);
});

test('retour à 100 % : la table retrouve sa taille et sa place', () => {
  const t = T('a', 437, 291, 103, 103, { forme: 'ronde' });
  let g = { ...t };
  for (const [a, n] of [[1, 0.65], [0.65, 0.85], [0.85, 0.6], [0.6, 1]]) g = { ...g, ...redimensionnerTable(g, a, n) };
  assert.ok(Math.abs(g.largeur - 103) <= 0.02, `largeur ${g.largeur}`);
  assert.ok(Math.abs(g.pos_x - 437) <= 0.02, `pos_x ${g.pos_x}`);
  assert.ok(Math.abs(g.pos_y - 291) <= 0.02, `pos_y ${g.pos_y}`);
});

test('en grandissant contre un bord, la table reste dans le canevas', () => {
  // Table réduite collée au bord droit et en bas (canevas 1000 x 700)
  const r = redimensionnerTable(T('b', 950, 660, 48, 36), 0.6, 1);
  assert.equal(r.largeur, 80);
  assert.equal(r.hauteur, 60);
  assert.equal(r.pos_x, 920);
  assert.equal(r.pos_y, 640);
  const g = redimensionnerTable(T('c', 0, 0, 30, 30), 0.6, 1);
  assert.equal(g.pos_x, 0);
  assert.equal(g.pos_y, 0);
});

test('toute la salle d’un coup, rien à écrire à échelle égale', () => {
  const tables = [T('a', 0, 0, 100, 100), T('b', 200, 0, 50, 50, { forme: 'tabouret', nb_places: 1 })];
  const lignes = redimensionnerTables(tables, 1, 0.7);
  assert.equal(lignes.length, 2);
  assert.deepEqual(lignes.map((l) => l.largeur), [70, 35]);
  assert.deepEqual(lignes.map((l) => l.id), ['a', 'b']);
  assert.deepEqual(redimensionnerTables(tables, 0.8, 0.8), []);
  assert.deepEqual(redimensionnerTables(tables, null, 1), []);
  assert.deepEqual(redimensionnerTables(null, 1, 0.6), []);
});

test('table changée de salle : elle prend l’échelle de la nouvelle', () => {
  assert.deepEqual(tailleChangeeDeSalle({ largeur: 112, hauteur: 112 }, 1, 0.7), { largeur: 78.4, hauteur: 78.4 });
  assert.deepEqual(tailleChangeeDeSalle({ largeur: 78.4, hauteur: 78.4 }, 0.7, 1), { largeur: 112, hauteur: 112 });
  assert.deepEqual(tailleChangeeDeSalle({ largeur: 90, hauteur: 60 }, 0.8, 0.8), { largeur: 90, hauteur: 60 });
});

test('sous le seuil, la table ne porte que son numéro', () => {
  assert.equal(COTE_NUMERO_SEUL, 56);
  assert.equal(numeroSeul(40, 40), true);
  assert.equal(numeroSeul(120, 44), true);
  assert.equal(numeroSeul(56, 56), false);
  assert.equal(numeroSeul(90, 90), false);
});
