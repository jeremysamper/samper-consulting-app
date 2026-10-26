import React from 'react';
import { PackagePlus, Send, Settings2 } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { Choix, Fenetre, st as stFenetre } from '../../components/ui/Fenetres.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Accueil du module Commande : le module s'ouvre sur la liste du jour (cocher
// un produit reste à deux gestes depuis l'accueil de l'app) ; les autres
// tâches sont de gros boutons posés en tête de la liste. Mêmes droits
// qu'avant : envoyer suit la liste non vide, Gérer reste au consultant (la
// base ne filtre pas par rôle, c'est une présentation). Les deux fenêtres de
// choix reprennent celles des anciens boutons « Exporter » et « Gérer ».
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilCommande({ listeVide, isConsultant, busy, onAjouter, onPdf, onImprimer, onGenerer, onVider }) {
  const [fenetre, setFenetre] = React.useState(null);
  const fermer = React.useCallback(() => setFenetre(null), []);
  const choisir = (action) => () => { fermer(); action(); };
  // Une fenêtre qui n'a plus lieu d'être (liste vidée ailleurs, génération en
  // cours) se ferme pour de bon : elle ne doit pas se rouvrir seule ensuite.
  const permise = fenetre === 'envoyer' ? !listeVide : fenetre === 'gerer' ? isConsultant && !busy : false;
  React.useEffect(() => { if (fenetre && !permise) setFenetre(null); }, [fenetre, permise]);

  const tuiles = [
    { id: 'ajouter', Icone: PackagePlus, libelle: "J'ajoute un produit", etat: <>à la main</>, onClick: onAjouter },
    { id: 'envoyer', Icone: Send, libelle: "J'envoie la commande", etat: <>PDF ou imprimante</>, visible: !listeVide, onClick: () => setFenetre('envoyer') },
    // Pendant une génération, le bouton reste en place et dit où on en est.
    { id: 'gerer', Icone: Settings2, libelle: 'Gérer', etat: busy ? <>Génération…</> : <>générer, vider</>, visible: isConsultant, onClick: () => { if (!busy) setFenetre('gerer'); } },
  ];

  return (
    <>
      {/* Hors de l'impression de la page, comme l'ancienne barre d'actions. */}
      <div className="no-print"><AccueilModule tuiles={tuiles} /></div>
      {fenetre === 'envoyer' && permise && (
        <Fenetre id="commande-exporter" titre="J'envoie la commande" onClose={fermer}>
          <div style={stFenetre.section}>
            <Choix titre="Télécharger le PDF" detail="La liste rangée par rayon, prête à envoyer." onClick={choisir(onPdf)} />
            <Choix titre="Imprimer" detail="La même liste, envoyée à l'imprimante." onClick={choisir(onImprimer)} />
          </div>
        </Fenetre>
      )}
      {fenetre === 'gerer' && permise && (
        <Fenetre id="commande-gerer" titre="Gérer la commande" onClose={fermer}>
          <div style={stFenetre.section}>
            <Choix titre="Générer depuis les cartes" detail="Les produits des recettes de la carte, aux bonnes quantités." onClick={choisir(onGenerer)} />
            {!listeVide && <Choix titre="Vider la liste" detail="Retire les produits ajoutés automatiquement." danger onClick={choisir(onVider)} />}
          </div>
        </Fenetre>
      )}
    </>
  );
}
