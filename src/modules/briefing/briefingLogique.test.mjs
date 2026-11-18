import test from 'node:test';
import assert from 'node:assert/strict';
import { briefingService, horaireDuService, serviceParDefaut } from './briefingLogique.js';

test('service par défaut et horaires du service', () => {
  assert.equal(serviceParDefaut(10 * 60), 'midi');
  assert.equal(serviceParDefaut(16 * 60), 'soir');
  assert.equal(horaireDuService({ debut: '10:00', fin: '15:00' }, 'midi'), true);
  assert.equal(horaireDuService({ debut: '10:00', fin: '15:00' }, 'soir'), false);
  assert.equal(horaireDuService({ debut: '18:00', fin: '01:00' }, 'soir'), true);
  assert.equal(horaireDuService({ debut: '', fin: '15:00' }, 'midi'), false);
});

test('briefing complet du soir', () => {
  const b = briefingService({
    service: 'soir',
    reservations: [
      { nb_couverts: 4, nom: 'Martin', heure_arrivee: '19:30:00', notes_libres: 'Allergie aux arachides', statut: 'confirme' },
      { nb_couverts: 12, nom: 'Dupont', est_groupe: true, heure_arrivee: '19:00:00', statut: 'confirme' },
      { nb_couverts: 2, nom: 'Annulé', heure_arrivee: '20:00:00', statut: 'annule' },
    ],
    equipe: [{ nom: 'Carl', debut: '10:00', fin: '15:00' }, { nom: 'Rita', debut: '17:00', fin: '23:30' }],
    absents: [{ nom: 'Paul', motif: 'Maladie' }],
    relevesHors: [{ zoneNom: 'Chambre froide 2', valeur: 7.5, unite: '°C', heure: '14:10:00' }],
    importantes: ['Le lave-vaisselle fuit'],
  });
  assert.equal(b.couverts, 16);
  assert.deepEqual(b.sections.map((s) => s.id), ['reservations', 'equipe', 'surveiller']);
  assert.deepEqual(b.sections[0].lignes, [
    '16 couverts réservés en 2 réservations. Premières arrivées à 19 h 00.',
    'Groupe Dupont : 12 personnes à 19 h 00.',
    'Martin, 19 h 30 : Allergie aux arachides.',
  ]);
  assert.deepEqual(b.sections[1].lignes, ['Au service : Rita (17 h 00 à 23 h 30).', "Absents aujourd'hui : Paul (maladie)."]);
  assert.deepEqual(b.sections[2].lignes, [
    'Chambre froide 2 était à 7,5 °C à 14 h 10. Vérifiez-le avant le service.',
    'Passation importante : Le lave-vaisselle fuit.',
  ]);
  assert.ok(b.texte.startsWith('Les réservations. 16 couverts'));
});

test('service sans réservation ni équipe : la phrase des réservations seule', () => {
  const b = briefingService({ service: 'midi' });
  assert.deepEqual(b.sections, [{ id: 'reservations', titre: 'Les réservations', lignes: ['Aucune réservation pour ce service.'] }]);
});
