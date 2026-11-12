import PlanSalle from './PlanSalle.jsx';
import { peutGererReservations } from './gardeEnLigne.js';
import { marquerAjoutFait, useDemandeDessin } from './planSalleDessin.js';

// Section « Réservations : plan de salle » de la page des réglages : le plan
// de base (salles, tables, décor, places de bar, rotation), dessiné par le
// composant du service lui-même en variante 'dessin'. Mêmes lectures, mêmes
// écritures, mêmes feuilles de réglage. Les écarts datés d'un service
// (« Déplacer des tables ») restent dans Réservations.
//
// Ouverte par « Dessiner la salle » (revenir existe) : la salle, le jour, le
// service et les clients placés sont ceux du service qu'on vient de quitter,
// et « J'ai fini » y ramène. Ouverte par la liste : le plan de base seul.
const AUCUNE = [];

export default function SectionPlanSalle({ user, etablissement, revenir }) {
  const demande = useDemandeDessin();
  const etabId = etablissement?.id || null;
  if (!etabId || !peutGererReservations(user?.role)) return null;
  const service = revenir && demande && demande.etablissementId === etabId ? demande : null;
  return (
    <PlanSalle
      key={service ? `service-${service.n}` : 'base'}
      variante="dessin"
      etablissementId={etabId}
      canEdit
      date={service?.date}
      service={service?.service || null}
      resas={service?.resas || AUCUNE}
      salleInitiale={service?.salleId || null}
      ajouterAuDepart={Boolean(service?.ajouterTable)}
      onAjoutFait={marquerAjoutFait}
      onFini={revenir}
    />
  );
}
