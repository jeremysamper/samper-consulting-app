// node --test : encaisser en espèces quand le réseau tombe (lot 07 du panel).
import test from 'node:test';
import assert from 'node:assert/strict';
import { classerRejeu, elementDeFile, peutEncaisserHorsLigne, ticketsHorsFile } from './horsLigne.js';
import { fusionnerReglages } from './reglages.js';
import { preparerPaiements, totalLignes } from './tva.js';

const LEGAL = { raison_sociale: 'Brasserie Démo SA', adresse: 'Place des Mélèzes 1', localite: '1950 Sion', numero_tva: 'CHE-123.456.788 TVA' };
const reglages = (plus = {}) => ({ ...fusionnerReglages({ especes_hors_ligne: true, legal: LEGAL, ...plus }), reglagesLus: true });
const LIGNES = [
  { id: 'l1', libelle: 'Tartare', quantite: 1, prix_unitaire: 32.5 },
  { id: 'l2', libelle: 'Café', quantite: 2, prix_unitaire: 4.2 },
];
const TICKET = { id: 't1', etablissement_id: 'etab-1', table_id: 'tb4', test: false, lignes: LIGNES, retrait_nom: 'Léa Favre' };
const ESPECES = [{ moyen: 'especes', montant: 40.9, recu: 50, pourboire: 0 }];
const REEL = { id: 'r1', actif: true, prestataire: 'payrexx' };
const SIMULE = { id: 's1', actif: true, prestataire: 'simule' };
const base = (plus = {}) => ({ reglages: reglages(), ticket: TICKET, paiements: ESPECES, terminaux: [], lectureTpe: 'sans', paiementEnRoute: null, ...plus });

test('réglage : faux par défaut, seul true allume', () => {
  assert.equal(fusionnerReglages(null).especes_hors_ligne, false);
  assert.equal(fusionnerReglages({ especes_hors_ligne: 'oui' }).especes_hors_ligne, false);
  assert.equal(fusionnerReglages({ especes_hors_ligne: 1 }).especes_hors_ligne, false);
  assert.equal(fusionnerReglages({ especes_hors_ligne: true }).especes_hors_ligne, true);
});

test('peutEncaisserHorsLigne : cas nominal', () => {
  assert.deepEqual(peutEncaisserHorsLigne(base()), { ok: true, code: null, raison: null });
});

test('peutEncaisserHorsLigne : réglage éteint, sans raison à afficher', () => {
  const v = peutEncaisserHorsLigne(base({ reglages: { ...fusionnerReglages({ legal: LEGAL }), reglagesLus: true } }));
  assert.equal(v.ok, false);
  assert.equal(v.code, 'eteint');
  assert.equal(v.raison, null);
});

test('peutEncaisserHorsLigne : réglages pas encore lus', () => {
  const v = peutEncaisserHorsLigne(base({ reglages: { ...reglages(), reglagesLus: false } }));
  assert.equal(v.code, 'reglages');
});

test('peutEncaisserHorsLigne : ticket de test', () => {
  const v = peutEncaisserHorsLigne(base({ ticket: { ...TICKET, test: true } }));
  assert.equal(v.ok, false);
  assert.equal(v.code, 'test');
  assert.ok(v.raison);
});

test('peutEncaisserHorsLigne : ticket vide', () => {
  assert.equal(peutEncaisserHorsLigne(base({ ticket: { ...TICKET, lignes: [] } })).code, 'vide');
});

test('peutEncaisserHorsLigne : paiement par carte dans la liste', () => {
  const v = peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'carte', montant: 10 }, { moyen: 'especes', montant: 30.9 }] }));
  assert.equal(v.code, 'moyen');
});

test('peutEncaisserHorsLigne : paiement avec tpe', () => {
  assert.equal(peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'especes', montant: 40.9, tpe: 'tx-1' }] })).code, 'moyen');
  assert.equal(peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'carte', montant: 40.9, tpe: 'tx-1' }] })).code, 'moyen');
});

test('peutEncaisserHorsLigne : paiement avec bonCadeau, ou sur la chambre', () => {
  assert.equal(peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'autre', libelle: 'Bon cadeau', montant: 40.9, bonCadeau: 'ABCD-2345' }] })).code, 'moyen');
  assert.equal(peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'especes', montant: 40.9, bonCadeau: 'ABCD-2345' }] })).code, 'moyen');
  assert.equal(peutEncaisserHorsLigne(base({ paiements: [{ moyen: 'autre', libelle: 'Chambre', montant: 40.9, sejourId: 's1' }] })).code, 'moyen');
});

test('peutEncaisserHorsLigne : coordonnées légales incomplètes', () => {
  const v = peutEncaisserHorsLigne(base({ reglages: reglages({ legal: { ...LEGAL, numero_tva: '' } }) }));
  assert.equal(v.code, 'legal');
});

test('peutEncaisserHorsLigne : terminal réel et lecture en échec', () => {
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [REEL], lectureTpe: 'echec' })).code, 'carte');
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [REEL], lectureTpe: 'lecture' })).code, 'carte');
});

test('peutEncaisserHorsLigne : terminal réel et lecture faite', () => {
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [REEL], lectureTpe: 'lue' })).ok, true);
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [REEL], lectureTpe: 'lue', paiementEnRoute: { id: 'tx' } })).code, 'en_route');
});

test('peutEncaisserHorsLigne : terminal simulé seul, ou terminal réel éteint', () => {
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [SIMULE], lectureTpe: 'echec' })).ok, true);
  assert.equal(peutEncaisserHorsLigne(base({ terminaux: [{ ...REEL, actif: false }], lectureTpe: 'echec' })).ok, true);
});

test('plusieurs paiements en espèces qui font le total', () => {
  const total = totalLignes(LIGNES); // 40.90
  const paiements = [
    { moyen: 'especes', montant: 20, recu: 20, pourboire: 0 },
    { moyen: 'especes', montant: 20.9, recu: 50, pourboire: 2 },
  ];
  assert.equal(peutEncaisserHorsLigne(base({ paiements })).ok, true);
  const controle = preparerPaiements({ total, paiements, arrondiEspeces: true });
  assert.equal(controle.complet, true);
  const e = elementDeFile({ clientUuid: 'u-1', ticket: TICKET, paiements, aEmporter: false, controle, userId: 'user-1', poste: 'poste-a', gesteAt: '2026-11-25T18:00:00.000Z', maintenant: 1 });
  assert.equal(e.paiements.length, 2);
  assert.equal(e.apercu.total, 40.9);
  assert.equal(e.apercu.rendu, controle.rendu);
  assert.equal(e.apercu.arrondi, controle.arrondi);
  assert.equal(e.apercu.pourboire, 2);
  assert.equal(e.apercu.du, controle.encaisse);
});

test('elementDeFile : forme, et ni nom ni adresse de client', () => {
  const paiements = [{ moyen: 'especes', libelle: null, montant: 40.9, recu: 50, pourboire: 0, partage: { mode: 'parts' } }];
  const controle = preparerPaiements({ total: 40.9, paiements, arrondiEspeces: true });
  const ticket = { ...TICKET, table_id: null, retrait_numero: 12, client_nom: 'Maximilienne Zurbriggen', client_adresse: 'Rue du Lac 3', qui: { nom: 'Zurbriggen' } };
  const e = elementDeFile({ clientUuid: 'u-2', ticket, paiements, aEmporter: true, controle, userId: 'user-1', poste: 'x'.repeat(80), gesteAt: '2026-11-25T18:00:00.000Z', maintenant: 42 });
  assert.deepEqual(Object.keys(e).sort(), ['aEmporter', 'apercu', 'clientUuid', 'createdAt', 'etablissementId', 'etat', 'gesteAt', 'motif', 'numero', 'paiements', 'poste', 'ticketId', 'userId'].sort());
  assert.equal(e.etat, 'attente');
  assert.equal(e.ticketId, 't1');
  assert.equal(e.etablissementId, 'etab-1');
  assert.equal(e.createdAt, 42);
  assert.equal(e.aEmporter, true);
  assert.equal(e.poste.length, 60);
  assert.equal(e.apercu.titre, 'Retrait n° 12');
  assert.deepEqual(e.paiements, [{ moyen: 'especes', libelle: null, montant: 40.9, recu: 50, pourboire: 0 }]);
  assert.deepEqual(e.apercu.lignes, [{ libelle: 'Tartare', quantite: 1, total: 32.5 }, { libelle: 'Café', quantite: 2, total: 8.4 }]);
  const texte = JSON.stringify(e);
  for (const interdit of ['Léa', 'Favre', 'Maximilienne', 'Zurbriggen', 'Rue du Lac', 'retrait_nom', 'client_nom', 'adresse']) {
    assert.equal(texte.includes(interdit), false, interdit);
  }
  // Un ticket à table ne porte pas de titre : la table se résout à l'écran.
  const aTable = elementDeFile({ clientUuid: 'u-3', ticket: TICKET, paiements, aEmporter: false, controle, userId: 'user-1', poste: null, gesteAt: 'x' });
  assert.equal(aTable.apercu.titre, null);
  assert.equal(aTable.apercu.tableId, 'tb4');
  assert.equal(aTable.poste, null);
});

test('classerRejeu : les quatre issues', () => {
  assert.equal(classerRejeu({ statut: 'rejoue', numero: 12 }, null), 'rejoue');
  assert.equal(classerRejeu({ statut: 'deja_encaisse', numero: 12 }, null), 'deja_encaisse');
  assert.equal(classerRejeu({ statut: 'refuse', motif: 'caisse: ticket introuvable' }, null), 'refuse');
  // Un doublon rend le statut d'origine.
  assert.equal(classerRejeu({ statut: 'rejoue', numero: 12, doublon: true }, null), 'rejoue');
  assert.equal(classerRejeu({ statut: 'refuse', doublon: true }, null), 'refuse');
  // Réponse illisible : on réessaie, on ne fige rien.
  assert.equal(classerRejeu(null, null), 'reessayer');
  assert.equal(classerRejeu({ statut: 'autre' }, null), 'reessayer');
});

test('classerRejeu : erreurs', () => {
  // Réseau : pas de code.
  assert.equal(classerRejeu(null, { message: 'TypeError: Failed to fetch' }), 'reessayer');
  assert.equal(classerRejeu(null, { message: 'x', code: '' }), 'reessayer');
  assert.equal(classerRejeu(null, { code: 'PGRST301', message: 'JWT expired' }), 'reessayer');
  assert.equal(classerRejeu(null, { code: 'PGRST202', message: 'Could not find the function' }), 'reessayer');
  // Refus de la caisse.
  assert.equal(classerRejeu(null, { code: '42501', message: 'caisse: acces refuse' }), 'refuse');
  assert.equal(classerRejeu(null, { code: 'P0001', message: 'caisse: hors ligne, especes seulement' }), 'refuse');
  // 42501 sans préfixe (RLS, droit d'exécution) : passager, on réessaie.
  assert.equal(classerRejeu(null, { code: '42501', message: 'permission denied for function caisse_encaisser_hors_ligne' }), 'reessayer');
  assert.equal(classerRejeu(null, { code: 'P0001', message: 'autre chose' }), 'reessayer');
  // Toute autre erreur : on réessaie.
  assert.equal(classerRejeu(null, { code: '40001', message: 'caisse: serialisation' }), 'reessayer');
  assert.equal(classerRejeu(null, { code: '57014', message: 'canceling statement due to statement timeout' }), 'reessayer');
});

test('ticketsHorsFile : retire le ticket en attente, garde les autres et le refusé', () => {
  const tickets = [{ id: 't1' }, { id: 't2' }, { id: 't3' }, { id: 't4' }];
  const file = [
    { ticketId: 't1', etat: 'attente' },
    { ticketId: 't2', etat: 'refuse' },
    { ticketId: 't3', etat: 'deja_encaisse' },
  ];
  assert.deepEqual(ticketsHorsFile(tickets, file).map((t) => t.id), ['t2', 't3', 't4']);
  assert.equal(ticketsHorsFile(tickets, []), tickets);
  assert.deepEqual(ticketsHorsFile(null, file), []);
  assert.deepEqual(ticketsHorsFile(tickets, null), tickets);
});
