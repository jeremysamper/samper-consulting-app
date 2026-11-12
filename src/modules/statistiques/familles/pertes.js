// Famille Pertes du catalogue des Statistiques : chaque mesure lit un chiffre
// rendu par seriePertes (pertes/calculPertes.js), la règle de l'écran Pertes
// (quantité fois valeur unitaire, validées ou non). Sans React ni service.
//
// Une tranche sans perte vaut « n/a », jamais 0. L'écran d'origine somme sans
// arrondir puis affiche au centime : le total de la période est donc celui de
// l'écran, et la somme des points arrondis peut s'en écarter d'un centime,
// dit sous le tableau.

import { seriePertes } from '../../pertes/calculPertes.js';

const sauf = (p, f) => (p.vide ? null : f(p));
const parts = (objet) => Object.entries(objet || {}).map(([cle, valeur]) => ({ cle, libelle: cle, valeur }));

export const famillePertes = {
  id: 'pertes',
  libelle: 'Pertes',
  journee: 'la date de la perte',
  calculer(donnees, tranches) {
    return seriePertes(donnees.pertes, tranches);
  },
  mesures: [
    {
      id: 'pertes.valeur', libelle: 'Valeur des pertes', unite: 'chf', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.valeur),
      ventilations: [
        { id: 'categorie', libelle: 'Par catégorie', parts: (p) => parts(p.parCategorie) },
        { id: 'motif', libelle: 'Par motif', parts: (p) => parts(p.parMotif) },
      ],
      phrase: 'Quantité perdue fois valeur unitaire, pertes validées ou non, au jour de la perte.',
    },
    {
      id: 'pertes.declarations', libelle: 'Pertes déclarées', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.declarations),
      phrase: 'Nombre de pertes déclarées, validées ou non.',
    },
  ],
};
