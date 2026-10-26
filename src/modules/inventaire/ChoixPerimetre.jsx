import React from 'react';
import { Package, PackageOpen } from 'lucide-react';
import AccueilModule from '../../components/parcours/AccueilModule.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import { dateCH, estCompte } from './inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// « Quel périmètre ? » : quand l'établissement compte plusieurs périmètres, ou
// qu'aucun inventaire n'est en cours, « Je compte » passe par ici. Une tuile
// par périmètre (grille partagée AccueilModule) avec l'état de sa pile :
//   - un inventaire en cours : la tuile l'ouvre ;
//   - le dernier est validé (ou la pile est vide) : la tuile crée l'inventaire
//     du jour, repris du dernier, et ouvre le comptage, sans fenêtre.
// En dernier, « Autre inventaire » ouvre la fenêtre « Nouvel inventaire »
// (autre date, départ vierge ou catalogue, nouveau périmètre).
// ─────────────────────────────────────────────────────────────────────────────

export default function ChoixPerimetre({ perimetres, pilesParPerimetre, onRetour, onOuvrir, onAutre }) {
  const tuiles = [
    ...perimetres.map((nom) => {
      const dernier = (pilesParPerimetre.get(nom) || [])[0];
      const enCours = dernier && dernier.statut !== 'validé';
      const lignes = dernier?.lignes || [];
      const etat = !dernier
        ? <>aucun inventaire, commencer</>
        : enCours
          ? <>en cours, <span>{lignes.filter(estCompte).length}</span> / <span>{lignes.length}</span> comptés</>
          : <>dernier validé le <span>{dateCH(dernier.date)}</span>, commencer un nouveau comptage</>;
      // Le nom du périmètre est une donnée : jamais traduit (brut).
      return { id: nom, libelle: nom, brut: true, Icone: Package, etat, onClick: () => onOuvrir(nom) };
    }),
    { id: '__autre__', libelle: 'Autre inventaire', Icone: PackageOpen, etat: 'autre date, départ vierge ou catalogue, nouveau périmètre', onClick: onAutre },
  ];

  return (
    <EcranTache titre="Quel périmètre ?" onRetour={onRetour}>
      <AccueilModule tuiles={tuiles} />
    </EcranTache>
  );
}
