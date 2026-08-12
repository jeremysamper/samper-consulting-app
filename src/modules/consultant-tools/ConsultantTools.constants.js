// Référentiel partagé (src/utils/allergenes.js) : une seule liste pour
// l'app entière, sinon les ids divergent d'un module à l'autre.
export { ALLERGENES as ALLERGENES_OPTIONS } from '../../utils/allergenes.js';

export const CATEGORIES_REC = ['Entrées', 'Plats', 'Desserts', 'Fromages', 'Sauces', 'Fonds', 'Amuse-bouches', 'Garnitures'];
export const UNITES_REC = ['g', 'kg', 'ml', 'L', 'pcs', 'cs', 'cc', 'pincée'];

// ─── Conversion entre unités (grammes/mL comme pivot) ───
// Retourne le facteur multiplicatif pour passer de "from" à "to"
// Ex: convertFactor('kg', 'g') === 1000  (1 kg = 1000 g)
// Ex: convertFactor('g', 'kg') === 0.001 (1 g = 0.001 kg)
// Retourne null si incompatibles (ex: g <-> ml, ou g <-> pcs)
export const convertFactor = (from, to) => {
  if (!from || !to || from === to) return 1;
  // Familles : poids (g/kg), volume (ml/L), unitaire (pcs/cs/cc/pincée)
  const weights = { g: 1, kg: 1000 };
  const volumes = { ml: 1, L: 1000, cl: 10 };
  if (weights[from] && weights[to]) return weights[from] / weights[to];
  if (volumes[from] && volumes[to]) return volumes[from] / volumes[to];
  return null; // incompatibles, on ne convertit pas
};

// Pour convertir un PRIX par unité, utiliser convertPrix() de
// src/services/prixResolution.js : un prix est une grandeur inverse de la
// quantité, il se divise là où une quantité se multiplie. L'ancien helper
// adjustPrixUnitForUnit vivait ici avec la formule inversée ; il a été
// supprimé plutôt que corrigé, pour ne laisser qu'une seule implémentation.

// ─── PhotoUploader : composant d'upload d'image (recette ou plat) ───
