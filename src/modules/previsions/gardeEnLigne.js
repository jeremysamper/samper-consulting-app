// Qui règle la réservation en ligne du restaurant : la direction, comme pour
// le Spa et comme la RLS de reservation_en_ligne_parametres (consultant et
// patron). Rangé à part de Previsions.jsx pour que la page des réglages lise
// la même garde sans charger tout le module Réservations.
import { canManageModule } from '../../data/demoData.js';

export const ROLES_EN_LIGNE = ['consultant', 'patron'];
export const peutReglerEnLigne = (role) => ROLES_EN_LIGNE.includes(role);

// Qui écrit dans Réservations, plan de salle compris (salles, tables, décor) :
// la case Modifier du module, comme la RLS (user_peut_gerer('previsions')).
// L'écran Réservations et la section « Plan de salle » lisent cette garde.
export const peutGererReservations = (role) => canManageModule(role, 'previsions');
