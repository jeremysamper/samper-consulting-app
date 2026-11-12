// Qui règle la réservation en ligne du restaurant : la direction, comme pour
// le Spa et comme la RLS de reservation_en_ligne_parametres (consultant et
// patron). Rangé à part de Previsions.jsx pour que la page des réglages lise
// la même garde sans charger tout le module Réservations.
export const ROLES_EN_LIGNE = ['consultant', 'patron'];
export const peutReglerEnLigne = (role) => ROLES_EN_LIGNE.includes(role);
