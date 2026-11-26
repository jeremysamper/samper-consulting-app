// Qui habille la caisse : boutons, réglages, remises, contrôle, clôture, et
// la tuile « Rapports ». Rangé à part de Caisse.jsx pour que le module
// Statistiques lise la même garde sans charger tout l'écran de la caisse.
export const ROLES_HABILLAGE = ['consultant', 'patron', 'resp_cuisine'];
export const peutHabillerCaisse = (role) => ROLES_HABILLAGE.includes(role);

// Qui met un produit en rupture et le remet en vente (lot L2) : l'habillage,
// plus le serveur (décision de Jérémy du 22.11.2026). Même liste que la RPC
// caisse_poser_rupture, qui refuse les autres.
export const ROLES_RUPTURE = [...ROLES_HABILLAGE, 'serveur'];
export const peutMettreEnRupture = (role) => ROLES_RUPTURE.includes(role);

// Qui règle le partage des pourboires (lot 11 du panel) : la direction. Le
// responsable de cuisine écrit les autres clés de caisse_reglages ; depuis le
// lot 19, la base lui refuse la clé « pourboires » (déclencheur
// trg_caisse_reglages_garde_pourboires, même liste de rôles).
export const ROLES_POURBOIRES = ['consultant', 'patron'];
export const peutReglerPourboires = (role) => ROLES_POURBOIRES.includes(role);

// Lot 19 : refus levé par la garde de la base (42501), rejoué par la démo et
// dit en clair par caisseService.js (MESSAGES_RPC).
export const REFUS_POURBOIRES = 'caisse: seuls le consultant et le patron changent la regle des pourboires';

// Une valeur JSON écrite comme jsonb la compare : l'ordre des clés d'un objet
// ne compte pas, celui d'une liste compte.
function jsonCanonique(valeur) {
  if (Array.isArray(valeur)) return '[' + valeur.map(jsonCanonique).join(',') + ']';
  if (valeur && typeof valeur === 'object') {
    return '{' + Object.keys(valeur).sort().map((k) => JSON.stringify(k) + ':' + jsonCanonique(valeur[k])).join(',') + '}';
  }
  return JSON.stringify(valeur ?? null);
}

// La règle d'une ligne de caisse_reglages, comme la garde la lit
// (nullif(config->'pourboires', 'null')) : undefined quand la clé manque ou
// vaut null, aucune règle dans les deux cas.
function reglePourboires(ligne) {
  const valeur = ligne?.config?.pourboires;
  return valeur == null ? undefined : jsonCanonique(valeur);
}

// Même décision que caisse_reglages_garde_pourboires (lot 19), pour la démo.
//   type : 'INSERT', 'UPDATE' ou 'DELETE' ;
//   nouvelle, ancienne : lignes { etablissement_id, config }, null si absente.
//     En INSERT, ancienne est la ligne déjà en base pour l'établissement
//     (premier passage d'un upsert), comme la garde la relit ;
//   estDirection(etab) : vrai pour un consultant ou un patron actif rattaché.
// Vrai quand la règle des pourboires change et que l'appelant n'est pas de la
// direction : l'écriture est refusée.
export function changementPourboiresRefuse({ type, nouvelle = null, ancienne = null, estDirection }) {
  const refuse = (etab) => estDirection(etab) !== true;
  if (type === 'DELETE') return reglePourboires(ancienne) !== undefined && refuse(ancienne.etablissement_id);
  let avant = reglePourboires(ancienne);
  if (type === 'UPDATE' && ancienne && ancienne.etablissement_id !== nouvelle?.etablissement_id) {
    // Déplacer la ligne retire la règle de l'ancien établissement.
    if (avant !== undefined && refuse(ancienne.etablissement_id)) return true;
    avant = undefined;
  }
  return reglePourboires(nouvelle) !== avant && refuse(nouvelle?.etablissement_id);
}
