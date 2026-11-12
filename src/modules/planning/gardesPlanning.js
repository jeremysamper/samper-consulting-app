import { canManageModule, getPermissionsForRole } from '../../data/demoData.js';

// ─────────────────────────────────────────────────────────────────────────────
// Gardes et équipe du Planning, rangées à part de Planning.jsx pour que la
// page des réglages (modèles d'horaires, groupes, personnes masquées,
// contrats) lise les mêmes règles sans charger tout le module.
// ─────────────────────────────────────────────────────────────────────────────

// Qui écrit le planning : le module dans ses droits et le droit « Modifier »
// (même règle que user_peut_gerer('planning') en base). Modèles d'horaires,
// groupes et contrats en dépendent.
export function peutEcrirePlanning(role) {
  const perms = getPermissionsForRole(role);
  return !!perms.planning && canManageModule(role, 'planning');
}

// La direction : comptes de pointage partagés, personnes masquées, exports
// (RLS de pointage_postes et de planning_masques : consultant et patron).
export const ROLES_DIRECTION_PLANNING = ['consultant', 'patron'];
export const estDirectionPlanning = (role) => ROLES_DIRECTION_PLANNING.includes(role);

// Qui ouvre les groupes : qui écrit le planning (les groupes), ou la direction
// (les comptes de pointage partagés).
export const peutOuvrirGroupes = (role) => peutEcrirePlanning(role) || estDirectionPlanning(role);

// Équipe d'un établissement. equipeEtab : les comptes actifs, hors consultant
// et patron (qui ne sont pas planifiés). equipe : les personnes, sans les
// comptes de pointage partagés (l'iPad du restaurant n'est pas une personne).
export function equipeDuPlanning(utilisateurs, etabId, postesParCompte) {
  const equipeEtab = (utilisateurs || []).filter((u) => (
    u.etablissementIds?.includes(etabId)
    && !['consultant', 'patron'].includes(u.role)
    && u.actif !== false
  ));
  const equipe = equipeEtab.filter((u) => !postesParCompte?.has(u.id));
  return { equipeEtab, equipe };
}

// Durée contractuelle hebdomadaire (CCNT) : celle de l'établissement, sinon
// 42 h standard, 43,5 h saisonnier, 45 h petit établissement.
export function heuresContractuelles(etablissement) {
  if (etablissement?.ccntHeuresSemaine) return etablissement.ccntHeuresSemaine;
  if (etablissement?.type === 'saisonnier') return 43.5;
  if (etablissement?.type === 'petit') return 45;
  return 42;
}
