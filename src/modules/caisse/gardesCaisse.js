// Qui habille la caisse : boutons, réglages, remises, contrôle, clôture, et
// la tuile « Rapports ». Rangé à part de Caisse.jsx pour que le module
// Statistiques lise la même garde sans charger tout l'écran de la caisse.
export const ROLES_HABILLAGE = ['consultant', 'patron', 'resp_cuisine'];
export const peutHabillerCaisse = (role) => ROLES_HABILLAGE.includes(role);
