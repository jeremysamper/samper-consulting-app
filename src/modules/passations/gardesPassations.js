import { canManageModule } from '../../data/demoData.js';

// Qui tient les tâches récurrentes des Passations : le droit « Modifier » du
// module, comme la RLS de taches_recurrentes (user_peut_gerer). Rangé à part
// de Passations.jsx pour que la page des réglages lise la même garde.
export const peutGererPassations = (role) => canManageModule(role, 'passations');
