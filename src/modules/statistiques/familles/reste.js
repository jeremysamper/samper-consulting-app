// Familles Journal, SOP, Cuisine (écran de cuisine) et Mise en place du
// catalogue des Statistiques : chaque mesure lit un chiffre rendu par la
// fonction de série de son module (serieJournal, serieSop, serieKds,
// serieMep). Sans React ni service. Une tranche vide vaut « n/a ».

import { MODULES_JOURNAL, OPERATIONS_JOURNAL, serieJournal } from '../../journal/serieJournal.js';
import { serieSop } from '../../sop/serieSop.js';
import { serieKds } from '../../kds/serieKds.js';
import { serieMep } from '../../mep/serieMep.js';
import { SANS_PRATICIEN_SPA, serieSpa } from '../../spa/serieSpa.js';
import { serieVentesPos } from '../../pos/lib/serieVentesPos.js';

const sauf = (p, f) => (p.vide ? null : f(p));
const compte = (objet, libelles) => Object.entries(objet || {}).map(([cle, valeur]) => ({ cle, libelle: libelles[cle] || cle, valeur }));

export const familleJournal = {
  id: 'journal',
  libelle: 'Journal d\'activité',
  journee: 'le jour de Zurich de la modification',
  calculer(donnees, tranches) {
    return serieJournal(donnees.lignes, tranches);
  },
  mesures: [
    {
      id: 'journal.entrees', libelle: 'Modifications enregistrées', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.entrees,
      ventilations: [
        { id: 'module', libelle: 'Par module', parts: (p) => compte(p.parModule, MODULES_JOURNAL) },
        { id: 'operation', libelle: 'Par action', parts: (p) => compte(p.parOperation, OPERATIONS_JOURNAL) },
      ],
      phrase: 'Créations, modifications et suppressions relevées par le journal d\'activité : recettes, produits, pertes, inventaires et corrections de la caisse.',
    },
  ],
};

export const familleSop = {
  id: 'sop',
  libelle: 'SOP et checklists',
  journee: 'la date d\'exécution',
  calculer(donnees, tranches) {
    return serieSop(donnees.executions, tranches);
  },
  mesures: [
    {
      id: 'sop.lancees', libelle: 'Exécutions lancées', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.lancees),
      phrase: 'Exécutions de procédures commencées, quel que soit leur sort.',
    },
    {
      id: 'sop.terminees', libelle: 'Exécutions terminées', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.terminees),
      phrase: 'Exécutions validées comme terminées. L\'en-tête des SOP ne compte que les cent dernières exécutions chargées ; ici, toutes.',
    },
    {
      id: 'sop.abandonnees', libelle: 'Exécutions abandonnées', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.abandonnees),
      phrase: 'Exécutions abandonnées en cours de route.',
    },
    {
      id: 'sop.etapes', libelle: 'Étapes cochées', unite: 'pct', nature: 'taux',
      valeur: (p) => p.tauxEtapes,
      phrase: 'Étapes cochées divisées par les étapes des exécutions du pas ; recalculé sur chaque pas.',
    },
  ],
};

export const familleKds = {
  id: 'kds',
  libelle: 'Écran de cuisine',
  journee: 'le jour de Zurich de la fin de la commande',
  calculer(donnees, tranches) {
    return serieKds(donnees.orders, tranches);
  },
  mesures: [
    {
      id: 'kds.terminees', libelle: 'Commandes terminées en cuisine', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.terminees),
      phrase: 'Commandes de l\'écran de cuisine terminées, au jour de leur fin.',
    },
    {
      id: 'kds.duree', libelle: 'Durée d\'une commande en cuisine', unite: 'min', nature: 'taux',
      valeur: (p) => p.dureeMoyenne,
      phrase: 'Minutes entre l\'ouverture du ticket et la fin de la commande, en moyenne, la mesure du minuteur d\'un bon ; recalculé sur chaque pas.',
    },
  ],
};

export const familleMep = {
  id: 'mep',
  libelle: 'Mise en place',
  journee: 'la date de service de la liste',
  calculer(donnees, tranches) {
    return serieMep(donnees.listes, tranches);
  },
  mesures: [
    {
      id: 'mep.preparations', libelle: 'Préparations prévues', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.preparations),
      phrase: 'Préparations des listes de mise en place, au jour de service de la liste.',
    },
    {
      id: 'mep.faites', libelle: 'Préparations faites', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.faites),
      phrase: 'Préparations cochées comme faites.',
    },
    {
      id: 'mep.taux', libelle: 'Mise en place faite', unite: 'pct', nature: 'taux',
      valeur: (p) => p.taux,
      phrase: 'Préparations faites divisées par les préparations des listes, comme l\'avancement d\'une liste ; recalculé sur chaque pas.',
    },
  ],
};

// Spa : soins de l'agenda (ni annulés ni absents), durée en cabine, par
// praticien, et bons cadeaux créés. Une tranche sans rendez-vous vaut « n/a ».
export const familleSpa = {
  id: 'spa',
  libelle: 'Spa',
  journee: 'le jour du rendez-vous',
  calculer(donnees, tranches) {
    return serieSpa({ reservations: donnees.reservations, bons: donnees.bons }, tranches);
  },
  mesures: [
    {
      id: 'spa.soins', libelle: 'Soins réalisés ou prévus', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.soins),
      ventilations: [{ id: 'praticien', libelle: 'Par praticien', parts: (p) => Object.entries(p.parPraticien || {}).map(([nom, e]) => ({ cle: nom, libelle: nom, donnee: nom !== SANS_PRATICIEN_SPA, valeur: e.soins })) }],
      phrase: 'Rendez-vous ni annulés ni absents, au jour du rendez-vous, comme l\'agenda du Spa.',
    },
    {
      id: 'spa.minutes', libelle: 'Minutes en cabine', unite: 'min', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.minutes),
      ventilations: [{ id: 'praticien', libelle: 'Par praticien', parts: (p) => Object.entries(p.parPraticien || {}).map(([nom, e]) => ({ cle: nom, libelle: nom, donnee: nom !== SANS_PRATICIEN_SPA, valeur: e.minutes })) }],
      phrase: 'Somme des durées des soins ni annulés ni absents.',
    },
    {
      id: 'spa.annules', libelle: 'Soins annulés ou absents', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.annules),
      phrase: 'Rendez-vous annulés, ou dont le client ne s\'est pas présenté.',
    },
    {
      id: 'spa.bons', libelle: 'Bons cadeaux créés', unite: 'nombre', nature: 'flux',
      valeur: (p) => p.bons,
      phrase: 'Bons cadeaux créés, au jour de leur création. Leur valeur est un texte, pas un montant : elle ne s\'additionne pas.',
    },
  ],
};

// Ventes POS (caisse reliée) : quantités et chiffre, par plat, comme le top et
// flop. Une tranche sans vente vaut « n/a ».
const parPlatPos = (cle) => [
  { id: 'plat', libelle: 'Par plat, les plus vendus', parts: (p) => Object.entries(p.parPlat || {}).map(([id, x]) => ({ cle: id, libelle: x.nom, donnee: true, valeur: x[cle] })) },
  { id: 'plat_moins', libelle: 'Par plat, les moins vendus', ordre: 'croissant', parts: (p) => Object.entries(p.parPlat || {}).filter(([, x]) => x.qte > 0).map(([id, x]) => ({ cle: id, libelle: x.nom, donnee: true, valeur: x[cle] })) },
];

export const familleVentesPos = {
  id: 'pos',
  libelle: 'Ventes POS',
  journee: 'le jour de la vente dans la caisse reliée',
  calculer(donnees, tranches) {
    return serieVentesPos(donnees.ventes, donnees.noms, tranches);
  },
  mesures: [
    {
      id: 'pos.qte', libelle: 'Quantités vendues (caisse reliée)', unite: 'nombre', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.qte),
      ventilations: parPlatPos('qte'),
      phrase: 'Articles vendus dans la caisse reliée, au jour de la vente, comme le top et flop des Ventes POS.',
    },
    {
      id: 'pos.chiffre', libelle: 'Chiffre de la caisse reliée', unite: 'chf', nature: 'flux',
      valeur: (p) => sauf(p, (x) => x.chiffre),
      ventilations: parPlatPos('chiffre'),
      phrase: 'Chiffre des articles vendus que rend la caisse reliée, TVA comprise, au jour de la vente.',
    },
  ],
};
