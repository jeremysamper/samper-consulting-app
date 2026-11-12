// La direction du spa : réservation en ligne, e-mails, effacement d'une fiche.
// Comme la RLS de spa_parametres (consultant et patron). Rangé à part de
// Spa.jsx pour que la page des réglages lise la même garde sans charger tout
// le module.
export const ROLES_DIRECTION_SPA = ['consultant', 'patron'];
export const estDirectionSpa = (role) => ROLES_DIRECTION_SPA.includes(role);
