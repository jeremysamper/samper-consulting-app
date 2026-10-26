import React from 'react';
import { dbService } from '../../services/dbService.js';
import { cleProduit } from './inventaireLignes.js';
import { construireContexteRapprochement } from './achatsLogic.js';

// ─────────────────────────────────────────────────────────────────────────────
// Rapprochement des lignes lues sur les documents avec les produits de
// l'inventaire : produits de l'inventaire affiché et du précédent (sans les
// préparations maison, qu'aucune facture ne concerne), alias du catalogue lus
// une fois par établissement, contexte recalculé quand documents, catalogue ou
// inventaires changent. Partagé par « Écarts et documents » (AchatsPanel) et
// « Vérifier la lecture » (VerifierLecture).
// ─────────────────────────────────────────────────────────────────────────────

export function useRapprochement({ etabId, inv, previousInv, documents, catalogue }) {
  const legacySB = dbService.getBridge();
  const [aliasCatalogue, setAliasCatalogue] = React.useState([]);

  React.useEffect(() => {
    if (!legacySB) return undefined;
    let vivant = true;
    legacySB.db.listProduitAliasEtab(etabId).then(a => { if (vivant) setAliasCatalogue(a || []); }).catch(() => {});
    return () => { vivant = false; };
  }, [etabId]);

  const produits = React.useMemo(() => {
    const m = new Map();
    [...(inv?.lignes || []), ...(previousInv?.lignes || [])].forEach(l => {
      const cle = cleProduit(l.produit);
      if (cle && !l.recetteId && !m.has(cle)) m.set(cle, { cle, nom: l.produit, unite: l.unite, prixUnit: Number(l.prixUnit) || 0 });
    });
    return Array.from(m.values());
  }, [inv, previousInv]);

  const ctx = React.useMemo(
    () => construireContexteRapprochement({ produits, documents, aliasCatalogue, catalogue }),
    [produits, documents, aliasCatalogue, catalogue],
  );

  return { produits, ctx, aliasCatalogue };
}
