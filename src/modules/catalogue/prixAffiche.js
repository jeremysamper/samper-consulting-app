// ─────────────────────────────────────────────────────────────────────────────
// Prix d'un produit du catalogue tel qu'on le lit : deux décimales, à l'unité
// de vente courante. Le prix est gardé par unité de référence (g, ml, pcs) ;
// au gramme ou au millilitre il tombe à « CHF 0.0095 » : il s'affiche au kilo
// ou au litre (« CHF 9.50 / l »). Rien n'est changé en base. Sans React.
// ─────────────────────────────────────────────────────────────────────────────

const CONVERSIONS = {
  g: { facteur: 1000, unite: 'kg' },
  ml: { facteur: 1000, unite: 'l' },
  cl: { facteur: 100, unite: 'l' },
  pcs: { facteur: 1, unite: 'pce' },
  piece: { facteur: 1, unite: 'pce' },
  pièce: { facteur: 1, unite: 'pce' },
};

// → { valeur, unite } ou null sans prix.
export function prixALUnite(prix, uniteRef) {
  const p = Number(prix);
  if (!Number.isFinite(p) || p <= 0) return null;
  const u = String(uniteRef || '').trim();
  const c = CONVERSIONS[u.toLowerCase()] || { facteur: 1, unite: u };
  return { valeur: p * c.facteur, unite: c.unite };
}

// « CHF 9.50 / l » ; '' sans prix. Un prix qui s'arrondirait à zéro garde
// ses chiffres significatifs plutôt que d'écrire « CHF 0.00 ».
export function prixAffiche(prix, uniteRef) {
  const r = prixALUnite(prix, uniteRef);
  if (!r) return '';
  const texte = r.valeur >= 0.005 ? r.valeur.toFixed(2) : String(Number(r.valeur.toPrecision(2)));
  return r.unite ? `CHF ${texte} / ${r.unite}` : `CHF ${texte}`;
}
