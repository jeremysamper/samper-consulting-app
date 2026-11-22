// node --test : choix de la table en réservant en ligne (lot L9). Tables
// libres pour un créneau, réponse du plan pour la démo, cadrage au téléphone,
// et règle de durée identique dans l'app et dans la migration.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DUREE_TABLEE } from '../modules/salle/planTemps.js';
import {
  DEMANDE_JOURS, DEMANDE_MIN, DEMANDE_PART, ECART_PLACES, cadragePlan, dureeTablee, ecartContours, entreeDe,
  planEnLigne, reperesTable, serviceDeLHeure, tableConvient, tablesDemandees, tablesLibres,
} from './choixTable.js';

const ETAB = 'etab-x';
const SALLES = [
  { id: 's1', etablissement_id: ETAB, nom: 'Salle', ordre: 0, actif: true },
  { id: 's2', etablissement_id: ETAB, nom: 'Terrasse', ordre: 1, actif: true },
];
const T = (id, places, salle = 's1', extra = {}) => ({
  id, etablissement_id: ETAB, salle_id: salle, nom: id.replace('t', ''), nb_places: places, forme: 'carree',
  pos_x: 100, pos_y: 100, largeur: 90, hauteur: 90, actif: true, ...extra,
});
const TABLES = [T('t1', 2), T('t2', 2), T('t3', 4), T('t4', 8), T('t5', 2, 's1', { forme: 'tabouret' }), T('t6', 2, 's2')];
const R = (id, heure, statut = 'confirme', service = 'midi') => ({
  id, etablissement_id: ETAB, date_service: '2026-11-25', heure_arrivee: heure, nb_couverts: 2, statut, service,
});

const libres = (opts) => [...tablesLibres({
  tables: TABLES, salles: SALLES, reservations: [], liens: [], etablissementId: ETAB,
  service: 'midi', heure: '12:00', personnes: 2, sallesOuvertes: ['s1'], ...opts,
})].sort();

test('règle de durée : la migration dit la même chose que planTemps.js', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261122_reservation_choix_table.sql', import.meta.url)), 'utf8');
  for (const [service, minutes] of Object.entries(DUREE_TABLEE)) {
    assert.match(sql, new RegExp(`when '${service}'\\s+then ${minutes}\\b`), `durée ${service}`);
  }
  assert.match(sql, new RegExp(`else ${DUREE_TABLEE.soir}\\b`));
  assert.match(sql, new RegExp(`t\\.nb_places <= p_couverts \\+ ${ECART_PLACES}\\b`));
  assert.equal(dureeTablee('inconnu'), DUREE_TABLEE.soir);
});

test('une table convient : assez de places, deux de trop au plus, tabouret pour une personne', () => {
  assert.equal(tableConvient({ nb_places: 2 }, 2), true);
  assert.equal(tableConvient({ nb_places: 4 }, 2), true);
  assert.equal(tableConvient({ nb_places: 5 }, 2), false);
  assert.equal(tableConvient({ nb_places: 2 }, 3), false);
  assert.equal(tableConvient({ places: 4 }, 3), true);
  assert.equal(tableConvient({ nb_places: 2, forme: 'tabouret' }, 1), true);
  assert.equal(tableConvient({ nb_places: 2, forme: 'tabouret' }, 2), false);
  assert.equal(tableConvient({ nb_places: 2 }, 0), false);
});

test('tables libres : salle ouverte seulement, à la bonne taille', () => {
  assert.deepEqual(libres(), ['t1', 't2', 't3']);
  assert.deepEqual(libres({ personnes: 1 }), ['t1', 't2', 't5']);
  assert.deepEqual(libres({ personnes: 6 }), ['t4']);
  assert.deepEqual(libres({ sallesOuvertes: ['s2'] }), ['t6']);
  assert.deepEqual(libres({ sallesOuvertes: [] }), []);
  const salleFermee = SALLES.map((s) => (s.id === 's1' ? { ...s, actif: false } : s));
  assert.deepEqual(libres({ salles: salleFermee }), []);
});

test('tables libres : une réservation vivante qui chevauche prend la table, la rotation la rend', () => {
  const reservations = [R('a', '12:00'), R('b', '12:30', 'annule'), R('c', '12:30', 'no_show')];
  const liens = [{ reservation_id: 'a', table_id: 't1' }, { reservation_id: 'b', table_id: 't2' }, { reservation_id: 'c', table_id: 't3' }];
  assert.deepEqual(libres({ reservations, liens }), ['t2', 't3']);
  // Midi : 1 h 30. À 13:15 la tablée de 12:00 est encore là, à 13:30 elle est partie.
  assert.deepEqual(libres({ reservations, liens, heure: '13:15' }), ['t2', 't3']);
  assert.deepEqual(libres({ reservations, liens, heure: '13:30' }), ['t1', 't2', 't3']);
  // Une arrivée à 11:00 pour 12:00 chevauche aussi.
  assert.deepEqual(libres({ reservations, liens, heure: '11:00' }), ['t2', 't3']);
  // Le soir dure 2 h : une réservation du soir à 19:00 tient la table jusqu'à 21:00.
  const soir = [R('s', '19:00', 'confirme', 'soir')];
  const lienSoir = [{ reservation_id: 's', table_id: 't1' }];
  assert.deepEqual(libres({ reservations: soir, liens: lienSoir, service: 'soir', heure: '20:45' }), ['t2', 't3']);
  assert.deepEqual(libres({ reservations: soir, liens: lienSoir, service: 'soir', heure: '21:00' }), ['t1', 't2', 't3']);
});

test('tables libres : un client arrivé aujourd’hui garde sa table jusqu’à maintenant + 15', () => {
  const reservations = [R('a', '12:00', 'arrive')];
  const liens = [{ reservation_id: 'a', table_id: 't1' }];
  assert.deepEqual(libres({ reservations, liens, heure: '13:30', maintenant: 13 * 60 + 40 }), ['t2', 't3']);
  assert.deepEqual(libres({ reservations, liens, heure: '13:30' }), ['t1', 't2', 't3']);
});

test('tables libres : une table rapprochée pour ce service n’est pas proposée', () => {
  const ajustements = [{ table_id: 't2', service: 'midi', fusion: 't2' }, { table_id: 't3', service: 'soir', fusion: 't3' }];
  assert.deepEqual(libres({ ajustements }), ['t1', 't3']);
});

test('service de l’heure : celui demandé s’il ouvre, sinon le premier qui ouvre', () => {
  const h = { 3: { midi: { de: '12:00', a: '13:30' }, soir: { de: '19:00', a: '21:00' }, brunch: { de: '10:00', a: '12:00' } } };
  assert.equal(serviceDeLHeure(h, 3, '12:00'), 'midi');
  assert.equal(serviceDeLHeure(h, 3, '12:00', 'brunch'), 'brunch');
  assert.equal(serviceDeLHeure(h, 3, '20:00', 'midi'), null);
  assert.equal(serviceDeLHeure(h, 3, '15:00'), null);
  assert.equal(serviceDeLHeure(h, 4, '12:00'), null);
});

const PARAMS = {
  etablissement_id: ETAB, en_ligne_actif: true, choix_table: true, salles_choix_table: ['s1'], max_couverts: 8,
  horizon_jours: 60, jours_fermes: [], services_fermes: {}, delai_min_heures: 2,
  // 2026-11-25 est un mercredi (3).
  horaires: { 3: { midi: { de: '12:00', a: '13:30' }, soir: { de: '19:00', a: '21:00' } } },
};
const plan = (opts = {}) => planEnLigne({
  params: PARAMS, salles: SALLES, tables: TABLES, elements: [], reservations: [R('a', '12:00')],
  liens: [{ reservation_id: 'a', table_id: 't1' }], jour: '2026-11-25', heure: '12:00', personnes: 2,
  aujourdhui: '2026-11-22', maintenant: 600, ...opts,
});

test('plan de la démo : même forme que la RPC, rien sur une table prise', () => {
  const p = plan();
  assert.equal(p.ouvert, true);
  assert.equal(p.service, 'midi');
  assert.deepEqual(p.salles.map((s) => s.nom), ['Salle']);
  const t1 = p.salles[0].tables.find((t) => t.places === 2 && !t.libre && t.forme === 'carree');
  assert.deepEqual([t1.id, t1.nom, t1.libre], [null, null, false]);
  const t2 = p.salles[0].tables.find((t) => t.id === 't2');
  assert.equal(t2.nom, '2');
  for (const t of p.salles[0].tables) {
    assert.deepEqual(Object.keys(t).sort(), ['demandee', 'forme', 'hauteur', 'id', 'largeur', 'libre', 'nom', 'pivotee', 'places', 'x', 'y']);
  }
  assert.equal(JSON.stringify(p).includes('confirme'), false);
});

test('plan de la démo : quart de tour et place du service', () => {
  const ajustements = [{ table_id: 't3', date_service: '2026-11-25', service: 'midi', pos_x: 300, pos_y: 200, pivotee: true }];
  const t3 = plan({ ajustements, tables: TABLES.map((t) => (t.id === 't3' ? { ...t, largeur: 120, hauteur: 80 } : t)) })
    .salles[0].tables.find((t) => t.id === 't3');
  assert.deepEqual([t3.x, t3.y, t3.largeur, t3.hauteur, t3.pivotee], [300, 200, 80, 120, true]);
});

test('plan de la démo : fermé hors réglage, hors horizon, hors heures, sous le délai', () => {
  assert.equal(plan({ params: { ...PARAMS, choix_table: false } }).ouvert, false);
  assert.equal(plan({ params: { ...PARAMS, salles_choix_table: [] } }).ouvert, false);
  assert.equal(plan({ jour: '2026-11-21' }).raison, 'jour');
  assert.equal(plan({ jour: '2027-03-01' }).raison, 'jour');
  assert.equal(plan({ heure: '15:00' }).raison, 'horaire');
  assert.equal(plan({ personnes: 9 }).raison, 'couverts');
  assert.equal(plan({ params: { ...PARAMS, services_fermes: { '2026-11-25': ['midi'] } } }).raison, 'jour');
  // Le jour même, l'heure doit respecter le délai minimal (2 h).
  assert.equal(plan({ jour: '2026-11-22', heure: '12:00', maintenant: 10 * 60 + 30, params: { ...PARAMS, horaires: { 7: PARAMS.horaires[3] } } }).raison, 'horaire');
  assert.equal(plan({ jour: '2026-11-22', heure: '12:00', maintenant: 9 * 60 + 30, params: { ...PARAMS, horaires: { 7: PARAMS.horaires[3] } } }).ouvert, true);
});

test('cadrage : la salle tient dans la largeur quand les tables restent touchables', () => {
  const salle = { tables: [{ x: 100, y: 100, largeur: 90, hauteur: 90 }, { x: 400, y: 100, largeur: 90, hauteur: 90 }], decor: [] };
  const c = cadragePlan(salle, 343);
  assert.equal(c.defile, false);
  assert.ok(c.largeur <= 343);
  assert.ok(90 * c.k >= 44);
});

test('cadrage : une grande salle au téléphone garde des tables de 44 px et défile', () => {
  const tables = Array.from({ length: 10 }, (_, i) => ({ x: 20 + i * 95, y: 100, largeur: 70, hauteur: 70 }));
  const c = cadragePlan({ tables, decor: [] }, 343);
  assert.equal(c.defile, true);
  assert.ok(70 * c.k >= 44 - 0.01);
  assert.ok(c.largeur > 343);
});

test('cadrage : une petite salle ne grossit pas au-delà de l’échelle maximale', () => {
  const c = cadragePlan({ tables: [{ x: 0, y: 0, largeur: 90, hauteur: 90 }], decor: [] }, 1200);
  assert.ok(c.k <= 1.1);
  assert.equal(c.defile, false);
});

// ── Tables les plus demandées ──
const passee = (id, jour, statut = 'parti') => ({ id, etablissement_id: ETAB, date_service: jour, statut });
const demandees = (reservations, liens, opts = {}) => [...tablesDemandees({
  tables: TABLES, reservations, liens, etablissementId: ETAB, sallesOuvertes: ['s1'], aujourdhui: '2026-11-22', ...opts,
})].sort();
// n réservations passées sur la table, à des jours différents.
const sur = (table, n, depart = 0, statut = 'parti') => Array.from({ length: n }, (_, k) => {
  const jour = new Date(Date.UTC(2026, 10, 21 - depart - k)).toISOString().slice(0, 10);
  return { r: passee(`${table}-${depart + k}`, jour, statut), l: { reservation_id: `${table}-${depart + k}`, table_id: table } };
});
const histoire = (...lots) => ({ reservations: lots.flat().map((x) => x.r), liens: lots.flat().map((x) => x.l) });

test('tables demandées : les plus réservées des salles ouvertes, à 3 réservations au moins', () => {
  // s1 a 5 tables : 15 % donne 1 place au classement.
  const h = histoire(sur('t1', 4), sur('t2', 2), sur('t6', 9));
  assert.deepEqual(demandees(h.reservations, h.liens), ['t1']);
  const peu = histoire(sur('t1', 2));
  assert.deepEqual(demandees(peu.reservations, peu.liens), [], 'deux réservations ne suffisent pas');
});

test('tables demandées : ex aequo compris, annulées, no-shows et futures exclues, 90 jours', () => {
  const ex = histoire(sur('t1', 3), sur('t2', 3));
  assert.deepEqual(demandees(ex.reservations, ex.liens), ['t1', 't2']);
  const annulees = histoire(sur('t1', 5, 0, 'annule'), sur('t2', 5, 10, 'no_show'));
  assert.deepEqual(demandees(annulees.reservations, annulees.liens), []);
  const vieilles = histoire(sur('t1', 4, DEMANDE_JOURS));
  assert.deepEqual(demandees(vieilles.reservations, vieilles.liens), [], 'au-delà de 90 jours');
  const futures = { reservations: [0, 1, 2, 3].map((k) => passee(`f${k}`, `2026-11-2${2 + k}`, 'confirme')), liens: [0, 1, 2, 3].map((k) => ({ reservation_id: `f${k}`, table_id: 't1' })) };
  assert.deepEqual(demandees(futures.reservations, futures.liens), [], 'le jour même et après ne comptent pas');
});

test('tables demandées : la migration dit la même chose', () => {
  const sql = readFileSync(fileURLToPath(new URL('../../supabase/migrations/20261122_table_en_ligne_reperes.sql', import.meta.url)), 'utf8');
  assert.ok(sql.includes(`r.date_service >= v_auj - ${DEMANDE_JOURS} and r.date_service < v_auj`), 'fenêtre de 90 jours');
  assert.ok(sql.includes(`n >= ${DEMANDE_MIN} and rg <= ceil(total * ${DEMANDE_PART})`), 'seuil et part du classement');
  assert.ok(sql.includes("r.statut not in ('annule', 'no_show')"), 'statuts exclus');
});

test('plan de la démo : demandee par table, nom des zones seulement', () => {
  const h = histoire(sur('t2', 4));
  const p = plan({
    reservations: [R('a', '12:00'), ...h.reservations], liens: [{ reservation_id: 'a', table_id: 't1' }, ...h.liens],
    elements: [
      { salle_id: 's1', etablissement_id: ETAB, type: 'zone', libelle: ' Terrasse ', pos_x: 0, pos_y: 0, largeur: 200, hauteur: 200 },
      { salle_id: 's1', etablissement_id: ETAB, type: 'bar', libelle: 'Bar du fond', pos_x: 0, pos_y: 300, largeur: 200, hauteur: 60 },
    ],
  });
  const t2 = p.salles[0].tables.find((t) => t.id === 't2');
  assert.equal(t2.demandee, true);
  assert.equal(p.salles[0].tables.filter((t) => t.demandee).length, 1);
  assert.deepEqual(p.salles[0].decor.map((d) => d.libelle), ['Terrasse', null]);
});

// ── Repères d'une table ──
const rect = (x, y, largeur = 90, hauteur = 90, extra = {}) => ({ x, y, largeur, hauteur, ...extra });

test('écart entre contours : nul au contact, droit sur un axe, en diagonale sinon', () => {
  assert.equal(ecartContours(rect(0, 0), rect(90, 0)), 0);
  assert.equal(ecartContours(rect(0, 0), rect(50, 50)), 0);
  assert.equal(ecartContours(rect(0, 0), rect(0, 130)), 40);
  assert.equal(ecartContours(rect(0, 0), rect(120, 130)), 50);
});

test('entrée : la seule porte, ou la plus proche de l’accueil, sinon aucune', () => {
  const p1 = rect(900, 500, 70, 70, { type: 'porte' });
  const p2 = rect(0, 500, 70, 70, { type: 'porte' });
  assert.equal(entreeDe([p1, rect(0, 0, 300, 10, { type: 'mur' })]), p1);
  assert.equal(entreeDe([p1, p2, rect(800, 600, 120, 60, { type: 'accueil' })]), p1);
  assert.equal(entreeDe([p1, p2]), null);
  assert.equal(entreeDe([]), null);
});

test('repères : baie vitrée, entrée, terrasse par la salle ou par une zone nommée', () => {
  const salle = {
    nom: 'Salle',
    decor: [
      rect(0, 0, 1000, 10, { type: 'baie' }),
      rect(930, 500, 70, 70, { type: 'porte' }),
      rect(0, 600, 300, 200, { type: 'zone', libelle: 'Terrasse couverte' }),
    ],
  };
  assert.deepEqual(reperesTable(rect(30, 40), salle), ['vitres']);
  assert.deepEqual(reperesTable(rect(30, 200), salle), []);
  assert.deepEqual(reperesTable(rect(870, 350, 96, 96), salle), ['entree']);
  assert.deepEqual(reperesTable(rect(100, 650), salle), ['terrasse']);
  assert.deepEqual(reperesTable(rect(30, 40), { nom: 'La terrasse', decor: salle.decor }), ['terrasse', 'vitres']);
});
