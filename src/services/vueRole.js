// « Voir en tant que » du consultant : la règle du rôle effectif.
//
// Le consultant peut regarder l'app comme la voit un autre rôle (menu,
// écrans, boutons, droits d'action, coque). Le rôle choisi remplace le rôle
// du profil dans l'interface seulement : l'auth, le jeton, la RLS et les
// fonctions Edge restent ceux du consultant, aucune requête n'envoie le rôle
// affiché, et une action faite dans une autre vue est faite à son nom.
//
// Le choix tient le temps de l'onglet (sessionStorage), pour la personne qui
// l'a fait (userId), et s'efface à la déconnexion. Il n'est jamais écrit en
// base, ni dans le profil, ni dans user_settings. Il ne s'applique qu'à un
// profil dont le rôle réel, relu sur le serveur, est consultant : un stockage
// modifié à la main ne l'ouvre à personne d'autre.
import { roles } from '../modules/moduleConfig.js';

export const CLE_VUE_ROLE = 'sc_vue_role';
export const ROLE_CONSULTANT = 'consultant';

// Tous les rôles de l'app, le consultant (sa propre vue) en tête.
export const ROLES_VUE = [ROLE_CONSULTANT, ...Object.keys(roles).filter((r) => r !== ROLE_CONSULTANT)];

export const libelleRole = (role) => roles[role]?.label || role || '';

function stockageOnglet() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

// Le choix gardé : { userId, role }, ou null (absent, illisible, rôle inconnu).
export function lireChoix(stockage = stockageOnglet()) {
  try {
    const v = JSON.parse(stockage?.getItem(CLE_VUE_ROLE) || 'null');
    if (!v || typeof v.userId !== 'string' || !ROLES_VUE.includes(v.role)) return null;
    return { userId: v.userId, role: v.role };
  } catch {
    return null;
  }
}

export function effacerChoix(stockage = stockageOnglet()) {
  try { stockage?.removeItem(CLE_VUE_ROLE); } catch { /* stockage refusé : rien à effacer */ }
}

// Revenir à sa vue efface le choix ; un rôle inconnu ne s'écrit pas.
export function ecrireChoix(userId, role, stockage = stockageOnglet()) {
  if (!userId || !ROLES_VUE.includes(role) || role === ROLE_CONSULTANT) {
    effacerChoix(stockage);
    return null;
  }
  try { stockage?.setItem(CLE_VUE_ROLE, JSON.stringify({ userId, role })); } catch { return null; }
  return { userId, role };
}

// Peut changer de vue : le profil est consultant, et ce rôle a été relu sur le
// serveur (confirme), pas seulement tiré d'une copie locale du profil.
export function peutChangerDeVue(profil, confirme) {
  return Boolean(profil && profil.role === ROLE_CONSULTANT && confirme === true);
}

// Rôle de l'interface. Hors consultant confirmé : toujours le rôle réel, quel
// que soit le stockage. Consultant sans choix, ou choix d'une autre personne :
// consultant.
export function roleEffectif(profil, choix, confirme) {
  if (!profil) return null;
  if (!peutChangerDeVue(profil, confirme)) return profil.role;
  if (!choix || choix.userId !== profil.id || !ROLES_VUE.includes(choix.role)) return profil.role;
  return choix.role;
}

// Profil que voit l'interface : le même objet hors autre vue ; sinon une copie
// au rôle choisi, qui garde le rôle réel dans roleReel.
export function profilAffiche(profil, choix, confirme) {
  const role = roleEffectif(profil, choix, confirme);
  if (!profil || role === profil.role) return profil;
  return { ...profil, role, roleReel: profil.role };
}
