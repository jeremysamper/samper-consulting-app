// ─────────────────────────────────────────────────────────────────────────────
// Lignes d'inventaire : calculs et fabrication, sans React.
//
// Une ligne : { id, produit, categorie, unite, stockTheo, stockReel, prixUnit,
//               ecart, valeur, ecartValeur, compteLe?, type? }
//
// stockReel = null signifie « pas encore compté ». C'est l'état d'un
// inventaire repris du précédent : la quantité du mois dernier est affichée
// en indication, elle n'est plus recopiée d'office. Recopier faisait passer
// pour compté un produit que personne n'avait regardé.
// ─────────────────────────────────────────────────────────────────────────────

import { normalizeName } from '../../services/recipeProductMatching.js';

export const CATEGORIES_INVENTAIRE = ['Viandes', 'Poissons', 'Légumes', 'Fruits', 'Produits laitiers', 'Féculents', 'Épicerie', 'Boissons', 'Autres'];
export const UNITES_INVENTAIRE = ['pcs', 'kg', 'g', 'L', 'ml', 'btl', 'cs', 'cc'];

export const estCompte = (l) => l?.stockReel != null && l.stockReel !== '';

// Recalcule écarts et valeurs d'un inventaire (muté sur place, puis renvoyé).
// Une ligne pas encore comptée vaut zéro dans le total et n'a pas d'écart :
// afficher « -12 kg » sur un produit qu'on n'a pas encore vu serait faux.
export const recalcInventaire = (inventory) => {
  (inventory.lignes || []).forEach(l => {
    const prix = Number(l.prixUnit) || 0;
    if (!estCompte(l)) {
      l.stockReel = null;
      l.ecart = null;
      l.valeur = 0;
      l.ecartValeur = 0;
      return;
    }
    const reel = Number(l.stockReel) || 0;
    const theo = Number(l.stockTheo) || 0;
    l.ecart = +(reel - theo).toFixed(2);
    l.valeur = +(reel * prix).toFixed(2);
    l.ecartValeur = +(l.ecart * prix).toFixed(2);
  });
  inventory.valeurTotale = +(inventory.lignes || []).reduce((s, l) => s + (l.valeur || 0), 0).toFixed(2);
  return inventory;
};

// Quantité saisie au comptage. La virgule est le séparateur décimal en Suisse
// romande et le clavier numérique iOS en français en propose une :
// `parseFloat('9,5')` vaut 9, la décimale disparaît sans que rien ne le signale.
// Renvoie null si la saisie est vide ou illisible - l'appelant décide alors.
export const parseQuantite = (valeur) => {
  const brut = String(valeur ?? '').trim().replace(',', '.');
  if (brut === '') return null;
  const nombre = Number.parseFloat(brut);
  return Number.isFinite(nombre) ? nombre : null;
};

export const cleProduit = (nom) => normalizeName(nom);

let compteurId = 0;
export const nouvelIdLigne = () => `l${Date.now()}-${(compteurId++).toString(36)}`;

// Unité de comptage d'un produit du catalogue. Le catalogue raisonne en unité
// de base (g, ml) avec un prix au gramme ; personne ne compte une chambre
// froide en grammes. On compte en kg et en L, le prix suit (×1000).
export const uniteComptageDepuisCatalogue = (uniteRef) => {
  if (uniteRef === 'g') return { unite: 'kg', facteurPrix: 1000 };
  if (uniteRef === 'ml') return { unite: 'L', facteurPrix: 1000 };
  return { unite: uniteRef || 'pcs', facteurPrix: 1 };
};

// Catégories du catalogue ramenées à celles de l'inventaire quand elles
// correspondent ; sinon on garde celle du catalogue telle quelle.
export const ligneDepuisProduit = (produit) => {
  const { unite, facteurPrix } = uniteComptageDepuisCatalogue(produit.uniteRef);
  const prix = Number(produit.prixUnitaire) || 0;
  return {
    id: nouvelIdLigne(),
    produit: produit.nom,
    categorie: produit.categorie || 'Autres',
    unite,
    stockTheo: 0,
    stockReel: null,
    prixUnit: +(prix * facteurPrix).toFixed(4),
    produitId: produit.id || null,
  };
};

export const ligneLibre = (nom, { categorie = 'Autres', unite = 'pcs', prixUnit = 0 } = {}) => ({
  id: nouvelIdLigne(),
  produit: String(nom || '').trim(),
  categorie,
  unite,
  stockTheo: 0,
  stockReel: null,
  prixUnit: Number(prixUnit) || 0,
});

// Lignes d'un nouvel inventaire repris du précédent : même liste de produits,
// quantité précédente gardée en stock théorique et en indication, stock réel
// à recompter.
export const lignesReprises = (lignesPrecedentes) => (lignesPrecedentes || []).map(l => ({
  ...l,
  id: nouvelIdLigne(),
  stockTheo: Number(l.stockReel) || 0,
  precedent: estCompte(l) ? Number(l.stockReel) : null,
  stockReel: null,
  compteLe: undefined,
}));
