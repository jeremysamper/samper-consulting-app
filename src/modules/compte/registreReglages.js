import { isPageActiveForEtab, peutAdministrerCompte, peutOuvrirPage } from '../moduleConfig.js';
import { peutChangerLogo, peutOrganiserMenu } from '../../components/nav/gardesCoque.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
import { peutReglerEnLigne } from '../previsions/gardeEnLigne.js';
import { peutReglerFactures } from '../comptabilite/gardesCompta.js';
import { peutConfigurerHaccp } from '../haccp/gardesHaccp.js';
import { estDirectionSpa } from '../spa/gardesSpa.js';
import { estDirectionHotel } from '../hebergement/gardesHotel.js';
import { peutGererPassations } from '../passations/gardesPassations.js';
import { peutGererTechnique } from '../technique/gardesTechnique.js';
import { estDirectionPlanning, peutEcrirePlanning, peutOuvrirGroupes } from '../planning/gardesPlanning.js';

// ─────────────────────────────────────────────────────────────────────────────
// Registre des réglages : tout ce qui se règle dans l'app, une section par
// réglage, dans la page 'compte' (Compte.jsx).
//
//   id       : identifiant de la section. C'est aussi la valeur passée à
//              ouvrirCompte('<id>') par le raccourci du module, et celle du
//              signal de changement (services/reglagesSignal.js).
//   libelle  : nom dans la liste ; detail : ce qu'on y règle, en une ligne.
//   groupe   : 'maison' | 'modules' | 'equipe' | 'preferences'.
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
// section dans le dossier du module, l'inscrire ici, et faire de l'entrée du
// module un raccourci (ouvrirCompte). Les gardes de base ne changent pas.
// ─────────────────────────────────────────────────────────────────────────────

// Ordre d'affichage : l'équipe avant les modules. Mesuré au banc le
// 12.11.2026 : la liste des modules est longue, et « Rôles & accès » rangé
// après elle passait sous le pli à 1440 x 900 (un défilement de plus pour le
// réglage le plus ouvert du consultant).
export const GROUPES = [
  { id: 'maison', label: 'La maison' },
  { id: 'equipe', label: "L'équipe et les accès" },
  { id: 'modules', label: 'Les modules' },
  { id: 'preferences', label: 'Mes préférences' },
];

// Qui ouvre le module ouvre ses réglages, pas les autres : droit de la page et
// module activé pour l'établissement courant.
export const ouvreLeModule = (page) => (ctx) => (
  peutOuvrirPage(page, ctx.user, ctx.permissions) && isPageActiveForEtab(ctx.etablissement, page)
);

const administre = (ctx) => peutAdministrerCompte(ctx.user, ctx.permissions);

export const SECTIONS = [
  // ── La maison ──
  {
    id: 'parametres', libelle: 'Paramètres', detail: 'Établissements, modules, noms des modules, caisse reliée',
    groupe: 'maison', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionParametres.jsx'),
  },
  {
    id: 'logo', libelle: "Logo de l'établissement", detail: 'Dans la barre latérale, sur la page d\'accueil et sur les factures',
    groupe: 'maison', portee: 'maison',
    garde: (ctx) => peutChangerLogo(ctx.user?.role, ctx.shellMode),
    charger: () => import('./sections/SectionCoque.jsx').then((m) => ({ default: m.SectionLogo })),
  },
  {
    id: 'ordre_menu', libelle: 'Ordre du menu', detail: 'Les modules et leurs rubriques, pour tous les comptes',
    groupe: 'maison', portee: 'maison',
    garde: (ctx) => peutOrganiserMenu(ctx.user?.role, ctx.shellMode),
    charger: () => import('./sections/SectionCoque.jsx').then((m) => ({ default: m.SectionOrdreMenu })),
  },
  {
    id: 'alertes', libelle: 'Alertes', detail: 'Les règles qui préviennent la direction et l\'équipe',
    groupe: 'maison', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionAlertes.jsx'),
  },

  // ── Les modules ──
  {
    id: 'caisse', libelle: 'Caisse', detail: 'Catégories, produits, modes, paiement, terminal, TVA et clôture',
    groupe: 'modules', portee: 'maison', module: 'caisse',
    garde: (ctx) => ouvreLeModule('caisse')(ctx) && peutHabillerCaisse(ctx.user?.role),
    charger: () => import('../caisse/SectionReglagesCaisse.jsx'),
  },
  {
    id: 'planning_modeles', libelle: "Planning : modèles d'horaires", detail: 'Les heures de Midi, Soir, Coupure, Longue',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutEcrirePlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionModeles })),
  },
  {
    id: 'planning_groupes', libelle: 'Planning : groupes', detail: 'Salle, Cuisine, groupes ajoutés et comptes de pointage partagés',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutOuvrirGroupes(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionGroupes })),
  },
  {
    id: 'planning_masques', libelle: 'Planning : personnes masquées', detail: "Retirer quelqu'un de l'affichage du planning",
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && estDirectionPlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionMasques })),
  },
  {
    id: 'planning_contrats', libelle: 'Planning : contrats', detail: 'Taux, heures par semaine et vacances de chacun',
    groupe: 'modules', portee: 'maison', module: 'planning',
    garde: (ctx) => ouvreLeModule('planning')(ctx) && peutEcrirePlanning(ctx.user?.role),
    charger: () => import('../planning/SectionsPlanning.jsx').then((m) => ({ default: m.SectionContrats })),
  },
  {
    id: 'reservation_en_ligne', libelle: 'Réservation en ligne', detail: "Boîte d'envoi, SMS, horaires, capacité, lien à partager",
    groupe: 'modules', portee: 'maison', module: 'previsions',
    garde: (ctx) => ouvreLeModule('previsions')(ctx) && peutReglerEnLigne(ctx.user?.role),
    charger: () => import('../previsions/SectionReservationEnLigne.jsx'),
  },
  {
    id: 'comptabilite', libelle: 'Comptabilité', detail: 'Méthode de TVA, charges sociales, coût horaire moyen',
    groupe: 'modules', portee: 'maison', module: 'comptabilite',
    garde: (ctx) => ouvreLeModule('comptabilite')(ctx) && peutReglerFactures(ctx.user?.role),
    charger: () => import('../comptabilite/SectionReglagesCompta.jsx'),
  },
  {
    id: 'haccp', libelle: 'HACCP', detail: 'Frigos et appareils, heures de relevé, contrôles',
    groupe: 'modules', portee: 'maison', module: 'haccp',
    garde: (ctx) => ouvreLeModule('haccp')(ctx) && peutConfigurerHaccp(ctx.user?.role),
    charger: () => import('../haccp/SectionReglagesHaccp.jsx'),
  },
  {
    id: 'spa_en_ligne', libelle: 'Spa : réservation en ligne', detail: 'Ouverture, horaires, délais, praticiens, lien à partager',
    groupe: 'modules', portee: 'maison', module: 'spa',
    garde: (ctx) => ouvreLeModule('spa')(ctx) && estDirectionSpa(ctx.user?.role),
    charger: () => import('../spa/SectionSpaEnLigne.jsx'),
  },
  {
    id: 'hebergement_tarifs', libelle: 'Hébergement : tarifs et taxes', detail: 'Tarifs par nuit, taxe de séjour, TVA, numéro HESTA',
    groupe: 'modules', portee: 'maison', module: 'hebergement',
    garde: (ctx) => ouvreLeModule('hebergement')(ctx) && estDirectionHotel(ctx.user?.role),
    charger: () => import('../hebergement/SectionTarifsHotel.jsx'),
    signaux: ['table:tarifs', 'table:hotel_reglages'],
  },
  {
    id: 'hebergement_chambres', libelle: 'Hébergement : chambres', detail: 'Numéros, catégories, capacité, chambres en service',
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
    id: 'technique_equipements', libelle: 'Technique : équipements', detail: 'Les équipements suivis par la technique',
    groupe: 'modules', portee: 'maison', module: 'technique',
    garde: (ctx) => ouvreLeModule('technique')(ctx) && peutGererTechnique(ctx.user?.role),
    charger: () => import('../technique/SectionEquipements.jsx'),
    signaux: ['table:equipements'],
  },

  // ── L'équipe et les accès ──
  {
    id: 'roles', libelle: 'Rôles & accès', detail: 'Qui fait quoi : personnes, rôles, droits',
    groupe: 'equipe', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionRoles.jsx'),
  },

  // ── Mes préférences ──
  {
    id: 'mon_compte', libelle: 'Mon compte', detail: 'Nom, téléphone, mot de passe, déconnexion',
    groupe: 'preferences', portee: 'personne', garde: () => true,
    charger: () => import('./sections/SectionMonCompte.jsx'),
  },
  {
    id: 'apparence', libelle: 'Apparence et langue', detail: 'Mode clair ou sombre, langue d\'affichage',
    groupe: 'preferences', portee: 'appareil', garde: () => true,
    charger: () => import('./sections/SectionApparence.jsx'),
  },
  {
    id: 'notifications', libelle: 'Notifications sur cet appareil', detail: 'Être prévenu des nouvelles réservations en ligne',
    groupe: 'preferences', portee: 'appareil', module: 'previsions',
    garde: ouvreLeModule('previsions'),
    charger: () => import('../previsions/SectionNotificationsAppareil.jsx'),
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
