import { readLegacyGlobal } from '../legacy/legacyApi.js';
import { defaultPermissions, getDefaultManageRoles, rolesEcritureBase, roles } from '../modules/moduleConfig.js';

const emptyDemoData = {
  permissions: defaultPermissions,
  roles,
  etablissements: [],
  utilisateurs: [],
  planning: [],
  pertes: [],
  inventaires: [],
  recettes: [],
  cartes: []
};

export function getDemoData() {
  return readLegacyGlobal('DEMO_DATA') || emptyDemoData;
}

// Droits d'un rôle : ceux enregistrés en base, complétés par les défauts du
// code pour les modules que la ligne du rôle ne mentionne pas (module ajouté
// après son dernier enregistrement). Sans ce complément, une clé absente
// valait « visible » dans le menu mais « défaut » dans Rôles & accès : le KDS
// apparaissait au patron, puis refusait de s'ouvrir.
export function getRolePermissions(role) {
  return { ...(defaultPermissions[role] || {}), ...(getDemoData()?.permissions?.[role] || {}) };
}

// Droits de la personne connectée. Les appelants passent tous le rôle de la
// personne connectée : ses écarts personnels (table permissions_utilisateurs,
// chargés à la connexion) s'ajoutent à ceux de son rôle.
export function getPermissionsForRole(role) {
  const base  = getRolePermissions(role);
  const perso = getDemoData()?.permissionsPerso;
  if (perso && perso.role === role && perso.perms) return { ...base, ...perso.perms };
  return base;
}

// Droit « gérer » (modifier + supprimer) d'un module pour un rôle.
// Lit la clé `manage:<moduleId>` dans les permissions du rôle ; à défaut
// de droit explicite, les rôles par défaut du module s'appliquent
// (cf. manageableModules / defaultManageRoles dans moduleConfig).
// Un module dont la base réserve l'écriture à certains rôles (voir
// rolesEcritureBase) n'est jamais « gérable » hors de ces rôles : afficher des
// boutons que la RLS refuserait ferait croire à une panne.
export function canManageModule(role, moduleId) {
  const ecriture = rolesEcritureBase[moduleId];
  if (ecriture && !ecriture.includes(role)) return false;
  const perms = getPermissionsForRole(role);
  const key = 'manage:' + moduleId;
  if (perms && Object.prototype.hasOwnProperty.call(perms, key)) return !!perms[key];
  return getDefaultManageRoles(moduleId).includes(role);
}

export function getRoleInfo(role) {
  return getDemoData()?.roles?.[role] || {
    label: role || 'Utilisateur',
    couleur: '#003042'
  };
}

export function getLegacyEtablissements() {
  return getDemoData()?.etablissements || [];
}
