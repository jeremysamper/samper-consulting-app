// Famille Réservations du catalogue des Statistiques : chaque mesure lit un
// chiffre rendu par serieReservations (computeReservationStats.js), la
// fonction du rapport des réservations. Sans React ni service.
//
// Un taux est un rapport entre 0 et 1 (unité 'pct'), null quand son
// dénominateur est nul : « n/a », jamais 0. Un jour sans réservation compte
// zéro couvert, comme sur la courbe du rapport.
//
// Clients différents, venus, revenus : un même client sur deux pas compte
// dans chacun. Ces nombres ne s'additionnent pas, ils se recalculent sur
// chaque pas comme un taux (nature 'taux'), et la période donne le sien.

import { SERVICES_LABELS, TYPES_TAGS, serieReservations } from '../../previsions/rapport/computeReservationStats.js';
import { dateCh, jourIso } from '../../previsions/rapport/periodesRapport.js';

const JOURS = { 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' };
// Moyenne de couverts par jour de la semaine, celle du rapport.
const joursDe = (p, isos) => (p.parJourSemaine || []).filter((j) => isos.includes(j.iso))
  .map((j) => ({ cle: String(j.iso), libelle: JOURS[j.iso], valeur: j.couverts, poids: j.nbJours }));
const heure = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Couverts par créneau de 30 minutes, tous jours de semaine confondus : la
// carte de chaleur du rapport, sommée sur les jours.
function parCreneau(p) {
  const par = new Map();
  Object.entries(p.heatmap?.valeurs || {}).forEach(([cle, couverts]) => {
    const c = Number(cle.split('|')[1]);
    par.set(c, (par.get(c) || 0) + couverts);
  });
  return [...par.entries()].sort((a, b) => a[0] - b[0]).map(([c, couverts]) => ({ cle: String(c), libelle: heure(c), brut: true, valeur: couverts }));
}

const meilleursClients = (id, libelle, champ) => ({
  id, libelle, unite: 'nombre', nature: 'taux',
  valeur: (p) => (p.meilleursClients ? p.meilleursClients.reduce((n, c) => n + c[champ], 0) : null),
  ventilations: [{ id: 'client', libelle: 'Par client', parts: (p) => (p.meilleursClients || []).map((c) => ({ cle: String(c.id), libelle: c.nom, donnee: true, valeur: c[champ] })) }],
  phrase: 'Les dix clients qui ont le plus réservé sur la période (fiche client), comme les meilleurs clients du rapport ; sur la période entière seulement.',
});

// Heures d'arrivée du rapport (jour de la semaine par créneau de trente
// minutes) : une mesure par jour, ventilée par créneau ; le tableau dense les
// range côte à côte, comme la carte de chaleur.
const arriveesDu = (iso, libelle) => ({
  id: `reservations.arrivees_${iso}`, libelle, unite: 'nombre', nature: 'flux',
  valeur: (p) => (p.vide ? null : Object.entries(p.heatmap?.valeurs || {}).filter(([k]) => k.startsWith(`${iso}|`)).reduce((n, [, v]) => n + v, 0)),
  ventilations: [{ id: 'creneau', libelle: 'Par créneau d\'arrivée', parts: (p) => (p.heatmap?.creneaux || []).map((c) => ({ cle: String(c), libelle: heure(c), brut: true, valeur: p.heatmap.valeurs[`${iso}|${c}`] || 0 })) }],
  phrase: 'Couverts arrivés ce jour de la semaine, par créneau de trente minutes, comme les heures d\'arrivée du rapport.',
});

export const familleReservations = {
  id: 'reservations',
  libelle: 'Réservations',
  journee: 'la date du service réservé',
  // Filtre de service de la vue (S3), celui du rapport : tous, midi, soir, brunch.
  calculer(donnees, tranches, { aujourdhui, filtres }) {
    return serieReservations({ lignes: donnees.lignes, tranches, aujourdhui, service: filtres?.service || 'tous', parametres: donnees.parametres, tables: donnees.tables || [] });
  },
  mesures: [
    {
      id: 'reservations.couverts', libelle: 'Couverts réservés', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.chiffres.couverts,
      ventilations: [
        { id: 'canal', libelle: 'Par canal', parts: (p) => p.canaux.map((c) => ({ cle: c.id, libelle: c.label, valeur: c.couverts })) },
        { id: 'service', libelle: 'Par service', parts: (p) => p.services.map((s) => ({ cle: s.service, libelle: SERVICES_LABELS[s.service] || s.service, valeur: s.couverts })) },
        { id: 'creneau', libelle: 'Par créneau d\'arrivée', parts: parCreneau },
        { id: 'taille', libelle: 'Par taille de table', parts: (p) => (p.composition?.tailles || []).map((t) => ({ cle: t.id, libelle: t.label, valeur: t.couverts })) },
        // Par zone : seulement quand la salle a des zones (sinon rien, comme le
        // rapport) ; les couverts sans table forment leur part.
        { id: 'zone', libelle: 'Par zone de la salle', parts: (p) => {
          const c = p.composition;
          if (!c?.zones) return [];
          const parts = c.zones.map((z) => ({ cle: z.zone, libelle: z.zone, donnee: true, valeur: z.couverts }));
          if (c.couvertsNonPlaces) parts.push({ cle: '__non_placees__', libelle: 'Sans table', valeur: c.couvertsNonPlaces });
          return parts;
        } },
        { id: 'table', libelle: 'Par table de la salle', parts: (p) => {
          const c = p.composition;
          if (!c) return [];
          const parts = c.parTable.map((u) => ({ cle: u.id, libelle: u.nom, donnee: true, valeur: u.couverts }));
          if (c.couvertsNonPlaces) parts.push({ cle: '__non_placees__', libelle: 'Sans table', valeur: c.couvertsNonPlaces });
          return parts;
        } },
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
      // Par jour de la semaine, en deux ventilations : sept jours dépassent les
      // six séries d'un graphique (D6), et une moyenne ne se regroupe pas.
      ventilations: [
        { id: 'semaine_debut', libelle: 'Du lundi au jeudi', ordre: 'naturel', parts: (p) => joursDe(p, [1, 2, 3, 4]) },
        { id: 'semaine_fin', libelle: 'Du vendredi au dimanche', ordre: 'naturel', parts: (p) => joursDe(p, [5, 6, 7]) },
      ],
      phrase: 'Couverts divisés par les jours ouverts du pas ; sans réglages, par les jours qui ont une réservation. Par jour de la semaine : la moyenne du rapport.',
    },
    {
      id: 'reservations.demandes_en_attente', libelle: 'Demandes en ligne en attente', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes?.enAttente ?? null,
      phrase: 'Demandes de la réservation en ligne encore à confirmer, au jour du service demandé, comme le rapport.',
    },
    {
      id: 'reservations.demandes_recues', libelle: 'Demandes en ligne reçues', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes?.recues ?? null,
      phrase: 'Réservations arrivées par la réservation en ligne, au jour du service demandé, quel que soit leur sort.',
    },
    {
      id: 'reservations.demandes_acceptees', libelle: 'Demandes en ligne acceptées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes?.acceptees ?? null,
      phrase: 'Demandes en ligne confirmées, arrivées, parties ou en no-show.',
    },
    {
      id: 'reservations.demandes_annulees', libelle: 'Demandes en ligne annulées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes?.annulees ?? null,
      phrase: 'Demandes en ligne annulées ou refusées.',
    },
    {
      id: 'reservations.anticipees', libelle: 'Réservations au délai connu', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.anticipation?.global.tables ?? null,
      ventilations: [{ id: 'delai', libelle: 'Par délai de réservation', parts: (p) => (p.anticipation?.tranches || []).map((t) => ({ cle: t.id, libelle: t.label, valeur: t.tables })) }],
      phrase: 'Réservations non annulées dont la date de prise est connue ; par délai, combien de jours avant le service elles ont été prises.',
    },
    {
      id: 'reservations.delai_moyen', libelle: 'Délai moyen de réservation', unite: 'jour', nature: 'taux',
      valeur: (p) => p.anticipation?.global.moyenne ?? null,
      ventilations: [{ id: 'canal', libelle: 'Par canal', parts: (p) => (p.anticipation?.parCanal || []).map((c) => ({ cle: c.id, libelle: c.label, valeur: c.moyenne, poids: c.tables })) }],
      phrase: 'Jours entre la prise de la réservation et le service, en moyenne ; une saisie après coup compte zéro. Recalculé sur chaque pas.',
    },
    {
      id: 'reservations.delai_median', libelle: 'Délai médian de réservation', unite: 'jour', nature: 'taux',
      valeur: (p) => p.anticipation?.global.mediane ?? null,
      phrase: 'La moitié des réservations sont prises moins de jours avant le service, l\'autre moitié plus. Recalculé sur chaque pas.',
    },
    {
      id: 'reservations.groupes', libelle: 'Réservations de groupe', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.composition?.groupes.tables ?? null,
      phrase: 'Réservations comptées marquées comme groupe.',
    },
    {
      id: 'reservations.placement', libelle: 'Taux de placement', unite: 'pct', nature: 'taux',
      valeur: (p) => p.composition?.placement.taux ?? null,
      phrase: 'Réservations comptées placées sur au moins une table du plan de salle, divisées par les réservations comptées.',
    },
    {
      id: 'reservations.avec_fiche', libelle: 'Réservations avec fiche client', unite: 'pct', nature: 'taux',
      valeur: (p) => p.clientele?.partAvecFiche ?? null,
      phrase: 'Réservations comptées reliées à une fiche client, divisées par les réservations comptées.',
    },
    {
      id: 'reservations.clients_uniques', libelle: 'Clients différents', unite: 'nombre', nature: 'taux',
      valeur: (p) => (p.clientele ? p.clientele.clientsUniques : null),
      phrase: 'Fiches clients différentes parmi les réservations comptées ; recalculé sur chaque pas, un client présent sur deux pas compte dans chacun.',
    },
    {
      id: 'reservations.clients_venus', libelle: 'Clients venus', unite: 'nombre', nature: 'taux',
      valeur: (p) => (p.clientele ? p.clientele.clientsVenus : null),
      phrase: 'Fiches clients avec au moins une réservation honorée ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.clients_revenus', libelle: 'Clients revenus', unite: 'nombre', nature: 'taux',
      valeur: (p) => (p.clientele ? p.clientele.clientsRevenus : null),
      phrase: 'Fiches clients avec au moins deux réservations honorées dans le pas ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.taux_retour', libelle: 'Taux de retour', unite: 'pct', nature: 'taux',
      valeur: (p) => p.clientele?.tauxRetour ?? null,
      phrase: 'Clients revenus divisés par les clients venus ; recalculé sur chaque pas.',
    },
    {
      id: 'reservations.passeport', libelle: 'Passeports gourmands', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.clientele?.passeport.tables ?? null,
      phrase: 'Réservations comptées venues avec un passeport gourmand.',
    },
    {
      id: 'reservations.taguees', libelle: 'Réservations avec un tag', unite: 'nombre', nature: 'flux',
      choix: { libelle: 'Type de tag', options: () => TYPES_TAGS.map((t) => ({ cle: t.id, libelle: t.label, traduire: true })) },
      valeur: (p, type) => (p.clientele ? p.clientele.tags.find((t) => t.id === type)?.tables ?? 0 : null),
      phrase: 'Réservations comptées qui portent au moins un tag du type choisi (occasion, allergène, régime).',
    },
    // Repères du rapport (jours passés) : la valeur et sa date ; un repère se
    // recalcule sur chaque pas, il ne s'additionne pas.
    {
      id: 'reservations.meilleur_jour', libelle: 'Meilleur jour', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.reperes?.meilleurJour?.total ?? null,
      detail: (p) => (p.reperes?.meilleurJour ? { jour: JOURS[jourIso(p.reperes.meilleurJour.date)], date: dateCh(p.reperes.meilleurJour.date) } : null),
      phrase: 'Jour passé qui a compté le plus de couverts, comme les repères du rapport.',
    },
    {
      id: 'reservations.jour_calme', libelle: 'Jour d\'ouverture le plus calme', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.reperes?.pireJour?.total ?? null,
      detail: (p) => (p.reperes?.pireJour ? { jour: JOURS[jourIso(p.reperes.pireJour.date)], date: dateCh(p.reperes.pireJour.date) } : null),
      phrase: 'Jour d\'ouverture passé qui a compté le moins de couverts, comme les repères du rapport.',
    },
    {
      id: 'reservations.meilleure_semaine', libelle: 'Meilleure semaine', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.reperes?.meilleureSemaine?.couverts ?? null,
      detail: (p) => (p.reperes?.meilleureSemaine ? { date: `${dateCh(p.reperes.meilleureSemaine.debut)} → ${dateCh(p.reperes.meilleureSemaine.fin)}` } : null),
      phrase: 'Semaine complète et passée qui a compté le plus de couverts, comme les repères du rapport.',
    },
    // Meilleurs clients du rapport (dix, par réservations) : un classement, pas
    // une partition des couverts ; lisible sur la période entière seulement.
    meilleursClients('reservations.clients_reservations', 'Réservations des meilleurs clients', 'reservations'),
    meilleursClients('reservations.clients_couverts', 'Couverts des meilleurs clients', 'couverts'),
    arriveesDu(1, 'Arrivées du lundi'),
    arriveesDu(2, 'Arrivées du mardi'),
    arriveesDu(3, 'Arrivées du mercredi'),
    arriveesDu(4, 'Arrivées du jeudi'),
    arriveesDu(5, 'Arrivées du vendredi'),
    arriveesDu(6, 'Arrivées du samedi'),
    arriveesDu(7, 'Arrivées du dimanche'),
  ],
};
