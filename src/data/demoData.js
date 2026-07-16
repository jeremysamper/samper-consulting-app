import { readLegacyGlobal } from '../legacy/legacyApi.js';
import { defaultPermissions, getDefaultManageRoles, roles } from '../modules/moduleConfig.js';

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

export function getPermissionsForRole(role) {
  return getDemoData()?.permissions?.[role] || {};
}

// Droit « gérer » (modifier + supprimer) d'un module pour un rôle.
// Lit la clé `manage:<moduleId>` dans les permissions du rôle ; à défaut
// de droit explicite, les rôles par défaut du module s'appliquent
// (cf. manageableModules / defaultManageRoles dans moduleConfig).
export function canManageModule(role, moduleId) {
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
