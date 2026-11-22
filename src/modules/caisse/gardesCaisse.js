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
