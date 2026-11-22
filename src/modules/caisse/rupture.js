// ─────────────────────────────────────────────────────────────────────────────
// Rupture d'un produit de la caisse (lot L2, 22.11.2026).
//
// caisse_boutons.rupture_le porte le jour de Zurich (YYYY-MM-DD) où le produit
// a été mis en rupture. Il est en rupture tant que ce jour est aujourd'hui à
// Zurich, et redevient vendable tout seul le lendemain, sans aucune écriture.
// Un jour passé, ou à venir (horloge d'un poste en avance), ne compte pas.
//
// Fonctions pures : le jour de Zurich est un paramètre (zurichToday() dans
// l'écran), pour que la règle se teste sans horloge.
// ─────────────────────────────────────────────────────────────────────────────

const JOUR = /^\d{4}-\d{2}-\d{2}$/;

// Vrai si la ligne de caisse_boutons met le produit en rupture ce jour-là.
export function enRupture(bouton, jourZurich) {
  const jour = bouton?.rupture_le;
  if (!jour || !JOUR.test(String(jourZurich || ''))) return false;
  return String(jour).slice(0, 10) === jourZurich;
}

// Produits en vente qui sont en rupture ce jour-là, dans l'ordre des articles.
// boutons : table plat_id -> ligne de caisse_boutons (listBoutons).
export function produitsEnRupture(articles, boutons, jourZurich) {
  return (articles || []).filter((a) => a && enRupture(boutons?.[a.id], jourZurich));
}

// Valeur à écrire dans rupture_le : le jour de Zurich pour « Mettre en
// rupture », null pour « Remettre en vente ».
export function valeurRupture(mettre, jourZurich) {
  if (!mettre) return null;
  if (!JOUR.test(String(jourZurich || ''))) throw new Error('jour de Zurich attendu (YYYY-MM-DD)');
  return jourZurich;
}

// « 1 produit en rupture », « 2 produits en rupture ».
export function libelleCompteRupture(n) {
  return n > 1 ? 'produits en rupture' : 'produit en rupture';
}
