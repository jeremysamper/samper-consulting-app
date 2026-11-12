// Familles de la branche Hôtel du catalogue des Statistiques : Hébergement
// (le registre du mois, sur tout pas), Demandes, Technique, Activités et
// Étages. Une famille par écran d'origine, chacune sous sa propre garde
// (D11). Chaque mesure lit un chiffre rendu par serieHotel
// (hebergement/serieHotel.js), dont statsPeriode est aussi le calcul du
// registre. Sans React ni service.
//
// Un jour sans séjour compte zéro nuitée (l'hôtel était vide) ; un quotient
// sans dénominateur vaut « n/a ».

import { serieHotel } from '../../hebergement/serieHotel.js';

export const familleHebergement = {
  id: 'hebergement',
  libelle: 'Hébergement',
  journee: 'la nuit passée à l\'hôtel',
  calculer: serieHotel,
  mesures: [
    {
      id: 'hebergement.nuitees_chambres', libelle: 'Nuitées chambres', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.registre.nuiteesChambres,
      phrase: 'Nuits vendues par chambre, des séjours en maison ou partis, comme le registre du mois.',
    },
    {
      id: 'hebergement.nuitees_personnes', libelle: 'Nuitées personnes', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.registre.nuiteesPersonnes,
      ventilations: [{ id: 'pays', libelle: 'Par pays de domicile', parts: (p) => p.registre.parPays.map((x) => ({ cle: x.pays, libelle: x.pays, donnee: x.pays !== 'Non renseigné', valeur: x.nuitees })) }],
      phrase: 'Nuits par personne hébergée, d\'après les occupants enregistrés, sinon les personnes du séjour ; par pays, comme la répartition HESTA.',
    },
    {
      id: 'hebergement.arrivees', libelle: 'Arrivées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.registre.arrivees,
      phrase: 'Séjours en maison ou partis arrivés dans le pas.',
    },
    {
      id: 'hebergement.occupation', libelle: 'Taux d\'occupation des chambres', unite: 'pct', nature: 'taux',
      valeur: (p) => p.registre.tauxOccupation,
      phrase: 'Nuitées chambres divisées par les chambres actives fois les jours du pas ; recalculé sur chaque pas.',
    },
    {
      id: 'hebergement.duree_moyenne', libelle: 'Durée moyenne de séjour', unite: 'nombre', nature: 'taux',
      valeur: (p) => p.registre.dureeMoyenne,
      phrase: 'Nuits des séjours arrivés dans le pas, divisées par leur nombre ; recalculé sur chaque pas.',
    },
    {
      id: 'hebergement.prix_moyen', libelle: 'Prix moyen par nuitée', unite: 'chf', nature: 'taux',
      valeur: (p) => p.registre.prixMoyen,
      phrase: 'Chiffre des nuitées divisé par les nuitées chambres ; recalculé sur chaque pas.',
    },
    {
      id: 'hebergement.ca_nuitees', libelle: 'Chiffre des nuitées', unite: 'chf', nature: 'flux',
      valeur: (p) => p.registre.caNuitees,
      phrase: 'Montant des lignes « nuitée » des notes de séjour, au jour de la nuit.',
    },
    {
      id: 'hebergement.taxe_sejour', libelle: 'Taxe de séjour', unite: 'chf', nature: 'flux',
      valeur: (p) => p.registre.taxes.sejour,
      phrase: 'Montant des lignes de taxe de séjour des notes, au jour de la ligne.',
    },
    {
      id: 'hebergement.taxe_hebergement', libelle: 'Taxe d\'hébergement', unite: 'chf', nature: 'flux',
      valeur: (p) => p.registre.taxes.hebergement,
      phrase: 'Montant des lignes de taxe d\'hébergement des notes, au jour de la ligne.',
    },
  ],
};

export const familleDemandes = {
  id: 'demandes',
  libelle: 'Demandes',
  journee: 'le jour de Zurich de la demande',
  calculer: serieHotel,
  mesures: [
    {
      id: 'demandes.creees', libelle: 'Demandes créées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes.creees,
      phrase: 'Demandes interpôles créées, au jour de leur création.',
    },
    {
      id: 'demandes.faites', libelle: 'Demandes faites', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.demandes.faites,
      phrase: 'Demandes passées à « faite », au jour où elles l\'ont été.',
    },
    {
      id: 'demandes.delai', libelle: 'Délai de traitement d\'une demande', unite: 'h', nature: 'taux',
      valeur: (p) => (p.demandes.nbDelais ? p.demandes.heuresTotal / p.demandes.nbDelais : null),
      phrase: 'Heures entre la création et la fin des demandes faites dans le pas, en moyenne ; recalculé sur chaque pas.',
    },
  ],
};

export const familleTechnique = {
  id: 'technique',
  libelle: 'Technique',
  journee: 'le jour de Zurich de la fin de l\'ordre de travail',
  calculer: serieHotel,
  mesures: [
    {
      id: 'technique.termines', libelle: 'Ordres de travail terminés', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.technique.termines,
      phrase: 'Ordres de travail passés à « terminé », au jour de leur fin.',
    },
    {
      id: 'technique.minutes', libelle: 'Temps passé en technique', unite: 'min', nature: 'flux',
      valeur: (p) => p.technique.minutes,
      phrase: 'Minutes saisies sur les ordres de travail terminés.',
    },
    {
      id: 'technique.cout', libelle: 'Coût des ordres de travail', unite: 'chf', nature: 'flux',
      valeur: (p) => p.technique.cout,
      phrase: 'Coût saisi sur les ordres de travail terminés.',
    },
  ],
};

export const familleActivites = {
  id: 'activites',
  libelle: 'Activités',
  journee: 'le jour de l\'activité',
  calculer: serieHotel,
  mesures: [
    {
      id: 'activites.inscrits', libelle: 'Personnes inscrites aux activités', unite: 'nombre', nature: 'flux',
      valeur: (p) => (p.activites.nombre ? p.activites.inscrits : null),
      phrase: 'Personnes des inscriptions non annulées aux activités non annulées, au jour de l\'activité.',
    },
    {
      id: 'activites.remplissage', libelle: 'Remplissage des activités', unite: 'pct', nature: 'taux',
      valeur: (p) => (p.activites.places ? p.activites.inscrits / p.activites.places : null),
      phrase: 'Personnes inscrites divisées par les places des activités qui en fixent ; recalculé sur chaque pas.',
    },
  ],
};

export const familleEtages = {
  id: 'etages',
  libelle: 'Étages',
  journee: 'le jour de Zurich du passage',
  calculer: serieHotel,
  mesures: [
    {
      id: 'etages.chambres_faites', libelle: 'Chambres faites', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.chambresFaites,
      phrase: 'Passages d\'une chambre à « propre » dans le journal du ménage.',
    },
    {
      id: 'etages.linge_sale', libelle: 'Linge sorti sale', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.linge.sale,
      phrase: 'Pièces de linge sorties sales, au jour du mouvement.',
    },
    {
      id: 'etages.linge_propre', libelle: 'Linge rentré propre', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.linge.propre,
      phrase: 'Pièces de linge rentrées propres, au jour du mouvement.',
    },
  ],
};
