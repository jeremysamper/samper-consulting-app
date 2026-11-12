// Famille Groupes du catalogue des Statistiques : chaque mesure lit un
// chiffre rendu par serieGroupes (groupes/serieGroupes.js), la règle de la
// liste du mois du calendrier. Sans React ni service.
// Une tranche sans groupe vaut « n/a », jamais 0.

import { serieGroupes } from '../../groupes/serieGroupes.js';

const sauf = (p, f) => (p.vide ? null : f(p));

export const familleGroupes = {
  id: 'groupes',
  libelle: 'Groupes',
  journee: 'la date de l\'événement',
  calculer(donnees, tranches) {
    return serieGroupes(donnees.groupes, tranches);
  },
  mesures: [
    {
      id: 'groupes.groupes', libelle: 'Groupes reçus', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.groupes),
      phrase: 'Groupes non annulés, au jour de l\'événement, comme la liste du mois du calendrier.',
    },
    {
      id: 'groupes.convives', libelle: 'Convives des groupes', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.convives),
      phrase: 'Somme des pax annoncés des groupes non annulés.',
    },
    {
      id: 'groupes.annules', libelle: 'Groupes annulés', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.annules),
      phrase: 'Groupes annulés, comptés au jour de l\'événement prévu.',
    },
  ],
};
