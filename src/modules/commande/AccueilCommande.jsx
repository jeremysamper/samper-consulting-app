import React from 'react';
import { PackagePlus, Send } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import { Choix, Fenetre, st as stFenetre } from '../../components/ui/Fenetres.jsx';

// ─────────────────────────────────────────────────────────────────────────────
// Gros boutons du module Commande, posés à côté de la liste : ajouter un
// produit à la main, envoyer la commande (commande non vide). L'ancien bouton
// « Gérer » (générer depuis les cartes, vider) est parti : chaque carte a son
// onglet, calculé en direct depuis les fiches. Vider la commande, une fois
// passée, se fait depuis la fenêtre d'envoi.
// ─────────────────────────────────────────────────────────────────────────────

export default function AccueilCommande({ listeVide, busy, onAjouter, onPdf, onImprimer, onVider }) {
  const [fenetre, setFenetre] = React.useState(null);
  const fermer = React.useCallback(() => setFenetre(null), []);
  const choisir = (action) => () => { fermer(); action(); };
  // Une fenêtre qui n'a plus lieu d'être (commande vidée ailleurs) se ferme
  // pour de bon : elle ne doit pas se rouvrir seule ensuite.
  const permise = fenetre === 'envoyer' ? !listeVide : false;
  React.useEffect(() => { if (fenetre && !permise) setFenetre(null); }, [fenetre, permise]);

  const tuiles = [
    { id: 'ajouter', Icone: PackagePlus, libelle: "J'ajoute un produit", etat: <>à la main</>, onClick: onAjouter },
    { id: 'envoyer', Icone: Send, libelle: "J'envoie la commande", etat: busy ? <>Mise à jour…</> : <>PDF ou imprimante</>, visible: !listeVide, onClick: () => { if (!busy) setFenetre('envoyer'); } },
  ];

  return (
    <>
      {/* Hors de l'impression de la page, comme l'ancienne barre d'actions. */}
      <div className="no-print"><AccueilModule tuiles={tuiles} /></div>
      {fenetre === 'envoyer' && permise && (
        <Fenetre id="commande-exporter" titre="J'envoie la commande" onClose={fermer}>
          <div style={stFenetre.section}>
            <Choix titre="Télécharger le PDF" detail="Ma commande rangée par rayon, prête à envoyer." onClick={choisir(onPdf)} />
            <Choix titre="Imprimer" detail="La même liste, envoyée à l'imprimante." onClick={choisir(onImprimer)} />
            <Choix titre="Vider la commande" detail="Une fois la commande passée : tout se décoche, pour la suivante." danger onClick={choisir(onVider)} />
          </div>
        </Fenetre>
      )}
    </>
  );
}
