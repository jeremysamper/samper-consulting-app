import { EPICES, HERBES_FLEURS, rayonParMotsCles } from '../commande/classerProduit.js';

// ─────────────────────────────────────────────────────────────────────────────
// Catégories officielles du catalogue produits, source unique pour l'écran
// Catalogue, l'import IA et l'aperçu d'import (elles étaient recopiées dans
// trois fichiers).
//
// Depuis le 02.10.2026, « Herbes / épices » est scindée en « Herbes & fleurs »
// (herbes fraîches, fleurs comestibles, cueillette) et « Épices » (poivres,
// sels, épices, vanille, herbes séchées), mêmes libellés que les rayons de la
// commande. L'ancien libellé peut encore arriver : fonction `ai-proxy`
// (liste de catégories imposée à l'IA), fichier d'import, anciennes lignes :
// `affinerCategorie` le range alors d'après le nom du produit.
// ─────────────────────────────────────────────────────────────────────────────

export const ANCIENNE_HERBES_EPICES = 'Herbes / épices';

export const CATEGORIES_PRODUITS = [
  'Viandes', 'Poissons & fruits de mer', 'Fruits & légumes',
  'Épicerie sèche', 'Produits laitiers', 'Crèmerie / fromages',
  'Boulangerie / pâtisserie', 'Boissons', 'Alcools',
  'Surgelés', 'Condiments / sauces', HERBES_FLEURS, EPICES,
  'Hygiène / non alimentaire', 'Autres',
];

// Catégorie d'un produit IMPORTÉ (fichier, IA) : herbes et épices sont
// départagées par le nom, parce qu'un fichier fournisseur les met souvent
// sur une même feuille (« Gewürze & Kräuter »). Un choix fait à la main dans
// la fiche produit n'y passe pas : il est respecté tel quel.
export function affinerCategorie(nom, categorie) {
  if (![ANCIENNE_HERBES_EPICES, HERBES_FLEURS, EPICES].includes(categorie)) return categorie;
  return rayonParMotsCles(nom) === HERBES_FLEURS ? HERBES_FLEURS : EPICES;
}

// Catégorie affichée d'une fiche : l'ancien libellé, tant qu'une fiche le
// porte encore, est montré sous sa nouvelle catégorie.
export const categorieAffichee = (produit) => (
  produit?.categorie === ANCIENNE_HERBES_EPICES
    ? affinerCategorie(produit.nom, produit.categorie)
    : (produit?.categorie || 'Autres')
);
