// ─────────────────────────────────────────────────────────────────────────────
// Chiffres des inventaires par tranche, sans React ni service (testé par
// node --test, serieInventaire.test.mjs), pour le module Statistiques.
//
// Seuls les inventaires validés comptent, comme la variation de stock de la
// Comptabilité (syntheseCompta.js) : un comptage en cours met les produits
// non comptés à 0, sa valeur ne dit rien du stock.
//   stock    : valeur du stock connue à la fin de la tranche, somme du dernier
//              inventaire validé de chaque périmètre à cette date
//              (valeurStockConsolidee) ; null avant le premier inventaire ;
//   manques  : somme des écarts de valeur négatifs des inventaires validés
//              datés dans la tranche, règle d'EcartsPanel.jsx l. 64 ;
//   surplus  : somme des écarts de valeur positifs, l. 65 ;
//   inventaires : nombre d'inventaires validés datés dans la tranche.
// ─────────────────────────────────────────────────────────────────────────────

import { valeurStockConsolidee } from '../../utils/inventairePerimetres.js';

export const estValide = (inv) => inv?.statut === 'validé';

export function ecartsInventaire(inv) {
  const lignes = inv?.lignes || [];
  return {
    manques: lignes.reduce((s, l) => s + Math.min(0, Number(l.ecartValeur) || 0), 0),
    surplus: lignes.reduce((s, l) => s + Math.max(0, Number(l.ecartValeur) || 0), 0),
  };
}

export function serieInventaire(inventaires, tranches) {
  const valides = (inventaires || []).filter((i) => estValide(i) && /^\d{4}-\d{2}-\d{2}/.test(String(i.date || '')));
  return (tranches || []).map((t) => {
    const connus = valides.filter((i) => String(i.date).slice(0, 10) <= t.fin);
    const dedans = valides.filter((i) => String(i.date).slice(0, 10) >= t.debut && String(i.date).slice(0, 10) <= t.fin);
    const ecarts = dedans.map(ecartsInventaire);
    return {
      debut: t.debut,
      fin: t.fin,
      stock: connus.length ? valeurStockConsolidee(connus) : null,
      inventaires: dedans.length,
      manques: dedans.length ? ecarts.reduce((s, e) => s + e.manques, 0) : null,
      surplus: dedans.length ? ecarts.reduce((s, e) => s + e.surplus, 0) : null,
    };
  });
}
