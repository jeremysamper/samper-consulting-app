// ─────────────────────────────────────────────────────────────
// Façonnage des données « fiche recette » pour le générateur PDF
// jsPDF natif (src/services/pdf.js → pdfUtils.exportRecettePdf).
// Util pur (ni React ni DOM) : partagé par le module Recettes/Carte
// ET le module Consultant pour un export fiche recette identique.
// Source unique : ne pas redupliquer cette logique ailleurs.
// ─────────────────────────────────────────────────────────────

// ALLERGENES_MAP : id technique → libellé affiché (résolution des allergènes).
// Référentiel partagé (src/utils/allergenes.js) : ne pas redéclarer la liste.
export { ALLERGENES_LABELS as ALLERGENES_MAP } from './allergenes.js';
import { labelAllergene } from './allergenes.js';

// slug pour nom de fichier PDF (sans accents, kebab-case).
// [̀-ͯ] = marques diacritiques combinantes retirées après normalize('NFD').
export const slug = (s) => String(s || 'recette').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'recette';

// Construit l'objet fiche pour le générateur jsPDF natif (pdf.js).
// La logique de rôle (food cost consultant-only) et la résolution des allergènes
// vivent ici. `portions` permet de refléter une mise à l'échelle (vue détail) ;
// par défaut, les portions de base de la recette.
export function buildRecettePdfData(recette, { isConsultant = false, portions } = {}) {
  const p = portions != null ? portions : recette.portions;
  const ratio = (p || 1) / (recette.portions || 1);
  const fmtQty = (n) => (n % 1 === 0 ? n.toFixed(0) : n.toFixed(1));

  const metaCells = [{ k: 'PORTIONS', v: String(p ?? '') }];
  if (recette.tempsTotal) metaCells.push({ k: 'TEMPS TOTAL', v: `${recette.tempsTotal} min` });
  if (isConsultant && recette.foodCost != null) metaCells.push({ k: 'FOOD COST', v: `${recette.foodCost.toFixed(1)}%` });

  const notes = [];
  if (recette.dressage) notes.push({ label: 'Dressage', text: recette.dressage });
  if (recette.conservation) notes.push({ label: 'Conservation', text: recette.conservation });

  return {
    plat: recette.nom,
    famille: recette.categorie,
    metaCells,
    ingredients: (recette.ingredients || []).map((i) => ({
      qte: fmtQty((i.quantite || 0) * ratio),
      unite: i.unite,
      nom: i.nom,
    })),
    etapes: recette.etapes || [],
    notes,
    allergenesText: (recette.allergenesIds || []).map(labelAllergene).join(', ') || 'Aucun',
  };
}
