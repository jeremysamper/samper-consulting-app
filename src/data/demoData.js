import { readLegacyGlobal } from '../legacy/legacyApi.js';
import { defaultPermissions, roles } from '../modules/moduleConfig.js';

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

export function getRoleInfo(role) {
  return getDemoData()?.roles?.[role] || {
    label: role || 'Utilisateur',
    couleur: '#92702A'
  };
}

export function getLegacyEtablissements() {
  return getDemoData()?.etablissements || [];
}
