// Qui règle le HACCP d'un établissement (frigos et appareils, heures de
// relevé, contrôles) : la direction de la maison, consultant, patron et
// responsable cuisine (décision D1 du plan 15, 22.11.2026), comme les
// policies d'écriture de haccp_zones, haccp_creneaux et haccp_ctrl_templates
// (migration 20261122_lot2a_reglages_modules).
// Supprimer un frigo efface ses relevés, supprimer un contrôle laisse ses
// contrôles passés sans nom : c'est retirer de l'historique, réservé au
// consultant. Les autres mettent hors service (actif = false).
// Rangé à part de HACCP.jsx pour que la page des réglages lise la même garde
// sans charger tout le module.
export const ROLES_CONFIG_HACCP = ['consultant', 'patron', 'resp_cuisine'];
export const peutConfigurerHaccp = (role) => ROLES_CONFIG_HACCP.includes(role);
export const peutSupprimerHistoriqueHaccp = (role) => role === 'consultant';
