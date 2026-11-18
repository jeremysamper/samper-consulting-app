// ─────────────────────────────────────────────────────────────────────────────
// Effet d'une hausse de prix fournisseur sur le coût matière des fiches, par le
// calcul du coût matière de prixResolution.js. Fonction pure, testée par
// effetsHausseFiches.test.mjs. Les hausses viennent d'une seule source : les
// factures et les bons de livraison (analysesAchats.js, haussesPrix) ; le
// widget du tableau de bord relie chacune à un produit du catalogue
// (factures-achats/haussesTableau.js) avant d'en demander l'effet ici.
//
//   hausse  { produitId, unite, ancien, nouveau } : prix en CHF par `unite`
//           (g, kg, ml, L ou pcs)
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildProduitIndex, computeCoutMatiere, convertPrix, describePrixIngredient, resolvePrixProduit,
} from '../../services/prixResolution.js';

// Index qui rend le produit au prix donné (stratégie manuelle), les autres
// inchangés : computeCoutMatiere ne lit l'index que par get().
const indexAuPrix = (index, produit, prix) => ({
  get: (id) => (id === produit.id ? { ...produit, strategiePrix: 'manuel', prixUnitaireManuel: prix } : index.get(id)),
});

// Effet d'une hausse sur les fiches qui utilisent le produit directement
// (ingrédient lié par produitId) : coût de la fiche au nouveau prix moins son
// coût à l'ancien. Fiches archivées et cachées exclues (Cartes & Recettes ne
// les montre pas). Les sous-recettes ne sont pas dépliées.
//
//   suitCatalogue  le prix retenu au catalogue pour ce produit est le nouveau
//                  prix : les fiches l'ont déjà pris. Faux quand le prix
//                  retenu vient d'un autre fournisseur ou d'une saisie : le
//                  coût des fiches n'a pas bougé, l'effet n'est pas donné.
//   fiches         [{ id, nom, deltaParPortion, deltaPct, chiffrable }], de la
//                  plus touchée à la moins touchée ; chiffrable faux quand une
//                  ligne ne se convertit pas (produit au kg, fiche en pièces)
export function effetsSurFiches(hausse, recettes, produits) {
  const index = buildProduitIndex(produits);
  const produit = hausse && index.get(hausse.produitId);
  if (!produit) return { suitCatalogue: false, fiches: [] };
  const uniteRef = produit.uniteRef || 'g';
  const nouveauRef = convertPrix(hausse.nouveau, hausse.unite, uniteRef);
  const ancienRef = convertPrix(hausse.ancien, hausse.unite, uniteRef);
  const retenu = resolvePrixProduit(produit);
  const suitCatalogue = nouveauRef != null && Math.abs(retenu - nouveauRef) <= Math.max(1e-9, nouveauRef * 0.005);

  const fiches = (recettes || [])
    .filter((r) => r && r.statut !== 'archivée' && r.masquee !== true
      && (r.ingredients || []).some((i) => i && i.produitId === produit.id))
    .map((r) => {
      const base = { id: r.id, nom: r.nom || '', deltaParPortion: null, deltaPct: null, chiffrable: false };
      if (nouveauRef == null || ancienRef == null) return base;
      const lignes = (r.ingredients || []).filter((i) => i && i.produitId === produit.id);
      if (lignes.some((i) => describePrixIngredient(i, index).source !== 'catalogue')) return base;
      const avant = computeCoutMatiere(r.ingredients, indexAuPrix(index, produit, ancienRef));
      const apres = computeCoutMatiere(r.ingredients, indexAuPrix(index, produit, nouveauRef));
      const delta = apres - avant;
      const portions = Number(r.portions) > 0 ? Number(r.portions) : null;
      return {
        ...base,
        chiffrable: portions != null,
        deltaParPortion: portions ? delta / portions : null,
        deltaPct: avant > 0 ? (delta / avant) * 100 : null,
      };
    })
    .sort((a, b) => (b.deltaPct ?? -1) - (a.deltaPct ?? -1) || a.nom.localeCompare(b.nom));
  return { suitCatalogue, fiches };
}
