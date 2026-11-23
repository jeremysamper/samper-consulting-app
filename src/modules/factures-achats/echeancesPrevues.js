import { estFacture } from '../inventaire/facturesLogic.js';

// Partie pure des délais de paiement (delaisPaiement.js) : lue par les tests
// sans le client Supabase.

export const DELAI_PAIEMENT_DEFAUT = 30;

const ajouterJours = (iso, n) => {
  const [a, m, j] = String(iso).split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
};

// Fonction pure : les factures non réglées sans échéance reçoivent leur
// échéance prévue (echeancePrevue: true).
export function avecEcheancesPrevues(docs, { maison = DELAI_PAIEMENT_DEFAUT, parFournisseur = new Map() } = {}) {
  return (docs || []).map((d) => {
    if (!estFacture(d) || d.regleLe || d.dateEcheance || !/^\d{4}-\d{2}-\d{2}/.test(String(d.dateDocument || ''))) return d;
    const delai = parFournisseur.get(d.fournisseurId) ?? maison;
    return { ...d, dateEcheance: ajouterJours(String(d.dateDocument).slice(0, 10), delai), echeancePrevue: true };
  });
}
