import React from 'react';
import { Camera, ChartColumn, ClipboardCheck, Settings2, Tag, Thermometer } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { ECRANS_HACCP } from './HACCP.constants.js';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module HACCP : une tuile par tâche, sur la grille partagée
// AccueilModule. Les trois gestes du service d'abord (relever, étiqueter,
// photographier), puis la lecture (le tableau, les contrôles), « Réglages »
// en dernier. Une tuile hors droit n'est pas rendue.
//
// tournee : la tournée proposée maintenant ({ heure, faites, total, complet }),
// null sans grille horaire ; dernierReleve : heure du dernier relevé du jour,
// null s'il n'y en a pas ; tauxConformite : null sans aucun relevé (le 100 %
// par défaut du tableau ne se lit pas comme un chiffre). Nombres et heures dans leurs propres nœuds : la
// phrase autour reste une entrée du glossaire.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilHaccp({
  tournee, dernierReleve, tauxConformite, controlesFaits, controlesActifs,
  canWrite, isConsultant, onOuvrir,
}) {
  let etatReleves = <>aucun relevé aujourd'hui</>;
  if (tournee && !tournee.complet) {
    etatReleves = <><span>{tournee.heure}</span> : <span>{tournee.faites}</span> / <span>{tournee.total}</span> zones relevées</>;
  } else if (dernierReleve) {
    etatReleves = <>dernier relevé à <span>{dernierReleve}</span></>;
  }
  const tuiles = [
    { id: 'releves', Icone: Thermometer, etat: etatReleves },
    { id: 'etiquettes', Icone: Tag, etat: <>imprimer un lot</>, visible: canWrite },
    { id: 'tracabilite', Icone: Camera, etat: canWrite ? <>photos des étiquettes</> : <>voir les photos</> },
    { id: 'tableau', Icone: ChartColumn, etat: tauxConformite == null ? <>aucun relevé enregistré</> : <><span>{tauxConformite}</span> % de relevés conformes</> },
    { id: 'controles', Icone: ClipboardCheck, etat: <><span>{controlesFaits}</span> / <span>{controlesActifs}</span> faits aujourd'hui</> },
    { id: 'config', Icone: Settings2, etat: <>zones, créneaux, contrôles</>, visible: isConsultant },
  ].map(t => ({ ...t, libelle: ECRANS_HACCP[t.id], onClick: () => onOuvrir(t.id) }));
  return <AccueilModule tuiles={tuiles} />;
}
