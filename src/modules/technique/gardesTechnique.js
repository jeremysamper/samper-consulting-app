import { canManageModule } from '../../data/demoData.js';

// Qui tient les équipements et le préventif : le droit « Modifier » du module
// Technique, comme la RLS d'equipements (user_peut_gerer). Rangé à part de
// Technique.jsx pour que la page des réglages lise la même garde.
export const peutGererTechnique = (role) => canManageModule(role, 'technique');
