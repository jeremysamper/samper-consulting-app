// ─────────────────────────────────────────────────────────────────────────────
// Prix du catalogue dans le temps, par tranche, sans React ni service (testé
// par node --test, serieCatalogue.test.mjs), pour le module Statistiques. Même
// source que l'historique de prix d'un produit (Catalogue.jsx, table
// produit_prix_historique) : un relevé par changement de prix, daté de la
// facture (releve_le). Un pas vaut le dernier relevé de chaque produit dans
// le pas ; un prix ne s'additionne pas.
//   releves : [{ produitId, releveLe, prixUnitaire }]
// ─────────────────────────────────────────────────────────────────────────────

export function serieCatalogue(releves, tranches) {
  const dates = (releves || []).filter((r) => r?.produitId && /^\d{4}-\d{2}-\d{2}/.test(String(r.releveLe || '')) && Number.isFinite(Number(r.prixUnitaire)));
  return (tranches || []).map((t) => {
    const parProduit = {};
    dates.forEach((r) => {
      const jour = r.releveLe.slice(0, 10);
      if (jour < t.debut || jour > t.fin) return;
      const e = parProduit[r.produitId];
      if (!e || jour >= e.jour) parProduit[r.produitId] = { jour, prix: Number(r.prixUnitaire) };
    });
    return { debut: t.debut, fin: t.fin, parProduit };
  });
}
