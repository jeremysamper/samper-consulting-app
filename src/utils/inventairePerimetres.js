// ─────────────────────────────────────────────────────────────────────────────
// PÉRIMÈTRES D'INVENTAIRE
//
// Un établissement tient plusieurs inventaires en parallèle : la cuisine compte
// son économat une fois par mois, le bar ses bouteilles chaque semaine, le
// matériel une fois par trimestre. Chaque inventaire porte donc un périmètre
// (colonne `inventaires.nom`, migration 20260810).
//
// Source unique de la règle de repli : tant que la migration n'est pas
// appliquée - ou pour les lignes créées par un bundle antérieur - `nom` est
// vide et l'inventaire appartient au périmètre « Général ».
// ─────────────────────────────────────────────────────────────────────────────

export const PERIMETRE_DEFAUT = 'Général';

// Proposés à la création, librement remplaçables : chaque maison a son
// découpage (une brasserie sépare cave et bar, un hôtel ajoute le room service).
export const PERIMETRES_SUGGERES = [
  'Cuisine',
  'Boissons',
  'Cave',
  'Économat sec',
  'Surgelés',
  'Matériel',
  'Consommables',
];

/** Périmètre d'un inventaire, replié sur « Général » si non renseigné. */
export const perimetreOf = (inv) => (inv?.nom || '').trim() || PERIMETRE_DEFAUT;

/**
 * Périmètres présents dans une liste d'inventaires, dédupliqués.
 * « Général » d'abord (c'est l'historique), le reste par ordre alphabétique.
 */
export const listePerimetres = (inventaires) => {
  const noms = Array.from(new Set((inventaires || []).map(perimetreOf)));
  return noms.sort((a, b) => {
    if (a === PERIMETRE_DEFAUT) return -1;
    if (b === PERIMETRE_DEFAUT) return 1;
    return a.localeCompare(b, 'fr');
  });
};

/**
 * Dernier inventaire de chaque périmètre (le plus récent par date).
 * C'est la photo du stock à un instant t : additionner toute la liste
 * compterait plusieurs fois le même stock d'un mois sur l'autre.
 */
export const derniersParPerimetre = (inventaires) => {
  const parPerimetre = new Map();
  (inventaires || []).forEach(inv => {
    const cle = perimetreOf(inv);
    const courant = parPerimetre.get(cle);
    if (!courant || String(inv.date || '') > String(courant.date || '')) {
      parPerimetre.set(cle, inv);
    }
  });
  return Array.from(parPerimetre.values());
};

/** Valeur de stock consolidée : somme du dernier inventaire de chaque périmètre. */
export const valeurStockConsolidee = (inventaires) =>
  derniersParPerimetre(inventaires).reduce((total, inv) => total + (Number(inv.valeurTotale ?? inv.valeur_totale) || 0), 0);
