// ─────────────────────────────────────────────────────────────────────────────
// Règles de correspondance de Ventes POS, par maison (plan 15, lot 4, table
// pos_regles_correspondance). Une règle dit, pour les articles de caisse dont
// le nom est exactement, contient ou commence par un motif : « relier » à une
// fiche, ou « ignorer » (boisson, supplément). Le nom est comparé sans casse
// ni accents ni espaces en trop. Quand plusieurs règles conviennent : la
// priorité la plus haute, puis le motif le plus long. Fonctions pures.
// ─────────────────────────────────────────────────────────────────────────────

export function nomNormalise(nom) {
  return String(nom || '')
    .toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function regleConvient(regle, nom) {
  const n = nomNormalise(nom);
  const m = nomNormalise(regle?.motif);
  if (!m || regle?.actif === false) return false;
  if (regle.mode === 'exact') return n === m;
  if (regle.mode === 'commence') return n.startsWith(m);
  return n.includes(m);
}

export function regleQuiCorrespond(nom, regles) {
  const candidates = (regles || []).filter((r) => regleConvient(r, nom));
  if (!candidates.length) return null;
  return candidates.sort((a, b) => (Number(b.priorite) || 0) - (Number(a.priorite) || 0)
    || nomNormalise(b.motif).length - nomNormalise(a.motif).length)[0];
}

// Lot à valider en une fois : les articles sans correspondance validée, reliés
// par une règle « relier » ou par une suggestion assez sûre (seuil). Les
// articles d'une règle « ignorer » sortent du lot (et de la liste à relier).
export function loteEnSerie({ posItems, mappings, suggestions, regles, seuil }) {
  const lot = [];
  (posItems || []).forEach((item) => {
    const m = mappings?.[item.id];
    if (m?.manually_validated) return;
    const regle = regleQuiCorrespond(item.name, regles);
    if (regle?.action === 'ignorer') return;
    if (regle?.action === 'relier' && regle.recette_id) {
      lot.push({ posItemId: item.id, recipeId: regle.recette_id, confidence: 100, regleId: regle.id });
      return;
    }
    const s = suggestions?.[item.id];
    const recipeId = m?.recipe_id || s?.recipeId;
    // Scores de 0 à 100 (coefficient de Dice, comme les badges).
    const score = m ? Number(m.confidence) : Number(s?.score);
    if (recipeId && score >= seuil) lot.push({ posItemId: item.id, recipeId, confidence: Math.round(score), regleId: null });
  });
  return lot;
}
