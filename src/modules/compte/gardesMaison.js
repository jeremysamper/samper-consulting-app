// Réglages de la maison (reglages_maison, 18.11.2026) : qui les écrit. Même
// règle que la RLS de la table (consultant et patron) ; fichier léger, lu par
// le registre des réglages (bundle de départ).
export const ROLES_DIRECTION_MAISON = ['consultant', 'patron'];
export const estDirectionMaison = (role) => ROLES_DIRECTION_MAISON.includes(role);
