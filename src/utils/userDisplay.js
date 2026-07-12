import { getDemoData } from '../data/demoData.js';

// Résolution d'un identifiant utilisateur (declare_par, valide_par, operateur_id,
// user_id de shift…) en infos d'affichage, avec fallback propre.
//
// Depuis le durcissement RLS (migration 20260712 : profils scopés par
// établissement), un utilisateur hors du périmètre du user courant — typiquement
// un collaborateur ayant quitté l'établissement — n'est plus présent dans
// DEMO_DATA.utilisateurs pour un non-consultant. Son id subsiste pourtant sur des
// lignes historiques (pertes, validations, relevés, shifts). Ces helpers évitent
// alors un champ vide ou un identifiant brut à l'écran.

const FALLBACK_NAME = 'Utilisateur inconnu';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function findUtilisateur(value, users) {
  if (!value) return null;
  const list = users || getDemoData()?.utilisateurs || [];
  return list.find((u) => u && u.id === value) || null;
}

// Nom affichable, jamais vide.
// - trouvé            → « Prénom Nom » (ou email en dernier recours)
// - id non résolu     → fallback (« Utilisateur inconnu »)
// - valeur héritée en clair (ancien nom d'opérateur saisi, pas un id) → conservée
export function userDisplayName(value, { users, fallback = FALLBACK_NAME } = {}) {
  const u = findUtilisateur(value, users);
  if (u) return `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email || fallback;
  if (typeof value === 'string' && value && !UUID_RE.test(value) && !/^[a-z]+-\w/i.test(value)) {
    return value; // nom libre historique, pas un identifiant technique
  }
  return fallback;
}

// Objet d'affichage complet pour les cellules avec pastille/avatar.
export function userDisplay(value, opts = {}) {
  const u = findUtilisateur(value, opts.users);
  if (!u) {
    return { found: false, name: userDisplayName(value, opts), prenom: '', nom: '', avatar: '?', role: null };
  }
  const name = `${u.prenom || ''} ${u.nom || ''}`.trim() || u.email || (opts.fallback || FALLBACK_NAME);
  const avatar = u.avatar || `${u.prenom?.[0] || ''}${u.nom?.[0] || ''}`.toUpperCase() || '?';
  return { found: true, name, prenom: u.prenom || '', nom: u.nom || '', avatar, role: u.role || null };
}
