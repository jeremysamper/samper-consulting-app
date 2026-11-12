// Qui règle le HACCP d'un établissement (frigos et appareils, heures de
// relevé, contrôles) : le consultant. Garde d'écran seulement : les trois
// tables de configuration n'écartent personne de l'établissement en base.
// Rangé à part de HACCP.jsx pour que la page des réglages lise la même garde
// sans charger tout le module.
export const peutConfigurerHaccp = (role) => role === 'consultant';
