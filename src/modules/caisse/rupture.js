// ─────────────────────────────────────────────────────────────────────────────
// Rupture d'un produit de la caisse (lot L2, 22.11.2026).
//
// caisse_boutons.rupture_le porte le jour de Zurich (YYYY-MM-DD) où le produit
// a été mis en rupture. Il est en rupture tant que ce jour est aujourd'hui à
// Zurich, et redevient vendable tout seul le lendemain, sans aucune écriture.
// Un jour passé, ou à venir (horloge d'un poste en avance), ne compte pas.
//
// Fonctions pures : le jour de Zurich est un paramètre (zurichToday() dans
// l'écran), pour que la règle se teste sans horloge. L'écriture passe par la
// RPC caisse_poser_rupture, qui prend le jour de Zurich côté serveur.
// ─────────────────────────────────────────────────────────────────────────────

// Lot 12 du panel (26.11.2026) : quatre états exclusifs, posés par la RPC
// caisse_poser_disponibilite. En vente ; en rupture aujourd'hui (rupture_le) ;
// épuisé jusqu'à nouvel arrivage (epuise_durable, vrai tous les jours) ; ou
// « il en reste N aujourd'hui » (portions_le, portions_restantes), décompté
// par la base à chaque ligne. Un compteur daté d'un autre jour ne compte pas ;
// à zéro, le produit est en rupture.

const JOUR = /^\d{4}-\d{2}-\d{2}$/;
const memeJour = (valeur, jourZurich) => Boolean(valeur) && String(valeur).slice(0, 10) === jourZurich;

// { etat, restant } : etat parmi 'en_vente', 'rupture', 'epuise', 'compte'
// (compteur du jour au-dessus de zéro), restant = nombre du compteur du jour
// ou null. Un bouton absent ou un jour mal formé : en vente.
export function etatDisponibilite(bouton, jourZurich) {
  if (!bouton || !JOUR.test(String(jourZurich || ''))) return { etat: 'en_vente', restant: null };
  if (bouton.epuise_durable === true) return { etat: 'epuise', restant: null };
  if (memeJour(bouton.rupture_le, jourZurich)) return { etat: 'rupture', restant: null };
  const n = bouton.portions_restantes;
  if (memeJour(bouton.portions_le, jourZurich) && n !== null && n !== undefined && Number.isFinite(Number(n))) {
    return Number(n) > 0 ? { etat: 'compte', restant: Number(n) } : { etat: 'rupture', restant: 0 };
  }
  return { etat: 'en_vente', restant: null };
}

// Mot de la case : « Rupture », « Épuisé », « Reste » (suivi du nombre).
export function motEtat(etat) {
  if (etat === 'rupture') return 'Rupture';
  if (etat === 'epuise') return 'Épuisé';
  if (etat === 'compte') return 'Reste';
  return '';
}

// Vrai si le produit ne se vend pas ce jour-là : rupture du jour, épuisé
// durable, ou compteur du jour à zéro.
export function enRupture(bouton, jourZurich) {
  const { etat } = etatDisponibilite(bouton, jourZurich);
  return etat === 'rupture' || etat === 'epuise';
}

// Produits en vente qui sont en rupture ce jour-là, dans l'ordre des articles.
// boutons : table plat_id -> ligne de caisse_boutons (listBoutons).
export function produitsEnRupture(articles, boutons, jourZurich) {
  return (articles || []).filter((a) => a && enRupture(boutons?.[a.id], jourZurich));
}

// « 1 produit en rupture », « 2 produits en rupture ».
export function libelleCompteRupture(n) {
  return n > 1 ? 'produits en rupture' : 'produit en rupture';
}

// Lot 12 : refus du compteur de portions (déclencheur trg_caisse_ligne_portions,
// levé sans code). Rend la phrase de l'écran, ou null. Lue par mapError
// (caisseService.js) et par messageErreur (commandeQrService.js).
export function messagePortions(brut) {
  const texte = String(brut || '');
  if (/^caisse: il ne reste plus de portion de ce produit/.test(texte)) return "Il n'en reste plus. Le produit passe en rupture.";
  if (/^caisse: il ne reste qu'une portion de ce produit/.test(texte)) return "Il ne reste qu'une portion.";
  const m = /^caisse: il ne reste que (\d+) portions? de ce produit/.exec(texte);
  if (!m) return null;
  return Number(m[1]) === 1 ? "Il ne reste qu'une portion." : `Il ne reste que ${m[1]} portions.`;
}
