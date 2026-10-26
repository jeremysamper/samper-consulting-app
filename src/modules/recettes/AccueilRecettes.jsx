import React from 'react';
import { BookOpen, FileDown, Search, Settings2, Tag, Wheat } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Cartes & Recettes : une tuile par tâche, sur la grille
// partagée AccueilModule. La lecture d'abord (chercher une fiche, la carte du
// moment, les allergènes), puis l'étiquette et l'export, « Gérer » en dernier.
// Allergènes et Exporter ouvrent directement leur fenêtre d'aujourd'hui ; les
// autres tuiles ouvrent un écran. Une tuile hors droit n'est pas rendue.
//
// fiches : nombre de fiches visibles, null tant que leur lecture n'a pas
// abouti (lectureFiches dit alors où elle en est) ; carte : la carte qui
// s'ouvrira, null s'il n'y en a aucune ou tant que lectureCartes est posé.
// Nombres dans leurs propres nœuds : la phrase autour reste une entrée du
// glossaire.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilRecettes({
  fiches, lectureFiches, carte, lectureCartes, canEtiqueter, canGerer, consultant,
  onChercher, onCarte, onAllergenes, onEtiquette, onExporter, onGerer,
}) {
  const tuiles = [
    {
      id: 'chercher', Icone: Search, libelle: 'Je cherche une fiche', onClick: onChercher,
      etat: fiches == null ? lectureFiches : <><span>{fiches}</span> {fiches > 1 ? 'fiches' : 'fiche'}</>,
    },
    {
      id: 'carte', Icone: BookOpen, libelle: 'La carte du moment', onClick: onCarte,
      // Nom vide : le même repli que l'onglet de la carte (CarteTabBar).
      etat: lectureCartes || (carte ? (String(carte.nom ?? '').trim() || 'Carte sans nom') : <>aucune carte</>),
    },
    { id: 'allergenes', Icone: Wheat, libelle: 'Allergènes', onClick: onAllergenes, etat: <>ou un ingrédient, dans quelles fiches</> },
    { id: 'etiquette', Icone: Tag, libelle: 'Une étiquette', onClick: onEtiquette, etat: <>DLC d'une préparation</>, visible: canEtiqueter },
    { id: 'exporter', Icone: FileDown, libelle: 'Exporter', onClick: onExporter, etat: <>une carte, des plats ou des fiches en PDF</> },
    {
      id: 'gerer', Icone: Settings2, libelle: 'Gérer', onClick: onGerer, visible: canGerer,
      etat: consultant ? <>ajouter, renommer, archiver, ordre, cacher</> : <>ajouter, renommer, archiver, ordre</>,
    },
  ];
  return <AccueilModule tuiles={tuiles} />;
}
