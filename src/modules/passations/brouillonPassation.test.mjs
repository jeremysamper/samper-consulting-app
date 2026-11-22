import test from 'node:test';
import assert from 'node:assert/strict';
import { brouillonPassation, prochainService, serviceDeLHeure } from './brouillonPassation.js';

test('service de passation selon l\'heure', () => {
  assert.equal(serviceDeLHeure(9 * 60), 'matin');
  assert.equal(serviceDeLHeure(14 * 60 + 59), 'matin');
  assert.equal(serviceDeLHeure(16 * 60), 'apres_midi');
  assert.equal(serviceDeLHeure(22 * 60), 'soir');
  assert.equal(serviceDeLHeure(23 * 60 + 45), 'nuit');
  assert.equal(serviceDeLHeure(2 * 60), 'nuit');
});

test('prochain service : midi avant 11 h, le soir avant 18 h, sinon demain midi', () => {
  assert.deepEqual(prochainService('2026-11-18', 30), { jour: '2026-11-18', service: 'midi' });
  assert.deepEqual(prochainService('2026-11-18', 14 * 60), { jour: '2026-11-18', service: 'soir' });
  assert.deepEqual(prochainService('2026-11-18', 22 * 60), { jour: '2026-11-19', service: 'midi' });
});

test('brouillon complet : pertes, relevé hors norme, tâches, réservations', () => {
  const { texte, sections } = brouillonPassation({
    aujourdhui: '2026-11-18',
    prochain: { jour: '2026-11-19', service: 'midi' },
    pertes: [{ produit: 'saumon', quantite: 2, unite: 'kg', motif: 'DLC dépassée' }, { produit: 'crème', quantite: 0.5, unite: 'l', motif: 'Surproduction' }],
    relevesHors: [{ zoneNom: 'Chambre froide 2', valeur: 7.5, unite: '°C', heure: '14:10:00' }],
    tachesRestantes: ['Nettoyer la hotte', 'Commander le pain'],
    reservations: [{ nb_couverts: 4, statut: 'confirme' }, { nb_couverts: 12, est_groupe: true, nom: 'Dupont', statut: 'confirme' }, { nb_couverts: 6, statut: 'annule' }],
  });
  assert.equal(sections, 4);
  assert.equal(texte, [
    'Pertes du jour : 2 kg de saumon (DLC dépassée) et 0,5 l de crème (surproduction).',
    'Chambre froide 2 était à 7,5 °C à 14 h 10. Vérifiez-le au prochain relevé.',
    'Tâches non faites : Nettoyer la hotte et Commander le pain.',
    'Demain midi : 16 couverts réservés en 2 réservations, dont le groupe Dupont.',
  ].join('\n'));
});

test('rien à dire : une phrase, jamais un texte inventé', () => {
  assert.deepEqual(brouillonPassation({}), { texte: 'Rien de particulier à signaler pour ce service.', sections: 0 });
  const r = brouillonPassation({ aujourdhui: '2026-11-18', prochain: { jour: '2026-11-18', service: 'soir' } });
  assert.equal(r.texte, "Ce soir : aucune réservation pour l'instant.");
});

// Lot 6b : le pôle choisit les rubriques.
test('par pôle : la réception lit l\'hôtel, jamais les pertes de la cuisine', () => {
  const donnees = {
    aujourdhui: '2026-11-22',
    prochain: { jour: '2026-11-23', service: 'midi' },
    pertes: [{ produit: 'beurre blanc', quantite: 0.5, unite: 'l', motif: 'Surproduction' }],
    tachesRestantes: ['Préparer les arrivées du lendemain'],
    hotel: { arriveesDemain: 2, departsDemain: 1, demandes: [{ titre: 'Fuite sous le lavabo', priorite: 'urgente' }, { titre: 'Taxi', priorite: 'normale' }], aFaire: 3, horsService: ['304'], ordres: [] },
  };
  const reception = brouillonPassation({ ...donnees, pole: 'reception' });
  assert.equal(reception.texte, [
    'Demain : 2 arrivées et 1 départ.',
    '2 demandes ouvertes, dont Fuite sous le lavabo.',
    'Tâches non faites : Préparer les arrivées du lendemain.',
  ].join('\n'));
  const etages = brouillonPassation({ ...donnees, pole: 'etages', tachesRestantes: [] });
  assert.equal(etages.texte, ['Demain : 2 arrivées et 1 départ.', '3 chambres restent à faire.', 'Hors service : chambre 304.'].join('\n'));
  const cuisine = brouillonPassation({ ...donnees, pole: 'cuisine' });
  assert.ok(cuisine.texte.startsWith('Pertes du jour'));
  assert.ok(!cuisine.texte.includes('Demain : 2 arrivées'));
});
