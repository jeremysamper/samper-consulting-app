import { canManageModule } from '../../data/demoData.js';

// Qui gère les cartes de Cartes & Recettes : le droit « Modifier » du module.
// C'est aussi la garde du bouton « Définir par défaut » (carte d'accueil).
// Rangé à part de Recettes.jsx pour que la page des réglages lise la même
// garde sans charger tout le module.
export const peutGererCartes = (role) => canManageModule(role, 'recettes');
