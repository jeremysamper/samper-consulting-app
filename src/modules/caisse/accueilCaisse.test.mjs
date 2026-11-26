// node --test src/modules/caisse/accueilCaisse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  etatTicket, etatOccupee, etatLibre, compterEtats, reservationsDuService, aFaireMaintenant, commandeEnRetard,
} from './accueilCaisse.js';

const T0 = Date.parse('2026-11-26T18:00:00Z');
const ilYa = (min) => new Date(T0 - min * 60000).toISOString();
const ligne = (p) => ({ quantite: 1, prix_unitaire: 10, suite: 1, statut: 'en_attente', ...p });
const ticket = (lignes, ouvertIlYa = 5) => ({ id: 'k', created_at: ilYa(ouvertIlYa), lignes });
const etat = (t) => etatOccupee(etatTicket(t, T0));

test('un ticket sans envoi est à commander, signalé après 10 minutes', () => {
  assert.equal(etat(ticket([])), 'commander');
  assert.equal(etat(ticket([ligne()])), 'commander');
  assert.equal(commandeEnRetard(etatTicket(ticket([], 9), T0)), false);
  assert.equal(commandeEnRetard(etatTicket(ticket([], 10), T0)), true);
});

test('envoyé sans plat fait : en cuisine ; un plat fait non servi : prêt', () => {
  assert.equal(etat(ticket([ligne({ statut: 'envoye', envoye_at: ilYa(4) })])), 'cuisine');
  const pret = ticket([
    ligne({ statut: 'envoye', envoye_at: ilYa(12), pret_at: ilYa(1) }),
    ligne({ statut: 'envoye', envoye_at: ilYa(12) }),
  ]);
  assert.equal(etat(pret), 'pret');
  assert.equal(etatTicket(pret, T0).minutes, 12);
});

test('une boisson partie ne tient pas la table en cuisine', () => {
  const t = ticket([
    ligne({ plat_id: 'biere', statut: 'envoye', envoye_at: ilYa(6) }),
    ligne({ plat_id: 'rosti', statut: 'servi', envoye_at: ilYa(6), pret_at: ilYa(2) }),
  ]);
  assert.equal(etatOccupee(etatTicket(t, T0)), 'cuisine');
  assert.equal(etatOccupee(etatTicket(t, T0, { boissons: new Set(['biere']) })), 'servi');
});

test('tout servi : à suivre si une suite attend, servi sinon', () => {
  const servi = ligne({ statut: 'servi', envoye_at: ilYa(20), pret_at: ilYa(10) });
  assert.equal(etat(ticket([servi, ligne({ suite: 2 })])), 'suite');
  assert.equal(etat(ticket([servi])), 'servi');
});

test('une table réservée loin de son heure reste libre jusqu\'à cette heure', () => {
  const maintenant = 19 * 60;
  assert.deepEqual(etatLibre(null, maintenant), { etat: 'libre' });
  assert.deepEqual(etatLibre({ heure: '20:30:00', minutes: 20 * 60 + 30, statut: 'confirme' }, maintenant), { etat: 'libre', jusqua: '20:30' });
  assert.deepEqual(etatLibre({ heure: '19:45:00', minutes: 19 * 60 + 45, statut: 'confirme' }, maintenant), { etat: 'reservee', retard: 0 });
  assert.deepEqual(etatLibre({ heure: '18:40:00', minutes: 18 * 60 + 40, statut: 'confirme' }, maintenant), { etat: 'reservee', retard: 20 });
  assert.equal(etatLibre({ heure: '22:00:00', minutes: 22 * 60, statut: 'arrive' }, maintenant).etat, 'reservee');
});

test('compterEtats compte chaque état, zéro compris', () => {
  const c = compterEtats(['libre', 'pret', 'libre', 'inconnu']);
  assert.equal(c.libre, 2);
  assert.equal(c.pret, 1);
  assert.equal(c.cuisine, 0);
});

const JOUR = '2026-11-26';
const resa = (id, heure, statut = 'confirme', p = {}) => ({
  id, nom: id, heure_arrivee: heure, statut, date_service: JOUR, service: 'soir', nb_couverts: 2, ...p,
});

test('reservationsDuService range le service du moment, rien d\'autre', () => {
  const liste = [
    resa('a', '19:00:00', 'arrive'),
    resa('b', '18:30:00', 'parti', { nb_couverts: 4 }),
    resa('c', '19:30:00', 'confirme'),
    resa('d', '20:00:00', 'confirme'),
    resa('e', '19:10:00', 'confirme'),
    resa('f', '18:00:00', 'no_show'),
    resa('g', '19:20:00', 'demande'),
    resa('h', '12:00:00', 'confirme', { service: 'midi' }),
    resa('i', '19:15:00', 'confirme', { date_service: '2026-11-25' }),
    resa('j', '19:05:00', 'confirme'),
  ];
  const s = reservationsDuService(liste, {
    jour: JOUR, service: 'soir', tickets: [{ reservation_id: 'j' }], maintenantMinutes: 19 * 60 + 45, delaiMinutes: 30,
  });
  assert.deepEqual(s.arrivees.map((r) => r.id), ['b', 'a', 'j']);
  // Seule une arrivée sans ticket ouvert libère sa table (pas une partie).
  assert.deepEqual(s.arrivees.map((r) => [r.id, r.peutLiberer]), [['b', false], ['a', true], ['j', false]]);
  assert.deepEqual(s.prevues.map((r) => r.id), ['d']);
  assert.deepEqual(s.retard.map((r) => [r.id, r.retard, r.peutNoShow]), [['e', 35, true], ['c', 15, false]]);
  assert.deepEqual(s.noShow.map((r) => r.id), ['f']);
  assert.equal(s.couverts.arrivees, 8);
  assert.equal(s.prochaine, '20:00');
});

test('aFaireMaintenant : prêts, retards à trancher, commandes en attente, suites', () => {
  const x = (nom, etatT, e) => ({ table: { nom }, ticket: { id: nom }, etat: etatT, e });
  const tablees = [
    x('7', 'suite', { minutes: 25 }),
    x('3', 'commander', { sansEnvoi: 12 }),
    x('9', 'commander', { sansEnvoi: 4 }),
    x('5', 'pret', { prets: 1 }),
    x('2', 'pret', { prets: 3 }),
    x('4', 'cuisine', { minutes: 8 }),
  ];
  const retards = [{ id: 'r1', peutNoShow: true }, { id: 'r2', peutNoShow: false }];
  assert.deepEqual(aFaireMaintenant({ tablees, retards }).map((a) => a.cle), ['p-2', 'p-5', 'r-r1', 'c-3', 's-7']);
  assert.deepEqual(aFaireMaintenant(), []);
});
