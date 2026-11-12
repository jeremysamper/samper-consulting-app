// Famille Réservations du catalogue des Statistiques : chaque mesure lit un
// chiffre rendu par serieReservations (computeReservationStats.js), la
// fonction du rapport des réservations. Sans React ni service.
//
// Un taux est un rapport entre 0 et 1 (unité 'pct'), null quand son
// dénominateur est nul : « n/a », jamais 0. Un jour sans réservation compte
// zéro couvert, comme sur la courbe du rapport.

import { SERVICES_LABELS, serieReservations } from '../../previsions/rapport/computeReservationStats.js';

export const familleReservations = {
  id: 'reservations',
  libelle: 'Réservations',
  journee: 'la date du service réservé',
  calculer(donnees, tranches, { aujourdhui }) {
    return serieReservations({ lignes: donnees.lignes, tranches, aujourdhui, parametres: donnees.parametres });
  },
  mesures: [
    {
      id: 'reservations.couverts', libelle: 'Couverts réservés', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.chiffres.couverts,
      ventilations: [
        { id: 'canal', libelle: 'Par canal', parts: (p) => p.canaux.map((c) => ({ cle: c.id, libelle: c.label, valeur: c.couverts })) },
        { id: 'service', libelle: 'Par service', parts: (p) => p.services.map((s) => ({ cle: s.service, libelle: SERVICES_LABELS[s.service] || s.service, valeur: s.couverts })) },
      ],
      phrase: 'Couverts des réservations honorées, non pointées et prévues ; ni les annulées ni les no-show.',
    },
    {
      id: 'reservations.tables', libelle: 'Tables réservées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.chiffres.tables,
      phrase: 'Réservations valides, annulées exclues. Une table est une réservation, pas une table de la salle.',
    },
    {
      id: 'reservations.no_show', libelle: 'No-show', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.chiffres.noShowTables,
      phrase: 'Réservations marquées no-show.',
    },
    {
      id: 'reservations.taux_no_show', libelle: 'Taux de no-show', unite: 'pct', nature: 'taux',
      valeur: (p) => p.chiffres.tauxNoShow,
      phrase: 'No-show divisés par les réservations échues ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.taux_annulation', libelle: 'Taux d\'annulation', unite: 'pct', nature: 'taux',
      valeur: (p) => p.chiffres.tauxAnnulationTables,
      phrase: 'Réservations annulées divisées par toutes les réservations ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.taux_non_pointe', libelle: 'Réservations non pointées', unite: 'pct', nature: 'taux',
      valeur: (p) => p.chiffres.tauxNonPointe,
      phrase: 'Réservations passées restées sans arrivée ni no-show, divisées par les réservations échues.',
    },
    {
      id: 'reservations.occupation', libelle: 'Taux d\'occupation', unite: 'pct', nature: 'taux',
      valeur: (p) => p.chiffres.occupation,
      phrase: 'Couverts divisés par la capacité des services ouverts, d\'après les réglages de la réservation en ligne.',
    },
    {
      id: 'reservations.taille_moyenne', libelle: 'Couverts par table', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.chiffres.tailleMoyenne,
      phrase: 'Couverts divisés par les réservations comptées ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.couverts_jour_ouverture', libelle: 'Couverts par jour d\'ouverture', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.chiffres.couvertsParJourOuverture,
      phrase: 'Couverts divisés par les jours ouverts du pas ; sans réglages, par les jours qui ont une réservation.',
    },
  ],
};
