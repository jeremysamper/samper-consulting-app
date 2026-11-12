import { isPageActiveForEtab, peutAdministrerCompte, peutOuvrirPage } from '../moduleConfig.js';
import { peutHabillerCaisse } from '../caisse/gardesCaisse.js';
import { peutReglerEnLigne } from '../previsions/gardeEnLigne.js';
import { peutReglerFactures } from '../comptabilite/gardesCompta.js';
import { peutConfigurerHaccp } from '../haccp/gardesHaccp.js';

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
//
// Ajouter un réglage : exporter sa garde d'un fichier léger du module (pas
// d'import d'écran : ce registre est dans le bundle de départ), écrire sa
// section dans le dossier du module, l'inscrire ici, et faire de l'entrée du
// module un raccourci (ouvrirCompte). Les gardes de base ne changent pas.
// ─────────────────────────────────────────────────────────────────────────────

export const GROUPES = [
  { id: 'maison', label: 'La maison' },
  { id: 'modules', label: 'Les modules' },
  { id: 'equipe', label: "L'équipe et les accès" },
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

  // ── L'équipe et les accès ──
  {
    id: 'roles', libelle: 'Rôles & accès', detail: 'Qui fait quoi : personnes, rôles, droits',
    groupe: 'equipe', portee: 'maison', garde: administre,
    charger: () => import('./sections/SectionRoles.jsx'),
  },

  // ── Mes préférences ──
  {
    id: 'apparence', libelle: 'Apparence et langue', detail: 'Mode clair ou sombre, langue d\'affichage',
    groupe: 'preferences', portee: 'appareil', garde: () => true,
    charger: () => import('./sections/SectionApparence.jsx'),
  },
];

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
