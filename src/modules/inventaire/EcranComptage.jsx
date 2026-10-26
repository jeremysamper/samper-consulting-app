import React from 'react';
import { Btn } from '../../components/ui/index.jsx';
import EcranTache from '../../components/parcours/EcranTache.jsx';
import ComptageRapide from './ComptageRapide.jsx';
import { dateCH } from './inventaireLignes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Écran « Je compte » : l'en-tête du comptage (Retour, périmètre et date,
// « Ajouter des produits », « Terminer le comptage », « Rouvrir ») puis
// ComptageRapide tel quel, qui porte déjà la progression, les zones, les
// filtres et l'ajout rapide. La saisie reste dans Inventaire.jsx (brouillon,
// blur, file hors-ligne) : tout arrive en props.
// ─────────────────────────────────────────────────────────────────────────────

export default function EcranComptage({
  inv, perimetreActif, estValide, validateurNom, canManage, canEditLignes,
  onRetour, onAjouter, onTerminer, onRouvrir, comptage,
}) {
  // Nombres et noms dans leurs propres nœuds : la phrase autour reste une
  // entrée du glossaire au lieu de partir à l'IA à chaque date.
  const etat = estValide
    ? <>Inventaire du <span>{dateCH(inv.date)}</span>, validé{validateurNom ? <> par <span data-no-translate>{validateurNom}</span></> : null}</>
    : <>Inventaire du <span>{dateCH(inv.date)}</span>, en cours</>;
  return (
    <EcranTache
      titre={<span data-no-translate>{perimetreActif}</span>}
      etat={etat}
      onRetour={onRetour}
      actions={(
        <>
          {canEditLignes && <Btn onClick={onAjouter}>Ajouter des produits</Btn>}
          {canEditLignes && <Btn variant="primary" onClick={onTerminer}>Terminer le comptage</Btn>}
          {canManage && estValide && <Btn onClick={onRouvrir}>Rouvrir</Btn>}
        </>
      )}
    >
      <ComptageRapide {...comptage} />
    </EcranTache>
  );
}
