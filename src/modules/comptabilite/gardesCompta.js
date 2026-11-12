import { canManageModule } from '../../data/demoData.js';

// Qui lit les chiffres de la Comptabilité : la direction, et les personnes
// qui règlent les factures. Les salaires ne sortent jamais de la direction.
// Rangé à part de Comptabilite.jsx pour que le module Statistiques lise les
// mêmes gardes sans charger tout l'écran.
export const ROLES_DIRECTION = ['consultant', 'patron'];
export const estDirection = (role) => ROLES_DIRECTION.includes(role);
export const peutReglerFactures = (role) => canManageModule(role, 'factures_achat');
