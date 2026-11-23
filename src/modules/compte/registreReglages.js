import { isPageActiveForEtab, peutAdministrerCompte, peutOuvrirPage } from '../moduleConfig.js';
import { peutChangerLogo, peutOrganiserMenu } from '../../components/nav/gardesCoque.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
import { ROLES_MODE_TEST } from '../caisse/modeTest.js';
import { peutGererReservations, peutReglerEnLigne } from '../previsions/gardeEnLigne.js';
import { peutGererCartes } from '../recettes/gardesRecettes.js';
import { peutGererInventaire } from '../inventaire/gardesInventaire.js';
import { peutReglerFactures } from '../comptabilite/gardesCompta.js';
import { peutConfigurerHaccp } from '../haccp/gardesHaccp.js';
import { estDirectionSpa } from '../spa/gardesSpa.js';
import { estDirectionHotel } from '../hebergement/gardesHotel.js';
import { peutGererPassations } from '../passations/gardesPassations.js';
import { peutGererTechnique } from '../technique/gardesTechnique.js';
import { estDirectionPlanning, peutEcrirePlanning, peutOuvrirGroupes } from '../planning/gardesPlanning.js';
import { makeSearchMatcher } from '../../utils/searchText.js';
import { estDirectionModules } from '../../utils/reglagesModules.js';
import { peutGererPoints } from '../points/bareme.js';
import { canManageModule } from '../../data/demoData.js';
import { estDirectionMaison } from './gardesMaison.js';

// ─────────────────────────────────────────────────────────────────────────────
// Registre des réglages : tout ce qui se règle dans l'app, une section par
// réglage, dans la page 'compte' (Compte.jsx).
//
// Hiérarchie (15.11.2026) : quatre espaces, puis des entrées, puis les
// sections. Dans « Les modules », une entrée par module, qui porte toutes ses
// sections (pilules en tête du volet) ; ailleurs, une entrée par section.
//
//   id       : identifiant de la section. C'est aussi la valeur passée à
//              ouvrirCompte('<id>') par le raccourci du module, et celle du
//              signal de changement (services/reglagesSignal.js).
//   libelle  : nom de la section, seule ; detail : ce qu'on y règle.
//   groupe   : l'espace : 'moi' | 'appareil' | 'maison' | 'modules'.
//   module   : (espace « Les modules ») le module qui la porte : clé de
//              MODULES, une entrée de la liste par module.
//   onglet   : (module à plusieurs sections) le nom de sa pilule.
//   motsCles : (facultatif) d'autres mots qui la trouvent dans la recherche.
//   portee   : 'maison' (l'établissement ou toute l'app), 'personne', 'appareil'.
//   garde    : (ctx) => boolean, ctx = { user, permissions, etablissement,
//              shellMode }. C'est la garde d'aujourd'hui : celle du module
//              (peutOuvrirPage et module activé pour l'établissement), puis
//              celle de l'écran, IMPORTÉE du module et jamais recopiée. Une
//              section n'ouvre rien à personne et ne retire rien à personne.
//   charger  : import() de la section, qui monte l'écran d'origine tel quel.
//   signaux  : (facultatif) les signaux de changement émis pour cette section,
//              à la place de son id : 'table:<nom>' fait relire cette table à
//              tout module de la branche Hôtel resté monté (useTableHotel).
//
// Ajouter un réglage : exporter sa garde d'un fichier léger du module (pas
// d'import d'écran : ce registre est dans le bundle de départ), écrire sa
// section dans le dossier du module, l'inscrire ici avec son module et son
// onglet. Un réglage n'a qu'un endroit : jamais de raccourci en double.
//
// Règle de tri (18.11.2026) : un réglage vit dans son module, et non ici,
// seulement s'il est un seul contrôle (case, choix, geste sur un objet),
// propre à l'écran où l'on est, sans formulaire ni liste à gérer. Il entre
// alors dans le menu « Gérer » ou « Plus » du module, ou sur l'objet qu'il
// règle, jamais en bouton visible de plus. Tout le reste est approfondi et vit
// ici. Un réglage rendu à son module laisse un renvoi (RENVOIS) : la recherche
// le trouve encore et mène au module.
// ─────────────────────────────────────────────────────────────────────────────

// Ordre d'affichage : ce qui concerne chacun d'abord (son compte, son poste),
// puis la maison, puis les modules. Rôles & accès, rangé dans « La maison »,
// reste au-dessus de la liste des modules.
export const GROUPES = [
  { id: 'moi', label: 'Moi' },
  { id: 'appareil', label: 'Cet appareil' },
  { id: 'maison', label: 'La maison' },
  { id: 'modules', label: 'Les modules' },
];

// Les modules qui ont des réglages, avec le nom de leur entrée.
export const MODULES = {
  caisse: 'Caisse',
  kds: 'KDS',
  pos: 'Ventes POS',
  planning: 'Planning',
  previsions: 'Réservations',
  inventaire: 'Inventaire',
  commande: 'Commande',
  pertes: 'Pertes',
  achats: 'Factures & achats',
  comptabilite: 'Comptabilité',
  haccp: 'HACCP',
  cartes: 'Cartes & Recettes',
  mep: 'Mise en place',
  groupes: 'Groupes',
  fiches_salle: 'Fiches salle',
  sop: 'SOP',
  catalogue: 'Catalogue',
  points: 'Points',
  journal: "Journal d'activité",
  statistiques: 'Statistiques',
  spa: 'Spa',
  hebergement: 'Hébergement',
  etages: 'Étages',
  demandes: 'Demandes',
  repas: 'Repas hôtel',
  activites: 'Activités',
  passations: 'Passations',
  technique: 'Technique',
  factures: 'Factures',
};

// Qui ouvre le module ouvre ses réglages, pas les autres : droit de la page et
// module activé pour l'établissement courant.
export const ouvreLeModule = (page) => (ctx) => (
  peutOuvrirPage(page, ctx.user, ctx.permissions) && isPageActiveForEtab(ctx.etablissement, page)
);

const administre = (ctx) => peutAdministrerCompte(ctx.user, ctx.permissions);
const toutLeMonde = () => true;

export const SECTIONS = [
  // ── Moi ──
  {
    id: 'mon_compte', libelle: 'Mon compte', detail: 'Nom, téléphone, mot de passe, double authentification, code de pointage',
    motsCles: 'profil sécurité code pointage borne badgeuse déconnexion', groupe: 'moi', portee: 'personne', garde: toutLeMonde,
    charger: () => import('./sections/SectionMonCompte.jsx'),
  },

  // ── Cet appareil ──
  {
    id: 'apparence', libelle: 'Apparence', detail: 'Thème, taille du texte, densité, couleur des actions, animations, contraste',
    motsCles: 'mode sombre clair police écriture couleur accessibilité', groupe: 'appareil', portee: 'appareil', garde: toutLeMonde,
    charger: () => import('./sections/SectionApparence.jsx'),
  },
  {
    id: 'langue', libelle: 'Langue', detail: "Original, English, Español ou Deutsch, pour l'affichage",
    motsCles: 'traduction anglais espagnol', groupe: 'appareil', portee: 'appareil', garde: toutLeMonde,
    charger: () => import('./sections/SectionLangue.jsx'),
  },
  {
    id: 'demarrage', libelle: 'Démarrage', detail: "La page qui s'ouvre au lancement de l'app",
    motsCles: 'accueil page de départ ouverture', groupe: 'appareil', portee: 'appareil', garde: toutLeMonde,
    charger: () => import('./sections/SectionDemarrage.jsx'),
  },
  {
    id: 'menu_gestes', libelle: 'Menu et gestes', detail: 'Présentation, menu déplié, geste de retour par le bord',
    motsCles: 'barre latérale tablette téléphone ordinateur glisser', groupe: 'appareil', portee: 'appareil', garde: toutLeMonde,
    charger: () => import('./sections/SectionMenuGestes.jsx'),
  },
  // Ouverte à qui voit Réservations, ouvre la Caisse ou les Messages (plan 15,
  // lot 2 : l'avis d'un nouveau message) : un appareil abonné
  // reçoit les réservations en ligne (seulement si la personne voit
  // Réservations), les plats prêts de la caisse (seulement ceux qu'elle a
  // envoyés) et les alertes qui la visent. Aucun droit ne change.
  {
    id: 'notifications', libelle: 'Notifications', detail: 'Être prévenu des réservations en ligne, des plats prêts et des messages',
    motsCles: 'alerte vibration push message', groupe: 'appareil', portee: 'appareil',
    garde: (ctx) => ouvreLeModule('previsions')(ctx) || ouvreLeModule('caisse')(ctx) || ouvreLeModule('messages')(ctx),
    charger: () => import('../previsions/SectionNotificationsAppareil.jsx'),
  },

  // ── La maison ──
  {
    id: 'parametres', libelle: 'Paramètres', detail: 'Établissements, modules, noms des modules, caisse reliée',
    motsCles: 'établissement module activer lightspeed', groupe: 'maison', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionParametres.jsx'),
  },
  {
    id: 'roles', libelle: 'Rôles & accès', detail: 'Qui fait quoi : personnes, rôles, droits',
    motsCles: 'équipe personnes droits permissions', groupe: 'maison', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionRoles.jsx'),
  },
  // Réglages de la maison (18.11.2026, table reglages_maison) : direction,
  // comme la RLS de la table. Lus par l'évaluateur d'alertes, le planning, le
  // tableau de bord et Statistiques.
  {
    id: 'horaires_fermetures', libelle: 'Horaires et fermetures', detail: 'Jours de fermeture et vacances : ni alerte ni relevé attendu ces jours-là',
    motsCles: 'fermé fermeture vacances congés jour de repos ouverture', groupe: 'maison', portee: 'maison',
    garde: (ctx) => Boolean(ctx.etablissement?.id) && estDirectionMaison(ctx.user?.role),
    charger: () => import('./sections/SectionsMaison.jsx').then((m) => ({ default: m.SectionHorairesFermetures })),
    signaux: ['reglages_maison'],
  },
  {
    id: 'objectifs', libelle: 'Objectifs', detail: 'Coût matière, coût du personnel et chiffre visés, tracés dans Statistiques',
    motsCles: 'cible budget food cost ratio masse salariale chiffre affaires', groupe: 'maison', portee: 'maison',
    garde: (ctx) => Boolean(ctx.etablissement?.id) && estDirectionMaison(ctx.user?.role),
    charger: () => import('./sections/SectionsMaison.jsx').then((m) => ({ default: m.SectionObjectifs })),
    signaux: ['reglages_maison'],
  },
  {
    id: 'logo', libelle: "Logo de l'établissement", detail: "Dans la barre latérale, sur la page d'accueil et sur les factures",
    motsCles: 'image marque', groupe: 'maison', portee: 'maison',
    garde: (ctx) => peutChangerLogo(ctx.user?.role, ctx.shellMode),
    charger: () => import('./sections/SectionCoque.jsx').then((m) => ({ default: m.SectionLogo })),
  },
  {
    id: 'ordre_menu', libelle: 'Ordre du menu', detail: 'Les modules et leurs rubriques, pour tous les comptes',
    motsCles: 'organiser ranger', groupe: 'maison', portee: 'maison',
    garde: (ctx) => peutOrganiserMenu(ctx.user?.role, ctx.shellMode),
    charger: () => import('./sections/SectionCoque.jsx').then((m) => ({ default: m.SectionOrdreMenu })),
  },
  {
    id: 'alertes', libelle: 'Alertes', detail: "Les règles qui préviennent la direction et l'équipe",
    groupe: 'maison', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionAlertes.jsx'),
  },

  // ── Les modules ──
  {
    id: 'caisse', libelle: 'Caisse', detail: 'Catégories, produits, modes, paiement, terminal, TVA, clôture et commande par QR',
    motsCles: 'mode test tpe ticket qr commande boissons', groupe: 'modules', portee: 'maison', module: 'caisse',
    garde: (ctx) => ouvreLeModule('caisse')(ctx) && peutHabillerCaisse(ctx.user?.role),
    charger: () => import('../caisse/SectionReglagesCaisse.jsx'),
  },
  {
    id: 'planning_modeles', libelle: "Planning : modèles d'horaires", onglet: "Modèles d'horaires", detail: 'Les heures de Midi, Soir, Coupure, Longue',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutEcrirePlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionModeles })),
  },
  {
    id: 'planning_groupes', libelle: 'Planning : groupes', onglet: 'Groupes', detail: 'Salle, Cuisine, groupes ajoutés et comptes de pointage partagés',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutOuvrirGroupes(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionGroupes })),
  },
  {
    id: 'planning_contrats', libelle: 'Planning : contrats', onglet: 'Contrats', detail: 'Taux, heures par semaine et vacances de chacun',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutEcrirePlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionContrats })),
  },
  {
    id: 'planning_pointage', libelle: 'Planning : pointage', onglet: 'Pointage', detail: 'Arrivée en avance, arrondi, borne de pointage et codes personnels',
    motsCles: 'pointer arrondi avance heures comptées salaires borne badgeuse tablette code', groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && estDirectionPlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsReglesPlanning.jsx').then((m) => ({ default: m.SectionPointage })),
    signaux: ['reglages_maison'],
  },
  {
    id: 'reservation_en_ligne', libelle: 'Réservation en ligne', onglet: 'Réservation en ligne', detail: "Boîte d'envoi, SMS, horaires, capacité, lien à partager",
    groupe: 'modules', portee: 'maison', module: 'previsions',
    garde: (ctx) => ouvreLeModule('previsions')(ctx) && peutReglerEnLigne(ctx.user?.role),
    charger: () => import('../previsions/SectionReservationEnLigne.jsx'),
  },
  {
    id: 'plan_salle', libelle: 'Réservations : plan de salle', onglet: 'Plan de salle', detail: 'Salles, tables, décor et places de bar du plan de base',
    groupe: 'modules', portee: 'maison', module: 'previsions',
    garde: (ctx) => ouvreLeModule('previsions')(ctx) && peutGererReservations(ctx.user?.role),
    charger: () => import('../previsions/SectionPlanSalle.jsx'),
  },
  // Gestion de l'inventaire (14.11.2026) : la fenêtre « Gérer » de l'accueil du
  // module, avec sa garde (droit « Modifier » de l'Inventaire).
  {
    id: 'inventaire_gerer', libelle: 'Inventaire', detail: 'Périmètres, réouverture, produits maison, import Excel, suppression',
    groupe: 'modules', portee: 'maison', module: 'inventaire',
    garde: (ctx) => ouvreLeModule('inventaire')(ctx) && peutGererInventaire(ctx.user?.role, ctx.permissions),
    charger: () => import('../inventaire/SectionGererInventaire.jsx'),
  },
  // Hausses de prix fournisseur (18.11.2026) : le seuil d'alerte de
  // l'établissement, pour qui voit les hausses dans Factures & achats.
  {
    id: 'achats_hausses', libelle: 'Hausses de prix', onglet: 'Hausses de prix', detail: "Seuil d'alerte sur les prix des fournisseurs",
    motsCles: 'alerte augmentation fournisseur seuil facture', groupe: 'modules', portee: 'maison', module: 'achats',
    garde: (ctx) => ouvreLeModule('achats')(ctx) && peutReglerFactures(ctx.user?.role),
    charger: () => import('../factures-achats/SectionHaussesPrix.jsx'),
  },
  {
    id: 'achats_paiement', libelle: "Conditions de paiement", onglet: "Conditions de paiement", detail: "Délai de paiement de la maison et par fournisseur",
    motsCles: "échéance délai paiement fournisseur jours", groupe: 'modules', portee: 'maison', module: 'achats',
    garde: (ctx) => ouvreLeModule('achats')(ctx) && peutReglerFactures(ctx.user?.role),
    charger: () => import('../factures-achats/SectionConditionsPaiement.jsx'),
    signaux: ['achats_paiement','table:fournisseurs'],
  },
  {
    id: 'achats_categories', libelle: "Catégories de charges", onglet: "Catégories de charges", detail: "Les catégories proposées pour une charge fixe, et leur nom",
    motsCles: "charge fixe loyer énergie catégorie", groupe: 'modules', portee: 'maison', module: 'achats',
    garde: (ctx) => ouvreLeModule('achats')(ctx) && peutReglerFactures(ctx.user?.role),
    charger: () => import('../factures-achats/SectionCategoriesCharges.jsx'),
  },
  {
    id: 'comptabilite', libelle: 'Comptabilité', detail: 'Méthode de TVA, charges sociales, coût horaire moyen',
    groupe: 'modules', portee: 'maison', module: 'comptabilite',
    garde: (ctx) => ouvreLeModule('comptabilite')(ctx) && peutReglerFactures(ctx.user?.role),
    charger: () => import('../comptabilite/SectionReglagesCompta.jsx'),
  },
  {
    id: 'haccp', libelle: 'HACCP', detail: 'Frigos et appareils, heures de relevé, contrôles',
    motsCles: 'température relevé', groupe: 'modules', portee: 'maison', module: 'haccp',
    garde: (ctx) => ouvreLeModule('haccp')(ctx) && peutConfigurerHaccp(ctx.user?.role),
    charger: () => import('../haccp/SectionReglagesHaccp.jsx'),
  },
  // Plan 15, lot 2 (22.11.2026) : chaque module a sa section, même courte ;
  // dans le module, « Régler » (BoutonRegler) y mène en une touche. Les
  // réglages de reglages_modules s'écrivent par la direction de la maison
  // (consultant, patron, resp_cuisine), comme la RLS.
  {
    id: 'cartes', libelle: "Cartes & Recettes", detail: "Ordre des onglets, carte d'accueil, cartes cachées, archives",
    motsCles: "onglets ordre accueil par défaut cachée masquée archive", groupe: 'modules', portee: 'maison', module: 'cartes',
    garde: (ctx) => ouvreLeModule('cartes')(ctx) && peutGererCartes(ctx.user?.role),
    charger: () => import('../recettes/SectionReglagesCartes.jsx'),
  },
  {
    id: 'pertes', libelle: "Pertes", detail: "Motifs, qui valide, seuil d'alerte",
    motsCles: "motif valider alerte seuil gaspillage", groupe: 'modules', portee: 'maison', module: 'pertes',
    garde: (ctx) => ouvreLeModule('pertes')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../pertes/SectionReglagesPertes.jsx'),
    signaux: ['reglages_modules:pertes'],
  },
  {
    id: 'commande', libelle: "Commande", detail: "Jours de livraison, heure limite, stock cible par fournisseur",
    motsCles: "fournisseur livraison heure limite stock cible", groupe: 'modules', portee: 'maison', module: 'commande',
    garde: (ctx) => ouvreLeModule('commande')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../commande/SectionReglagesCommande.jsx'),
    signaux: ['table:fournisseurs','table:commande_cibles'],
  },
  {
    id: 'mep', libelle: "Mise en place", detail: "Postes et modèles de liste",
    motsCles: "poste modèle liste préparation", groupe: 'modules', portee: 'maison', module: 'mep',
    garde: (ctx) => ouvreLeModule('mep')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../mep/SectionReglagesMep.jsx'),
    signaux: ['reglages_modules:mep','table:mep_modeles'],
  },
  {
    id: 'groupes', libelle: "Groupes", detail: "Délai d'alerte, états de préparation, types de groupe",
    motsCles: "alerte délai statut type mariage séminaire", groupe: 'modules', portee: 'maison', module: 'groupes',
    garde: (ctx) => ouvreLeModule('groupes')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../groupes/SectionReglagesGroupes.jsx'),
    signaux: ['reglages_modules:groupes'],
  },
  {
    id: 'sop', libelle: "SOP", detail: "Fréquence, qui la fait, rappel de chaque procédure",
    motsCles: "procédure checklist rappel fréquence rôle", groupe: 'modules', portee: 'maison', module: 'sop',
    garde: (ctx) => ouvreLeModule('sop')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../sop/SectionReglagesSop.jsx'),
    signaux: ['table:sops'],
  },
  {
    id: 'fiches_salle', libelle: "Fiches salle", detail: "Qui valide, brouillons, ce que la salle voit",
    motsCles: "brouillon valider accords allergènes temps", groupe: 'modules', portee: 'maison', module: 'fiches_salle',
    garde: (ctx) => ouvreLeModule('fiches_salle')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../fiches-salle/SectionReglagesFichesSalle.jsx'),
    signaux: ['reglages_modules:fiches_salle'],
  },
  {
    id: 'catalogue', libelle: "Catalogue", detail: "Catégories et unités de la maison",
    motsCles: "catégorie unité produit bouteille carton", groupe: 'modules', portee: 'maison', module: 'catalogue',
    garde: (ctx) => ouvreLeModule('catalogue')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../catalogue/SectionReglagesCatalogue.jsx'),
    signaux: ['reglages_modules:catalogue'],
  },
  {
    id: 'ventes_pos', libelle: "Ventes POS", detail: "Connexion de la caisse Lightspeed, dernière synchro",
    motsCles: "lightspeed synchro synchronisation caisse connexion", groupe: 'modules', portee: 'maison', module: 'pos',
    garde: (ctx) => ouvreLeModule('pos')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../pos/SectionReglagesPos.jsx'),
  },
  {
    id: 'kds', libelle: "KDS", detail: "Son, bon en attente et en retard, postes",
    motsCles: "cuisine passe bon retard son poste", groupe: 'modules', portee: 'maison', module: 'kds',
    garde: (ctx) => ouvreLeModule('kds')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../kds/SectionReglagesKds.jsx'),
    signaux: ['reglages_modules:kds'],
  },
  {
    id: 'points', libelle: "Points", detail: "Allumer les points, barème, plafonds, participants",
    motsCles: "points boutique cadeaux barème", groupe: 'modules', portee: 'maison', module: 'points',
    garde: (ctx) => ouvreLeModule('points')(ctx) && peutGererPoints(ctx.user?.role, canManageModule(ctx.user?.role, 'points')),
    charger: () => import('../points/SectionReglagesPoints.jsx'),
  },
  {
    // Lot 5 : le journal se lit par le consultant et le patron (garde dure de
    // la page) ; eux seuls règlent sa vue et son export.
    id: 'journal', libelle: "Journal d'activité", detail: "Vue d'office et format de l'export",
    motsCles: "journal activité export csv excel regrouper", groupe: 'modules', portee: 'maison', module: 'journal',
    garde: ouvreLeModule('journal'),
    charger: () => import('../journal/SectionReglagesJournal.jsx'),
    signaux: ['reglages_modules:journal'],
  },
  {
    // Lot 5 : la vue d'office de la maison ; écrite par la direction de la
    // maison qui ouvre le module (RLS de reglages_modules).
    id: 'statistiques', libelle: 'Statistiques', detail: "Vue d'office de la maison",
    motsCles: "statistiques vue défaut analyse question", groupe: 'modules', portee: 'maison', module: 'statistiques',
    garde: (ctx) => ouvreLeModule('statistiques')(ctx) && estDirectionModules(ctx.user?.role),
    charger: () => import('../statistiques/SectionReglagesStatistiques.jsx'),
    signaux: ['reglages_modules:statistiques'],
  },
  {
    id: 'spa_en_ligne', libelle: 'Spa : réservation en ligne', onglet: 'Réservation en ligne', detail: 'Ouverture, horaires, délais, praticiens, lien à partager',
    groupe: 'modules', portee: 'maison', module: 'spa',
    garde: (ctx) => ouvreLeModule('spa')(ctx) && estDirectionSpa(ctx.user?.role),
    charger: () => import('../spa/SectionSpaEnLigne.jsx'),
    signaux: ['spa_parametres'],
  },
  {
    id: 'spa_emails', libelle: 'Spa : e-mails', onglet: 'E-mails', detail: "Boîte d'envoi, bons d'anniversaire, adresse de réponse, signature",
    groupe: 'modules', portee: 'maison', module: 'spa',
    garde: (ctx) => ouvreLeModule('spa')(ctx) && estDirectionSpa(ctx.user?.role),
    charger: () => import('../spa/SectionSpaEmails.jsx'),
    signaux: ['spa_parametres', 'spa_boite'],
  },
  {
    id: 'hebergement_tarifs', libelle: 'Hébergement : tarifs et taxes', onglet: 'Tarifs et taxes', detail: 'Tarifs par nuit, taxe de séjour, TVA, numéro HESTA',
    groupe: 'modules', portee: 'maison', module: 'hebergement',
    garde: (ctx) => ouvreLeModule('hebergement')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../hebergement/SectionTarifsHotel.jsx'),
    signaux: ['table:tarifs', 'table:hotel_reglages'],
  },
  {
    id: 'hebergement_chambres', libelle: 'Hébergement : chambres', onglet: 'Chambres', detail: 'Numéros, catégories, capacité, chambres en service',
    groupe: 'modules', portee: 'maison', module: 'hebergement',
    garde: (ctx) => ouvreLeModule('hebergement')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../hebergement/SectionChambresHotel.jsx'),
    signaux: ['table:chambres'],
  },
  // Plan 15, lot 6b (22.11.2026) : trois modules de l'hôtel réglés dans
  // reglages_modules (migration 20261122_lot6b_reglages_hotel). La base n'en
  // laisse écrire que la direction de l'hôtel (déclencheur) ; les sections ne
  // sont proposées qu'à elle, comme ses autres réglages.
  {
    id: 'etages', libelle: 'Étages', detail: 'Temps de ménage et linge par type de chambre',
    motsCles: 'ménage temps tournée linge draps serviettes catégorie chambre', groupe: 'modules', portee: 'maison', module: 'etages',
    garde: (ctx) => ouvreLeModule('etages')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../etages/SectionReglagesEtages.jsx'),
    signaux: ['reglages_modules:etages', 'table:chambres'],
  },
  {
    id: 'demandes', libelle: 'Demandes', detail: 'Demandes courantes, pôle, priorité et délai',
    motsCles: 'catégorie délai échéance priorité pôle demande courante', groupe: 'modules', portee: 'maison', module: 'demandes',
    garde: (ctx) => ouvreLeModule('demandes')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../demandes/SectionReglagesDemandes.jsx'),
    signaux: ['reglages_modules:demandes'],
  },
  {
    id: 'repas', libelle: 'Repas hôtel', detail: 'Horaires des repas, heures et carte du room service',
    motsCles: 'horaire petit-déjeuner déjeuner dîner room service carte menu livraison frais', groupe: 'modules', portee: 'maison', module: 'repas',
    garde: (ctx) => ouvreLeModule('repas')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../repas/SectionReglagesRepas.jsx'),
    signaux: ['reglages_modules:repas'],
  },
  {
    id: 'activites_forfaits', libelle: 'Activités : forfaits', detail: 'Les forfaits et ce que chacun donne',
    groupe: 'modules', portee: 'maison', module: 'activites',
    garde: (ctx) => ouvreLeModule('activites')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../activites/SectionForfaits.jsx'),
    signaux: ['table:forfaits', 'table:forfait_droits'],
  },
  {
    id: 'passations_taches', libelle: 'Passations : tâches récurrentes', detail: 'Les tâches qui reviennent, par pôle',
    groupe: 'modules', portee: 'maison', module: 'passations',
    garde: (ctx) => ouvreLeModule('passations')(ctx) && peutGererPassations(ctx.user?.role),
    charger: () => import('../passations/SectionTachesRecurrentes.jsx'),
    signaux: ['table:taches_recurrentes'],
  },
  {
    id: 'technique_equipements', libelle: 'Technique : équipements', onglet: 'Équipements', detail: 'Les équipements suivis par la technique',
    groupe: 'modules', portee: 'maison', module: 'technique',
    garde: (ctx) => ouvreLeModule('technique')(ctx) && peutGererTechnique(ctx.user?.role),
    charger: () => import('../technique/SectionEquipements.jsx'),
    signaux: ['table:equipements'],
  },
  {
    id: 'technique_plans', libelle: 'Technique : plans de préventif', onglet: 'Plans de préventif', detail: 'Les tâches qui reviennent : périodicité, équipement, dernière fois',
    groupe: 'modules', portee: 'maison', module: 'technique',
    garde: (ctx) => ouvreLeModule('technique')(ctx) && peutGererTechnique(ctx.user?.role),
    charger: () => import('../technique/SectionPlansPreventif.jsx'),
    signaux: ['table:maintenance_plans'],
  },
  // Facturation client : l'écran Factures est réservé au consultant, ses deux
  // sections aussi (même garde que la page 'factures').
  {
    id: 'factures_textes', libelle: 'Factures : textes du document', onglet: 'Textes du document', detail: 'Émetteur, bloc client, paiement, QR-facture et signature, client par client',
    groupe: 'modules', portee: 'personne', module: 'factures',
    garde: ouvreLeModule('factures'),
    charger: () => import('../factures/SectionsFactures.jsx').then((m) => ({ default: m.SectionFacturesTextes })),
  },
  {
    id: 'factures_email', libelle: "Factures : e-mail d'envoi", onglet: "E-mail d'envoi", detail: 'Notification du client, objet, copie et message type',
    groupe: 'modules', portee: 'personne', module: 'factures',
    garde: ouvreLeModule('factures'),
    charger: () => import('../factures/SectionsFactures.jsx').then((m) => ({ default: m.SectionFacturesEmail })),
  },
];

// Renvois : les petits réglages rendus à leur module (règle de tri en tête).
// Ils ne sont pas des sections : rien à charger, aucune place dans la liste
// des espaces. La recherche les rend avec leur endroit (`ou`, une phrase
// entière, traduite d'un bloc) et « Y aller » ouvre la page du module. Même
// garde que la section d'avant : la recherche ne montre à personne un
// réglage qu'il ne peut pas toucher.
export const RENVOIS = [
  // 22.11.2026 : la carte d'accueil des recettes est redevenue une section
  // (Cartes & Recettes, plan 15, lot 2). Les menus types des groupes sont du
  // contenu : ils restent dans le module, la recherche y mène.
  {
    id: 'renvoi_groupes_menus', libelle: 'Menus types des groupes', page: 'groupes',
    ou: "Dans Groupes, l'onglet « Menus »",
    motsCles: 'menu groupe mariage banquet composer',
    garde: (ctx) => ouvreLeModule('groupes')(ctx) && estDirectionModules(ctx.user?.role),
  },
  {
    id: 'renvoi_planning_masques', libelle: 'Personnes masquées du planning', page: 'planning',
    ou: 'Dans le Planning, le menu « Gérer »',
    motsCles: 'masquer cacher retirer équipier affichage',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && estDirectionPlanning(ctx.user?.role),
  },
  {
    id: 'renvoi_caisse_mode_test', libelle: 'Passer un poste en mode test', page: 'caisse',
    ou: 'Dans la Caisse, le menu « Plus »',
    motsCles: 'essai formation test poste caisse',
    garde: (ctx) => ouvreLeModule('caisse')(ctx) && ROLES_MODE_TEST.includes(ctx.user?.role),
  },
];

export function renvoisVisibles(ctx) {
  return RENVOIS.filter((renvoi) => {
    try { return renvoi.garde(ctx) === true; } catch { return false; }
  });
}

export function chercherRenvois(renvois, requete) {
  const correspond = makeSearchMatcher(requete);
  if (!correspond.active) return [];
  return renvois.filter((r) => correspond(r.libelle, r.ou, r.motsCles));
}

// Signaux de changement d'une section (services/reglagesSignal.js).
export function signauxDe(id) {
  const section = SECTIONS.find((s) => s.id === id);
  if (!section) return [];
  return section.signaux || [section.id];
}

export function sectionsVisibles(ctx) {
  return SECTIONS.filter((section) => {
    try { return section.garde(ctx) === true; } catch { return false; }
  });
}

// Sections rangées par groupe, dans l'ordre du registre ; un groupe vide
// n'apparaît pas.
export function sectionsParGroupe(sections) {
  return GROUPES
    .map((groupe) => ({ ...groupe, sections: sections.filter((s) => s.groupe === groupe.id) }))
    .filter((groupe) => groupe.sections.length > 0);
}

// L'entrée de la liste qui porte une section : son module dans l'espace
// « Les modules », elle-même ailleurs.
export const idEntree = (section) => (section.groupe === 'modules' && section.module ? `module:${section.module}` : section.id);

// Les entrées de la liste, par espace. Une entrée de module porte ses sections
// visibles dans l'ordre du registre ; son détail les nomme (pilules), ou
// reprend celui de sa section unique.
export function entreesParGroupe(sections) {
  return sectionsParGroupe(sections).map((groupe) => {
    const entrees = [];
    groupe.sections.forEach((section) => {
      const id = idEntree(section);
      let entree = entrees.find((e) => e.id === id);
      if (!entree) {
        entree = {
          id,
          groupe: groupe.id,
          module: id.startsWith('module:') ? section.module : null,
          libelle: id.startsWith('module:') ? (MODULES[section.module] || section.libelle) : section.libelle,
          sections: [],
        };
        entrees.push(entree);
      }
      entree.sections.push(section);
    });
    // Détail d'une entrée de module : la liste de ses pilules, en morceaux
    // (chacun traduit par le glossaire, jamais une phrase assemblée).
    entrees.forEach((e) => {
      e.detail = e.sections.length > 1
        ? e.sections.map((s) => s.onglet || s.libelle)
        : e.sections[0].detail;
    });
    return { ...groupe, entrees };
  });
}

// Recherche dans les réglages : libellé, onglet, détail, mots-clés, nom du
// module et de l'espace. Rend les sections trouvées, dans l'ordre du registre.
export function chercherSections(sections, requete) {
  const correspond = makeSearchMatcher(requete);
  if (!correspond.active) return [];
  return sections.filter((s) => correspond(
    s.libelle, s.onglet, s.detail, s.motsCles,
    s.module ? MODULES[s.module] : '',
    GROUPES.find((g) => g.id === s.groupe)?.label,
  ));
}

// Le chemin d'une section, pour le fil au-dessus du titre et les résultats de
// recherche : l'espace, puis le module s'il y en a un.
export function cheminDe(section) {
  const groupe = GROUPES.find((g) => g.id === section.groupe)?.label || '';
  const module = section.groupe === 'modules' && section.module ? MODULES[section.module] : null;
  return module ? [groupe, module] : [groupe];
}
