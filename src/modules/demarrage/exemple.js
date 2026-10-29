// ─────────────────────────────────────────────────────────────────────────────
// Données d'exemple de la mise en route : 12 recettes de bistrot (4 entrées,
// 5 plats, 3 desserts), 1 carte qui les range, 30 produits de catalogue.
//
// Ids déterministes préfixés `exemple-<établissement>-` : charger deux fois
// écrase au lieu de doubler, et le registre donnees_exemple n'accepte que ce
// préfixe (contrainte de la migration 20261030_demarrage). Unités du parseur
// d'import (g, ml, pcs, cs, cc, pincée), allergènes du référentiel
// src/utils/allergenes.js seulement, aucun prix (le chiffrage vit dans les
// Outils consultant).
// ─────────────────────────────────────────────────────────────────────────────

// [clé, nom, catégorie (rayon du catalogue), unité de référence, allergènes]
const PRODUITS = [
  ['courge', 'Courge butternut', 'Fruits & légumes', 'g', []],
  ['oignon', 'Oignons', 'Fruits & légumes', 'g', []],
  ['echalote', 'Échalotes', 'Fruits & légumes', 'g', []],
  ['ail', 'Ail', 'Fruits & légumes', 'g', []],
  ['champignon', 'Champignons de Paris', 'Fruits & légumes', 'g', []],
  ['pdt', 'Pommes de terre', 'Fruits & légumes', 'g', []],
  ['carotte', 'Carottes', 'Fruits & légumes', 'g', []],
  ['salade', 'Salade mêlée', 'Fruits & légumes', 'g', []],
  ['pomme', 'Pommes', 'Fruits & légumes', 'g', []],
  ['citron', 'Citrons', 'Fruits & légumes', 'pcs', []],
  ['boeuf', 'Bœuf à braiser', 'Viandes', 'g', []],
  ['volaille', 'Suprêmes de volaille', 'Viandes', 'pcs', []],
  ['perche', 'Filets de perche', 'Poissons & fruits de mer', 'g', ['poissons']],
  ['truite', 'Filets de truite', 'Poissons & fruits de mer', 'g', ['poissons']],
  ['beurre', 'Beurre', 'Produits laitiers', 'g', ['lactose']],
  ['creme', 'Crème entière 35 %', 'Produits laitiers', 'ml', ['lactose']],
  ['lait', 'Lait entier', 'Produits laitiers', 'ml', ['lactose']],
  ['oeuf', 'Œufs', 'Produits laitiers', 'pcs', ['oeufs']],
  ['chevre', 'Fromage de chèvre', 'Crèmerie / fromages', 'g', ['lactose']],
  ['gruyere', 'Gruyère AOP', 'Crèmerie / fromages', 'g', ['lactose']],
  ['parmesan', 'Parmesan', 'Crèmerie / fromages', 'g', ['lactose']],
  ['riz', 'Riz Arborio', 'Épicerie sèche', 'g', []],
  ['farine', 'Farine', 'Épicerie sèche', 'g', ['gluten']],
  ['sucre', 'Sucre', 'Épicerie sèche', 'g', []],
  ['chocolat', 'Chocolat noir 64 %', 'Épicerie sèche', 'g', []],
  ['noix', 'Cerneaux de noix', 'Épicerie sèche', 'g', ['fruits_coque']],
  ['pain', 'Pain de campagne', 'Boulangerie / pâtisserie', 'g', ['gluten']],
  ['feuilletee', 'Pâte feuilletée', 'Boulangerie / pâtisserie', 'g', ['gluten', 'lactose']],
  ['vinrouge', 'Vin rouge', 'Alcools', 'ml', ['sulfites']],
  ['moutarde', 'Moutarde', 'Condiments / sauces', 'g', ['moutarde']],
];

// Ingrédient : [clé produit ou null, nom, quantité, unité]
const RECETTES = [
  {
    nom: 'Velouté de courge, crème au thym', categorie: 'Entrées', allergenes: ['lactose'],
    ingredients: [['courge', 'Courge butternut', 800, 'g'], ['oignon', 'Oignons', 100, 'g'], ['beurre', 'Beurre', 30, 'g'], ['creme', 'Crème entière 35 %', 100, 'ml'], [null, 'Eau', 700, 'ml'], [null, 'Thym frais', 2, 'pcs'], [null, 'Sel', 1, 'pincée']],
    etapes: ['Éplucher la courge et l\'oignon, les tailler en dés.', 'Faire suer au beurre 5 minutes, mouiller à hauteur et cuire 25 minutes.', 'Mixer finement, ajouter la crème et rectifier l\'assaisonnement.', 'Infuser le thym dans un peu de crème chaude pour la finition.'],
    dressage: 'Assiette creuse chaude, un trait de crème au thym, poivre du moulin.',
    conservation: '3 jours au froid positif, filmé, en bac gastro.',
  },
  {
    nom: 'Salade de chèvre chaud au miel', categorie: 'Entrées', allergenes: ['gluten', 'lactose', 'fruits_coque'],
    ingredients: [['salade', 'Salade mêlée', 240, 'g'], ['chevre', 'Fromage de chèvre', 240, 'g'], ['pain', 'Pain de campagne', 160, 'g'], ['noix', 'Cerneaux de noix', 40, 'g'], [null, 'Miel', 2, 'cs'], [null, 'Vinaigrette maison', 4, 'cs']],
    etapes: ['Couper le pain en tranches et le chèvre en rondelles.', 'Poser le chèvre sur le pain, un filet de miel, gratiner 5 minutes à 200 °C.', 'Assaisonner la salade et les noix concassées.'],
    dressage: 'Salade en dôme, deux toasts chauds posés contre, miel en filet.',
    conservation: 'Chèvre et salade à part au froid positif ; toasts gratinés à la minute.',
  },
  {
    nom: 'Œuf parfait, champignons et croûtons', categorie: 'Entrées', allergenes: ['oeufs', 'gluten', 'lactose'],
    ingredients: [['oeuf', 'Œufs', 4, 'pcs'], ['champignon', 'Champignons de Paris', 300, 'g'], ['echalote', 'Échalotes', 40, 'g'], ['pain', 'Pain de campagne', 80, 'g'], ['beurre', 'Beurre', 30, 'g'], ['creme', 'Crème entière 35 %', 100, 'ml']],
    etapes: ['Cuire les œufs 45 minutes à 64 °C.', 'Poêler les champignons et l\'échalote au beurre, crémer et réduire.', 'Dorer les croûtons de pain au beurre.'],
    dressage: 'Champignons crémés au fond, l\'œuf écalé dessus, croûtons et fleur de sel.',
    conservation: 'Œufs cuits refroidis : 2 jours au froid positif, remis à 60 °C avant l\'envoi.',
  },
  {
    nom: 'Tartare de truite, condiment moutarde', categorie: 'Entrées', allergenes: ['poissons', 'moutarde'],
    ingredients: [['truite', 'Filets de truite', 360, 'g'], ['echalote', 'Échalotes', 30, 'g'], ['citron', 'Citrons', 1, 'pcs'], ['moutarde', 'Moutarde', 15, 'g'], [null, 'Huile de colza', 2, 'cs'], [null, 'Ciboulette', 1, 'cs']],
    etapes: ['Tailler la truite parée en petits dés, garder sur glace.', 'Mélanger échalote ciselée, moutarde, jus de citron et huile.', 'Assaisonner le tartare au dernier moment.'],
    dressage: 'Cercle au centre de l\'assiette froide, ciboulette ciselée, quartier de citron.',
    conservation: 'Poisson cru : à préparer le jour même, 0 à 2 °C, jamais assaisonné d\'avance.',
  },
  {
    nom: 'Bœuf bourguignon, purée maison', categorie: 'Plats', allergenes: ['sulfites', 'lactose', 'gluten'],
    ingredients: [['boeuf', 'Bœuf à braiser', 800, 'g'], ['vinrouge', 'Vin rouge', 500, 'ml'], ['carotte', 'Carottes', 200, 'g'], ['oignon', 'Oignons', 150, 'g'], ['champignon', 'Champignons de Paris', 200, 'g'], ['farine', 'Farine', 20, 'g'], ['pdt', 'Pommes de terre', 800, 'g'], ['lait', 'Lait entier', 200, 'ml'], ['beurre', 'Beurre', 60, 'g']],
    etapes: ['Saisir le bœuf en morceaux, singer avec la farine.', 'Ajouter carottes et oignons, mouiller au vin rouge et cuire 2 h 30 à couvert.', 'Ajouter les champignons poêlés 15 minutes avant la fin.', 'Cuire les pommes de terre, les écraser avec le lait chaud et le beurre.'],
    dressage: 'Purée en quenelle, bourguignon nappé à côté, persil haché.',
    conservation: 'Bourguignon : 4 jours au froid positif, se congèle ; purée : 2 jours.',
  },
  {
    nom: 'Filets de perche, sauce tartare et frites', categorie: 'Plats', allergenes: ['poissons', 'gluten', 'oeufs', 'moutarde', 'lactose'],
    ingredients: [['perche', 'Filets de perche', 600, 'g'], ['farine', 'Farine', 60, 'g'], ['beurre', 'Beurre', 40, 'g'], ['pdt', 'Pommes de terre', 800, 'g'], ['oeuf', 'Œufs', 1, 'pcs'], ['moutarde', 'Moutarde', 10, 'g'], ['citron', 'Citrons', 1, 'pcs'], [null, 'Huile de friture', 2, 'L']],
    etapes: ['Monter une mayonnaise avec l\'œuf et la moutarde, ajouter câpres et cornichons hachés.', 'Tailler les frites, blanchir à 150 °C puis dorer à 180 °C.', 'Fariner les filets et les meunière au beurre mousseux.'],
    dressage: 'Filets en éventail, frites à côté, sauce tartare en ramequin, citron.',
    conservation: 'Sauce tartare : 2 jours au froid positif ; poisson cuit à la minute.',
  },
  {
    nom: 'Risotto aux champignons', categorie: 'Plats', allergenes: ['lactose', 'sulfites'],
    ingredients: [['riz', 'Riz Arborio', 320, 'g'], ['champignon', 'Champignons de Paris', 300, 'g'], ['echalote', 'Échalotes', 50, 'g'], ['parmesan', 'Parmesan', 80, 'g'], ['beurre', 'Beurre', 50, 'g'], [null, 'Vin blanc', 100, 'ml'], [null, 'Bouillon de légumes', 1, 'L']],
    etapes: ['Nacrer le riz avec l\'échalote, déglacer au vin blanc.', 'Mouiller au bouillon chaud louche par louche pendant 18 minutes.', 'Ajouter les champignons poêlés, monter au beurre et au parmesan hors du feu.'],
    dressage: 'Assiette creuse, risotto qui s\'étale, copeaux de parmesan.',
    conservation: 'Riz précuit 12 minutes, refroidi en plaque : 2 jours, fini à la commande.',
  },
  {
    nom: 'Suprême de volaille, jus au thym', categorie: 'Plats', allergenes: ['lactose'],
    ingredients: [['volaille', 'Suprêmes de volaille', 4, 'pcs'], ['carotte', 'Carottes', 300, 'g'], ['pdt', 'Pommes de terre', 500, 'g'], ['beurre', 'Beurre', 40, 'g'], ['ail', 'Ail', 10, 'g'], [null, 'Fond de volaille', 300, 'ml'], [null, 'Thym frais', 3, 'pcs']],
    etapes: ['Colorer les suprêmes côté peau, finir au four 12 minutes à 180 °C.', 'Réduire le fond avec l\'ail et le thym, monter au beurre.', 'Rôtir pommes de terre et carottes en morceaux.'],
    dressage: 'Suprême tranché en deux, légumes rôtis, jus autour.',
    conservation: 'Volaille crue 2 jours à 2 °C ; jus : 4 jours, se congèle.',
  },
  {
    nom: 'Croûte au fromage', categorie: 'Plats', allergenes: ['gluten', 'lactose', 'sulfites'],
    ingredients: [['pain', 'Pain de campagne', 400, 'g'], ['gruyere', 'Gruyère AOP', 320, 'g'], ['ail', 'Ail', 5, 'g'], [null, 'Vin blanc', 120, 'ml'], [null, 'Poivre noir', 1, 'pincée']],
    etapes: ['Frotter les tranches de pain à l\'ail et les arroser de vin blanc.', 'Couvrir de gruyère râpé.', 'Gratiner 10 minutes à 220 °C.'],
    dressage: 'Plat à gratin brûlant sur assiette, poivre du moulin, salade à côté.',
    conservation: 'Montée à la commande ; gruyère râpé 3 jours au froid positif.',
  },
  {
    nom: 'Crème brûlée à la vanille', categorie: 'Desserts', allergenes: ['oeufs', 'lactose'],
    ingredients: [['creme', 'Crème entière 35 %', 400, 'ml'], ['oeuf', 'Œufs', 4, 'pcs'], ['sucre', 'Sucre', 100, 'g'], [null, 'Gousse de vanille', 1, 'pcs']],
    etapes: ['Infuser la vanille dans la crème chaude.', 'Blanchir les jaunes avec le sucre, verser la crème.', 'Cuire 1 heure à 95 °C, refroidir.', 'Caraméliser au chalumeau au moment de servir.'],
    dressage: 'Ramequin sur assiette à dessert, caramel craquant.',
    conservation: '3 jours au froid positif, filmées, caramélisées à la minute.',
  },
  {
    nom: 'Tarte fine aux pommes', categorie: 'Desserts', allergenes: ['gluten', 'lactose'],
    ingredients: [['feuilletee', 'Pâte feuilletée', 250, 'g'], ['pomme', 'Pommes', 600, 'g'], ['beurre', 'Beurre', 30, 'g'], ['sucre', 'Sucre', 40, 'g']],
    etapes: ['Détailler la pâte en quatre disques, piquer.', 'Couvrir de lamelles de pomme en rosace, beurre fondu et sucre.', 'Cuire 20 minutes à 200 °C.'],
    dressage: 'Tarte tiède, une boule de glace vanille.',
    conservation: 'Cuite : 1 jour à température ambiante ; disques crus : 2 jours au froid.',
  },
  {
    nom: 'Mousse au chocolat', categorie: 'Desserts', allergenes: ['oeufs', 'lactose'],
    ingredients: [['chocolat', 'Chocolat noir 64 %', 200, 'g'], ['oeuf', 'Œufs', 6, 'pcs'], ['beurre', 'Beurre', 40, 'g'], ['sucre', 'Sucre', 40, 'g']],
    etapes: ['Fondre le chocolat et le beurre au bain-marie.', 'Incorporer les jaunes, puis les blancs montés avec le sucre.', 'Dresser et prendre au froid 4 heures.'],
    dressage: 'Verrine, copeaux de chocolat.',
    conservation: 'Œufs crus : 24 heures au froid positif, à la date du jour.',
  },
];

const deux = (n) => String(n).padStart(2, '0');

export function construireExemple(etabId) {
  const prefixe = `exemple-${etabId}-`;
  const idProduit = (cle) => `${prefixe}prod-${cle}`;
  const categorieDe = Object.fromEntries(PRODUITS.map(([cle, , categorie]) => [cle, categorie]));

  const produits = PRODUITS.map(([cle, nom, categorie, uniteRef, allergenes]) => ({
    id: idProduit(cle), etablissementId: etabId, nom, categorie, uniteRef, allergenes, actif: true,
  }));

  const recettes = RECETTES.map((r, i) => ({
    id: `${prefixe}rec-${deux(i + 1)}`,
    etablissementId: etabId,
    nom: r.nom,
    categorie: r.categorie,
    portions: 4,
    statut: 'active',
    version: 1,
    allergenesIds: r.allergenes,
    dressage: r.dressage,
    conservation: r.conservation,
    ingredients: r.ingredients.map(([cle, nom, quantite, unite], j) => ({
      id: `exemple-i-${deux(i + 1)}-${deux(j + 1)}`,
      nom, quantite, unite, prixUnit: 0,
      categorie: cle ? categorieDe[cle] : 'Autres',
      ...(cle ? { produitId: idProduit(cle) } : {}),
    })),
    etapes: r.etapes,
  }));

  const carte = {
    id: `${prefixe}carte`,
    etablissementId: etabId,
    nom: "Carte d'exemple",
    dateDebut: null,
    dateFin: null,
    plats: recettes.map((r, i) => ({
      id: `exemple-p-${deux(i + 1)}`, nom: r.nom, categorie: r.categorie, prix: 0, allergenes: r.allergenesIds, recetteId: r.id,
    })),
  };

  return { produits, recettes, carte };
}
