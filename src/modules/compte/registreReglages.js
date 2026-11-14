import { isPageActiveForEtab, peutAdministrerCompte, peutOuvrirPage } from '../moduleConfig.js';
import { peutChangerLogo, peutOrganiserMenu } from '../../components/nav/gardesCoque.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
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
// onglet. Aucun raccourci dans le module : un réglage n'a qu'un endroit.
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
  planning: 'Planning',
  previsions: 'Réservations',
  inventaire: 'Inventaire',
  comptabilite: 'Comptabilité',
  haccp: 'HACCP',
  cartes: 'Cartes & Recettes',
  spa: 'Spa',
  hebergement: 'Hébergement',
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
    id: 'mon_compte', libelle: 'Mon compte', detail: 'Nom, téléphone, mot de passe, double authentification, déconnexion',
    motsCles: 'profil sécurité code', groupe: 'moi', portee: 'personne', garde: toutLeMonde,
    charger: () => import('./sections/SectionMonCompte.jsx'),
  },

  // ── Cet appareil ──
  {
    id: 'apparence', libelle: 'Apparence', detail: 'Thème, taille du texte, densité, couleur des actions, animations, contraste',
    motsCles: 'mode sombre clair police écriture couleur accessibilité', groupe: 'appareil', portee: 'appareil', garde: toutLeMonde,
    charger: () => import('./sections/SectionApparence.jsx'),
  },
  {
    id: 'langue', libelle: 'Langue', detail: "Original, English ou Español, pour l'affichage",
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
  // Ouverte à qui voit Réservations ou ouvre la Caisse : un appareil abonné
  // reçoit les réservations en ligne (seulement si la personne voit
  // Réservations), les plats prêts de la caisse (seulement ceux qu'elle a
  // envoyés) et les alertes qui la visent. Aucun droit ne change.
  {
    id: 'notifications', libelle: 'Notifications', detail: 'Être prévenu des réservations en ligne et des plats prêts',
    motsCles: 'alerte vibration push', groupe: 'appareil', portee: 'appareil',
    garde: (ctx) => ouvreLeModule('previsions')(ctx) || ouvreLeModule('caisse')(ctx),
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
    id: 'caisse', libelle: 'Caisse', detail: 'Catégories, produits, modes, paiement, terminal, TVA et clôture',
    motsCles: 'mode test tpe ticket', groupe: 'modules', portee: 'maison', module: 'caisse',
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
    id: 'planning_masques', libelle: 'Planning : personnes masquées', onglet: 'Personnes masquées', detail: "Retirer quelqu'un de l'affichage du planning",
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && estDirectionPlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionMasques })),
  },
  {
    id: 'planning_contrats', libelle: 'Planning : contrats', onglet: 'Contrats', detail: 'Taux, heures par semaine et vacances de chacun',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutEcrirePlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionContrats })),
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
  {
    id: 'carte_accueil', libelle: "Carte d'accueil des recettes", detail: "La carte qui s'ouvre à votre arrivée dans Cartes & Recettes",
    groupe: 'modules', portee: 'personne', module: 'cartes',
    garde: (ctx) => ouvreLeModule('cartes')(ctx) && peutGererCartes(ctx.user?.role),
    charger: () => import('../recettes/SectionCarteAccueil.jsx'),
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
