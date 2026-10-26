import React from 'react';
import { Bell, CalendarDays, CalendarPlus, ChartColumn, ConciergeBell, LayoutGrid, Search, Settings2, Users } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Réservations : une tuile par tâche, sur la grille partagée
// AccueilModule. Réserver et le service du jour d'abord, puis le planning, le
// plan de salle, la recherche, les clients, le rapport, les notifications de
// cet appareil, les réglages. Les demandes en ligne ne sont pas une tuile :
// leur bloc est posé au-dessus de la grille (Previsions.jsx), on les confirme
// d'un geste. Une tuile hors droit n'est pas rendue ; les droits sont ceux
// d'aujourd'hui (canEdit, ROLES_RAPPORT, ROLES_EN_LIGNE dans Previsions.jsx).
//
// couverts : couverts du jour (no-shows exclus, comme la vue jour), null tant
// que la lecture n'a pas abouti. Nombres dans leurs propres nœuds : la phrase
// autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilReservations({
  couverts, notificationsActives, canEdit, voitRapport, voitReglages,
  onReserver, onService, onPlanning, onPlan, onChercher, onClients, onRapport, onNotifications, onReglages,
}) {
  const tuiles = [
    { id: 'reserver', Icone: CalendarPlus, libelle: 'Je réserve une table', onClick: onReserver, visible: canEdit, etat: <>au téléphone ou au comptoir</> },
    {
      id: 'service', Icone: ConciergeBell, libelle: 'Ce soir', onClick: onService,
      etat: couverts == null ? <>le plan et les arrivées du jour</>
        : couverts === 0 ? <>aucune réservation aujourd'hui</>
          : <><span>{couverts}</span> {couverts > 1 ? "couverts aujourd'hui" : "couvert aujourd'hui"}</>,
    },
    { id: 'planning', Icone: CalendarDays, libelle: 'Le planning', onClick: onPlanning, etat: <>la semaine, jour par jour</> },
    { id: 'plan', Icone: LayoutGrid, libelle: 'Le plan de salle', onClick: onPlan, etat: <>les tables d'aujourd'hui</> },
    { id: 'chercher', Icone: Search, libelle: 'Je cherche une réservation', onClick: onChercher, etat: <>par le nom ou le téléphone</> },
    { id: 'clients', Icone: Users, libelle: 'Les clients', onClick: onClients, etat: <>le fichier, rempli par les réservations</> },
    { id: 'rapport', Icone: ChartColumn, libelle: 'Le rapport', onClick: onRapport, visible: voitRapport, etat: <>l'activité, en lecture seule</> },
    {
      id: 'notifications', Icone: Bell, libelle: 'Prévenir cet appareil', onClick: onNotifications,
      etat: notificationsActives ? <>activées sur cet appareil</> : <>à chaque réservation en ligne</>,
    },
    { id: 'reglages', Icone: Settings2, libelle: 'Réglages', onClick: onReglages, visible: voitReglages, etat: <>réservation en ligne, e-mails, SMS</> },
  ];
  return <AccueilModule tuiles={tuiles} />;
}
