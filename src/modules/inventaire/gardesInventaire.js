import { canManageModule } from '../../data/demoData.js';

// Qui gère l'inventaire (renommer un périmètre, rouvrir ou supprimer un
// inventaire, produits maison) : le droit « Modifier » du module, pour qui a
// le module. Rangé à part d'Inventaire.jsx : le registre des réglages lit la
// même garde sans charger tout l'écran de l'inventaire.
export const peutGererInventaire = (role, permissions) => !!permissions?.inventaire && canManageModule(role, 'inventaire');
