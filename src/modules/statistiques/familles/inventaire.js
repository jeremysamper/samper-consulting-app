// Famille Inventaire du catalogue des Statistiques : chaque mesure lit un
// chiffre rendu par serieInventaire (inventaire/serieInventaire.js). Seuls les
// inventaires validés comptent, comme la variation de stock de la
// Comptabilité. Sans React ni service.
//
// La valeur du stock est un relevé : un pas vaut le stock connu à sa fin (le
// dernier inventaire validé de chaque périmètre), la période son dernier
// relevé. Manques et surplus sont des flux, datés au jour de l'inventaire.

import { serieInventaire } from '../../inventaire/serieInventaire.js';

export const familleInventaire = {
  id: 'inventaire',
  libelle: 'Inventaire',
  journee: 'la date de l\'inventaire',
  calculer(donnees, tranches) {
    return serieInventaire(donnees.inventaires, tranches);
  },
  mesures: [
    {
      id: 'inventaire.stock', libelle: 'Valeur du stock', unite: 'chf', nature: 'stock',
      valeur: (p) => p.stock,
      phrase: 'Somme du dernier inventaire validé de chaque périmètre, connu à la fin du pas : produits comptés fois prix unitaire.',
    },
    {
      id: 'inventaire.manques', libelle: 'Manques d\'inventaire', unite: 'chf', nature: 'flux',
      valeur: (p) => p.manques,
      phrase: 'Valeur des écarts négatifs (stock compté sous le stock attendu) des inventaires validés du pas.',
    },
    {
      id: 'inventaire.surplus', libelle: 'Surplus d\'inventaire', unite: 'chf', nature: 'flux',
      valeur: (p) => p.surplus,
      phrase: 'Valeur des écarts positifs (stock compté au-dessus du stock attendu) des inventaires validés du pas.',
    },
    {
      id: 'inventaire.comptages', libelle: 'Inventaires validés', unite: 'nombre', nature: 'flux',
      valeur: (p) => (p.inventaires ? p.inventaires : null),
      phrase: 'Nombre d\'inventaires validés datés dans le pas, tous périmètres.',
    },
  ],
};
