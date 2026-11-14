import React from 'react';
import { CalendarDays, CalendarPlus, LayoutGrid, Search, Users } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import ReperesReservations, { CarteServiceDuJour } from './ReperesReservations.jsx';
import { chiffresDuJour } from './accueilReservations.js';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Réservations : une tuile par tâche, sur la grille partagée
// AccueilModule. Réserver d'abord, puis organiser les réservations du jour sur
// le plan, le planning, la recherche, les clients. Depuis le 14.11.2026, plus
// de tuile « Ce soir » : ce module met les réservations en place dans la
// salle, le service se joue ensuite dans la Caisse, qui ouvre ses tables sur
// le plan organisé ici (décision de Jérémy). Les demandes en ligne ne sont pas une tuile :
// leur bloc est posé au-dessus de la grille (Previsions.jsx), on les confirme
// d'un geste. Une tuile hors droit n'est pas rendue ; les droits sont ceux
// d'aujourd'hui (canEdit, ROLES_RAPPORT, ROLES_EN_LIGNE dans Previsions.jsx).
//
// Direction Galet : repères et carte du service du jour autour des tuiles
// (ReperesReservations.jsx, reservations.css), comptés sur resasDuJour, les
// réservations du jour lues par l'accueil (null tant que la lecture n'a pas
// abouti ou si elle a échoué : rien n'est rendu).
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilReservations({
  resasDuJour, canEdit,
  onReserver, onPlanning, onPlan, onChercher, onClients,
}) {
  const tuiles = [
    { id: 'reserver', Icone: CalendarPlus, libelle: 'Je réserve une table', onClick: onReserver, visible: canEdit, etat: <>au téléphone ou au comptoir</> },
    { id: 'plan', Icone: LayoutGrid, libelle: 'Organiser mes réservations', onClick: onPlan, etat: <>chaque réservation sur sa table</> },
    { id: 'planning', Icone: CalendarDays, libelle: 'Le planning', onClick: onPlanning, etat: <>la semaine, jour par jour</> },
    { id: 'chercher', Icone: Search, libelle: 'Je cherche une réservation', onClick: onChercher, etat: <>par le nom ou le téléphone</> },
    { id: 'clients', Icone: Users, libelle: 'Les clients', onClick: onClients, etat: <>le fichier, rempli par les réservations</> },
  ];
  const chiffres = resasDuJour ? chiffresDuJour(resasDuJour) : null;
  return (
    <div className="resa-page">
      <div className="resa-grille">
        <ReperesReservations chiffres={chiffres} />
        <CarteServiceDuJour chiffres={chiffres} />
        <AccueilModule tuiles={tuiles} />
      </div>
    </div>
  );
}
