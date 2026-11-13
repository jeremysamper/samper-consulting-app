// ─────────────────────────────────────────────────────────────────────────────
// Catalogue des widgets du tableau de bord : ce que chacun est, sans son
// composant (registre.js l'y ajoute). Fichier sans JSX, lu par les tests.
//
//   id           identifiant gardé dans la disposition (user_settings)
//   nom          nom affiché dans la galerie et le mode « Personnaliser »
//   description  une ligne pour la galerie
//   famille      rangement de la galerie (FAMILLES)
//   page         module ouvert par un toucher sur le widget, et son picto
//   tailles      tailles que le widget sait rendre (TAILLES), dans l'ordre
//   origine      taille dans la disposition d'origine, par poste ; null : le
//                widget n'y est pas (il attend dans la galerie)
//   visible(c)   garde : vraie quand le rôle, le module et la donnée le
//                permettent (le contexte est calculé par TableauDeBord.jsx,
//                avec les gardes d'avant, inchangées)
// ─────────────────────────────────────────────────────────────────────────────

export const TAILLES = ['petit', 'moyen', 'grand', 'pleine'];
export const POSTES = ['ordinateur', 'tablette', 'telephone'];
export const NOMS_TAILLES = { petit: 'Petit', moyen: 'Moyen', grand: 'Grand', pleine: 'Pleine largeur' };

export const FAMILLES = [
  { id: 'aujourdhui', nom: "Aujourd'hui" },
  { id: 'equipe', nom: 'Équipe' },
  { id: 'salle', nom: 'Salle' },
  { id: 'cuisine', nom: 'Cuisine' },
  { id: 'gestion', nom: 'Gestion' },
  { id: 'hotel', nom: 'Hôtel' },
  { id: 'raccourcis', nom: 'Raccourcis' },
];

const partout = (taille) => ({ ordinateur: taille, tablette: taille, telephone: taille });

export const CATALOGUE = [
  {
    id: 'repere-couverts', nom: 'Couverts du jour', description: 'Les couverts réservés aujourd\'hui, par service.',
    famille: 'aujourdhui', page: 'previsions', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.reperes.includes('couverts'),
  },
  {
    id: 'repere-groupes', nom: 'Groupes du jour', description: 'Les groupes attendus aujourd\'hui.',
    famille: 'aujourdhui', page: 'groupes', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.reperes.includes('groupes'),
  },
  {
    id: 'repere-equipe', nom: 'Équipe du jour', description: 'Les personnes au planning aujourd\'hui et les absences.',
    famille: 'aujourdhui', page: 'planning', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.reperes.includes('equipe'),
  },
  {
    id: 'pointage', nom: 'Votre service', description: 'Pointer votre arrivée et votre départ.',
    famille: 'aujourdhui', page: 'planning', tailles: ['grand', 'pleine'], origine: { ordinateur: 'grand', tablette: 'grand', telephone: 'pleine' },
    visible: (c) => c.montrerPointage,
  },
  {
    id: 'a-faire', nom: 'À faire maintenant', description: 'Ce qui attend quelqu\'un, du plus urgent au moins urgent.',
    famille: 'aujourdhui', page: null, tailles: ['moyen', 'grand', 'pleine'], origine: { ordinateur: 'grand', tablette: 'grand', telephone: 'pleine' },
    visible: () => true,
  },
  {
    id: 'equipe', nom: 'L\'équipe aujourd\'hui', description: 'L\'équipe du jour par état de pointage, en tuiles.',
    famille: 'equipe', page: 'planning', tailles: ['moyen', 'grand', 'pleine'], origine: { ordinateur: 'grand', tablette: 'grand', telephone: 'pleine' },
    visible: (c) => c.carteEquipe, avant: true,
  },
  {
    id: 'semaine', nom: 'Couverts de la semaine', description: 'Les couverts réservés des sept prochains jours.',
    famille: 'salle', page: 'previsions', tailles: ['moyen', 'grand'], origine: { ordinateur: 'moyen', tablette: 'moyen', telephone: 'moyen' },
    visible: (c) => c.cartesCouverts, avant: true,
  },
  {
    id: 'reservations', nom: 'Réservations du jour', description: 'Les couverts du jour par service.',
    famille: 'salle', page: 'previsions', tailles: ['moyen', 'grand'], origine: { ordinateur: 'moyen', tablette: 'moyen', telephone: 'moyen' },
    visible: (c) => c.cartesCouverts, avant: true,
  },
  {
    id: 'qui-travaille', nom: 'Qui travaille aujourd\'hui', description: 'L\'équipe du jour rangée par service, avec les absences.',
    famille: 'equipe', page: 'planning', tailles: ['grand', 'pleine'], origine: { ordinateur: 'pleine', tablette: 'pleine', telephone: null },
    visible: (c) => c.equipeAPart,
  },
  {
    id: 'hotel', nom: 'Aujourd\'hui à l\'hôtel', description: 'Arrivées, départs et chambres du jour.',
    famille: 'hotel', page: 'hebergement', tailles: ['pleine'], origine: partout('pleine'),
    visible: (c) => c.avecHotel,
  },
  {
    id: 'mot-consultant', nom: 'Le mot du consultant', description: 'Le message du consultant à toute l\'équipe.',
    famille: 'aujourdhui', page: null, tailles: ['moyen', 'pleine'], origine: partout('pleine'),
    visible: (c) => c.motVisible,
  },
  {
    id: 'a-venir', nom: 'Ce qui vous attend', description: 'Aujourd\'hui, demain et cette semaine.',
    famille: 'aujourdhui', page: null, tailles: ['pleine'], origine: partout('pleine'),
    visible: () => true,
  },
  {
    id: 'chiffre-couverts', nom: 'Couverts réservés', description: 'Les couverts des sept prochains jours, en un chiffre.',
    famille: 'gestion', page: 'previsions', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.direction && c.avecCouvertsLus,
  },
  {
    id: 'chiffre-heures', nom: 'Heures planifiées', description: 'Les heures planifiées des sept prochains jours.',
    famille: 'gestion', page: 'planning', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.direction && c.avecPlanning,
  },
  {
    id: 'chiffre-pertes', nom: 'Pertes du mois', description: 'La valeur des pertes du mois et celles à valider.',
    famille: 'gestion', page: 'pertes', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.direction && c.avecPertes,
  },
  {
    id: 'chiffre-stock', nom: 'Stock valorisé', description: 'La valeur du dernier inventaire.',
    famille: 'gestion', page: 'inventaire', tailles: ['petit', 'moyen'], origine: partout('petit'),
    visible: (c) => c.direction && c.avecStock,
  },
  {
    id: 'regularite', nom: 'Régularité de l\'équipe', description: 'Les retards du jour et les soldes d\'heures négatifs.',
    famille: 'gestion', page: 'planning', tailles: ['moyen', 'pleine'], origine: partout('pleine'),
    visible: (c) => c.direction && c.avecRegularite,
  },
  // Widgets neufs (lot W), sur des données que le tableau de bord lit déjà.
  {
    id: 'haccp-releves', nom: 'Relevés HACCP du jour', description: 'La part des relevés de température faits aujourd\'hui.',
    famille: 'cuisine', page: 'haccp', tailles: ['petit', 'moyen'], origine: null,
    visible: (c) => c.avecReleves,
  },
  {
    id: 'pertes-semaines', nom: 'Pertes du mois, par semaine', description: 'Les pertes déclarées ce mois-ci, semaine par semaine.',
    famille: 'cuisine', page: 'pertes', tailles: ['moyen', 'grand'], origine: null,
    visible: (c) => c.direction && c.avecPertesLues,
  },
  {
    id: 'groupes', nom: 'Groupes à venir', description: 'Les groupes des quatorze prochains jours.',
    famille: 'salle', page: 'groupes', tailles: ['moyen', 'grand', 'pleine'], origine: null,
    visible: (c) => c.avecGroupesListe,
  },
  {
    id: 'absences', nom: 'Absences', description: 'Les absences du jour et celles des sept prochains jours.',
    famille: 'equipe', page: 'planning', tailles: ['moyen', 'grand'], origine: null,
    visible: (c) => c.avecAbsences,
  },
  {
    id: 'messages', nom: 'Messages non lus', description: 'Les messages qui vous attendent dans la messagerie.',
    famille: 'equipe', page: 'messages', tailles: ['petit', 'moyen'], origine: null,
    visible: (c) => c.avecMessages,
  },
  {
    id: 'raccourcis', nom: 'Raccourcis', description: 'Les modules que vous ouvrez le plus, d\'un geste.',
    famille: 'raccourcis', page: null, tailles: ['petit', 'moyen', 'grand', 'pleine'], origine: null,
    visible: (c) => c.modulesDuMenu.length > 0,
  },
];

export const PAR_ID = new Map(CATALOGUE.map((w) => [w.id, w]));
