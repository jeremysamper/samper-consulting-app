// node --test : calculs de la fiche client (ficheClient.js).
// Lancer : node --test src/modules/previsions/ficheClient.test.mjs
//      ou : npm.cmd run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filActivite, proprietes, suggestion, ficheClient, articleFavori, rythmeVisites,
  allergiesTexte, jourRelatif, totalTicket, HABITUE,
} from './ficheClient.js';

const AUJ = '2026-11-22';

const resa = (id, date, statut, extra = {}) => ({
  id, date_service: date, heure_arrivee: '12:00:00', service: 'midi', nb_couverts: 4,
  statut, tables: [], reservation_tags: [], notes_libres: null, ...extra,
});
const ligne = (libelle, quantite, prix) => ({ libelle, quantite, prix_unitaire: prix });
// Midi à Zurich en hiver = 11:00 UTC.
const ticket = (id, jourUtc, lignes, extra = {}) => ({
  id, statut: 'clos', created_at: `${jourUtc}T11:00:00Z`, couverts: 2,
  salle_tables: null, caisse_lignes: lignes, reservation_id: null, ...extra,
});

test('totalTicket : somme quantité fois prix, lignes illisibles à zéro', () => {
  assert.equal(totalTicket({ caisse_lignes: [ligne('A', 2, 10), ligne('B', 1, 5.5), ligne('C', 'x', 3)] }), 25.5);
  assert.equal(totalTicket(null), 0);
});

test('fil : visite passée, réservation à venir, note et allergie, du plus récent au plus ancien', () => {
  const historique = [
    resa('r1', '2026-10-04', 'parti', {
      tables: ['7'], notes_libres: 'Gâteau apporté par la famille',
      reservation_tags: [{ type_tag: 'allergene', valeur: 'fruits à coque', created_at: '2026-10-01T08:00:00Z' }],
    }),
    resa('r2', AUJ, 'confirme', { reservation_tags: [{ type_tag: 'occasion', valeur: 'anniversaire' }] }),
  ];
  const tickets = [ticket('t1', '2026-10-04', [ligne('Gamaret', 1, 58), ligne('Menu', 4, 38.5)], { reservation_id: 'r1' })];
  const fil = filActivite({ historique, tickets, aujourdhui: AUJ });
  assert.deepEqual(fil.map((e) => e.type), ['reservation', 'visite', 'note', 'allergie']);
  const [venir, visite, note, allergie] = fil;
  assert.equal(venir.etat, 'a_venir');
  assert.deepEqual(venir.occasions, ['anniversaire']);
  assert.equal(visite.montant, 212);
  assert.deepEqual(visite.tables, ['7']);
  assert.equal(note.texte, 'Gâteau apporté par la famille');
  assert.equal(allergie.libelle, 'fruits à coque');
  // Datée par l'étiquette (saisie le 1er octobre), pas par la visite.
  assert.equal(allergie.jour, '2026-10-01');
});

test('fil : les tickets d\'une même réservation font une seule visite, montants additionnés', () => {
  const historique = [resa('r1', '2026-11-10', 'parti')];
  const tickets = [
    ticket('t1', '2026-11-10', [ligne('Menu', 2, 40)], { reservation_id: 'r1' }),
    ticket('t2', '2026-11-10', [ligne('Menu', 2, 40)], { reservation_id: 'r1' }),
  ];
  const fil = filActivite({ historique, tickets, aujourdhui: AUJ });
  assert.equal(fil.length, 1);
  assert.equal(fil[0].montant, 160);
  assert.equal(fil[0].tickets.length, 2);
});

test('fil : un ticket sans réservation est une visite, datée à Zurich', () => {
  // 23:30 UTC le 14 = 00:30 le 15 à Zurich.
  const fil = filActivite({
    historique: [],
    tickets: [ticket('t9', '2026-11-14', [ligne('Café', 1, 4.5)], { created_at: '2026-11-14T23:30:00Z', salle_tables: { nom: '12' } })],
    aujourdhui: AUJ,
  });
  assert.equal(fil[0].type, 'visite');
  assert.equal(fil[0].jour, '2026-11-15');
  assert.equal(fil[0].heure, '00:30');
  assert.deepEqual(fil[0].tables, ['12']);
});

test('fil : statuts des réservations non venues', () => {
  const historique = [
    resa('a', '2026-11-01', 'annule'),
    resa('b', '2026-11-02', 'no_show'),
    resa('c', '2026-11-03', 'demande'),
    resa('d', '2026-12-03', 'demande'),
    resa('e', AUJ, 'arrive'),
    resa('f', '2026-11-05', 'confirme'),
  ];
  const fil = filActivite({ historique, tickets: [], aujourdhui: AUJ });
  const par = Object.fromEntries(fil.map((e) => [e.id, e]));
  assert.equal(par['r-a'].etat, 'annulee');
  assert.equal(par['r-b'].etat, 'no_show');
  assert.equal(par['r-c'].etat, 'non_confirmee');
  assert.equal(par['r-d'].etat, 'a_confirmer');
  assert.equal(par['v-e'].type, 'visite');
  // Confirmée et passée : comptée comme venue, sans montant faute de ticket.
  assert.equal(par['v-f'].type, 'visite');
  assert.equal(par['v-f'].montant, null);
});

test('fil : une allergie n\'apparaît qu\'une fois, à sa première saisie, accents et casse ignorés', () => {
  const historique = [
    resa('r1', '2026-09-01', 'parti', { reservation_tags: [{ type_tag: 'allergene', valeur: 'Céleri', created_at: '2026-08-30T10:00:00Z' }] }),
    resa('r2', '2026-10-01', 'parti', { reservation_tags: [{ type_tag: 'allergene', valeur: 'celeri', created_at: '2026-09-28T10:00:00Z' }] }),
  ];
  const allergies = filActivite({ historique, aujourdhui: AUJ }).filter((e) => e.type === 'allergie');
  assert.equal(allergies.length, 1);
  assert.equal(allergies[0].jour, '2026-08-30');
});

test('fil : vide sans données', () => {
  assert.deepEqual(filActivite({ historique: [], tickets: [], aujourdhui: AUJ }), []);
  assert.deepEqual(filActivite({ historique: null, tickets: null, aujourdhui: AUJ }), []);
});

test('propriétés : visites, dépense moyenne, table préférée, prochaine venue, no-shows', () => {
  const historique = [
    resa('r1', '2026-06-14', 'parti', { tables: ['7'] }),
    resa('r2', '2026-08-09', 'parti', { tables: ['3'] }),
    resa('r3', '2026-10-04', 'parti', { tables: ['7'] }),
    resa('r4', '2026-11-02', 'no_show'),
    resa('r5', '2026-12-05', 'confirme', { heure_arrivee: '19:30:00', nb_couverts: 2 }),
    resa('r6', '2026-11-30', 'demande', { heure_arrivee: '12:30:00', nb_couverts: 6 }),
  ];
  const tickets = [
    ticket('t1', '2026-06-14', [ligne('Menu', 1, 264)], { reservation_id: 'r1' }),
    ticket('t3', '2026-10-04', [ligne('Menu', 1, 212)], { reservation_id: 'r3' }),
  ];
  const fil = filActivite({ historique, tickets, aujourdhui: AUJ });
  const p = proprietes({ client: { allergies: '' }, historique, fil, aujourdhui: AUJ });
  assert.equal(p.visites, 3);
  assert.equal(p.premiere, '2026-06-14');
  assert.equal(p.derniere, '2026-10-04');
  // Moyenne sur les seules visites avec ticket.
  assert.equal(p.depenseMoyenne, 238);
  assert.deepEqual(p.tablePreferee, { nom: '7', fois: 2, sur: 3 });
  // La demande du 30.11 vient avant la réservation du 05.12.
  assert.deepEqual(p.prochaine, { jour: '2026-11-30', heure: '12:30', couverts: 6, etat: 'a_confirmer' });
  assert.equal(p.noShows, 1);
  assert.equal(p.etiquettes[0].libelle, 'Habitué');
});

test('propriétés : rien d\'inventé quand les données manquent', () => {
  const historique = [resa('r1', '2026-10-04', 'parti', { tables: ['7'] })];
  const fil = filActivite({ historique, aujourdhui: AUJ });
  const p = proprietes({ client: {}, historique, fil, aujourdhui: AUJ });
  assert.equal(p.visites, 1);
  assert.equal(p.depenseMoyenne, null);
  // Une seule visite à la table 7 : pas encore une préférence.
  assert.equal(p.tablePreferee, null);
  assert.equal(p.prochaine, null);
  assert.deepEqual(p.etiquettes, []);
  assert.deepEqual(p.allergies, []);
});

test('propriétés : allergies de la fiche puis des réservations, sans doublon', () => {
  const historique = [
    resa('r1', '2026-10-04', 'parti', { reservation_tags: [
      { type_tag: 'allergene', valeur: 'gluten', created_at: '2026-10-01T08:00:00Z' },
      { type_tag: 'allergene', valeur: 'fruits à coque', created_at: '2026-10-01T08:00:00Z' },
      { type_tag: 'regime', valeur: 'vegetarien' },
      { type_tag: 'autre', valeur: 'vin rouge' },
      { type_tag: 'occasion', valeur: 'anniversaire' },
    ] }),
    resa('r2', '2026-11-04', 'parti', { reservation_tags: [{ type_tag: 'autre', valeur: 'Vin rouge' }] }),
  ];
  const fil = filActivite({ historique, aujourdhui: AUJ });
  const p = proprietes({ client: { allergies: 'Gluten, lactose' }, historique, fil, aujourdhui: AUJ });
  assert.deepEqual(p.allergies, ['Gluten', 'lactose', 'fruits à coque']);
  // Vin rouge deux fois d'abord ; les occasions restent sur leur réservation.
  assert.deepEqual(p.etiquettes.map((e) => e.libelle), ['vin rouge', 'végétarien']);
});

test('allergiesTexte : virgules, points-virgules, barres et retours à la ligne', () => {
  assert.deepEqual(allergiesTexte('Gluten; lactose / sésame\nGLUTEN'), ['Gluten', 'lactose', 'sésame']);
  assert.deepEqual(allergiesTexte(null), []);
});

test('article favori : la dépense départage les articles fréquents, l\'eau ne gagne pas', () => {
  const v = (lignes) => ({ type: 'visite', tickets: [{ caisse_lignes: lignes }] });
  const visites = [
    v([ligne('Eau minérale', 2, 6), ligne('Gamaret', 1, 58)]),
    v([ligne('Eau minérale', 1, 6), ligne('Gamaret', 1, 58)]),
    v([ligne('Eau minérale', 2, 6), ligne('Gamaret', 1, 58)]),
    v([ligne('Eau minérale', 1, 6), ligne('Chasselas', 1, 49)]),
    v([ligne('Eau minérale', 1, 6), ligne('Gamaret', 1, 58)]),
  ];
  assert.deepEqual(articleFavori(visites), { libelle: 'Gamaret', visites: 4, sur: 5 });
});

test('article favori : rien sous deux visites ou sous la moitié des visites', () => {
  const v = (lignes) => ({ type: 'visite', tickets: [{ caisse_lignes: lignes }] });
  assert.equal(articleFavori([v([ligne('Gamaret', 1, 58)])]), null);
  const dispersees = [v([ligne('A', 1, 10)]), v([ligne('B', 1, 10)]), v([ligne('C', 1, 10)]), v([ligne('A', 1, 10)]), v([ligne('D', 1, 10)])];
  assert.equal(articleFavori(dispersees), null);
});

test('rythme : semaines, mois, et rien sous trois visites', () => {
  assert.equal(rythmeVisites(['2026-01-01', '2026-02-01']), null);
  assert.deepEqual(rythmeVisites(['2026-11-01', '2026-11-08', '2026-11-15']), { unite: 'semaine', n: 1 });
  assert.deepEqual(rythmeVisites(['2026-09-01', '2026-09-22', '2026-10-13']), { unite: 'semaine', n: 3 });
  assert.deepEqual(rythmeVisites(['2026-04-14', '2026-06-14', '2026-08-09', '2026-10-04']), { unite: 'mois', n: 2 });
  assert.equal(rythmeVisites(['2022-01-01', '2024-01-01', '2026-01-01']), null);
});

test('suggestion : null quand les données ne suffisent pas', () => {
  const historique = [resa('r1', '2026-10-04', 'parti')];
  assert.equal(suggestion({ fil: filActivite({ historique, aujourdhui: AUJ }), aujourdhui: AUJ }), null);
});

test('ficheClient : un habitué avec ses tickets reçoit une suggestion complète', () => {
  const dates = ['2026-04-14', '2026-06-14', '2026-08-09', '2026-10-04'];
  const historique = dates.map((d, i) => resa(`r${i}`, d, 'parti', { tables: ['7'] }));
  const tickets = dates.map((d, i) => ticket(`t${i}`, d, [ligne('Gamaret', 1, 58), ligne('Eau', 2, 6)], { reservation_id: `r${i}` }));
  const f = ficheClient({ client: { allergies: '' }, historique, tickets, aujourdhui: AUJ });
  assert.equal(f.proprietes.visites, 4);
  assert.ok(f.proprietes.visites >= HABITUE);
  assert.deepEqual(f.suggestion.article, { libelle: 'Gamaret', visites: 4, sur: 4 });
  assert.deepEqual(f.suggestion.rythme, { unite: 'mois', n: 2 });
});

test('jourRelatif : hier, aujourd\'hui, demain, sinon la date suisse', () => {
  assert.deepEqual(jourRelatif('2026-11-22', AUJ), { mot: 'aujourdhui', date: '22.11.2026' });
  assert.deepEqual(jourRelatif('2026-11-21', AUJ), { mot: 'hier', date: '21.11.2026' });
  assert.deepEqual(jourRelatif('2026-11-23', AUJ), { mot: 'demain', date: '23.11.2026' });
  assert.deepEqual(jourRelatif('2026-10-04', AUJ), { mot: null, date: '04.10.2026' });
  // Passage à l'heure d'hiver : un écart d'un jour reste un jour.
  assert.deepEqual(jourRelatif('2026-10-25', '2026-10-24').mot, 'demain');
});
