// ─────────────────────────────────────────────────────────────
// recipeProductMatching - rapprochement ingrédient de recette ↔ produit catalogue.
//
// Algorithme en 3 passes :
//   1. Match exact   (nom normalisé identique)            -> confiance 100
//   2. Levenshtein   (distance ≤ 2 : match ; 3-4 : ambigu) -> confiance 85 / 60
//   3. Tokenisé      (similarité de Jaccard)               -> confiance variable
//
// API :
//   matchIngredient(nom, catalogue) -> { status, confidence, product, suggestions }
//     status : 'matched' | 'ambiguous' | 'none' | 'excluded'
// ─────────────────────────────────────────────────────────────

// Mots vides ignorés à la tokenisation.
const STOPWORDS = new Set(['de', 'la', 'le', 'les', 'du', 'des', 'au', 'aux', 'et', 'en', 'a', 'd', 'l', 'un', 'une', 'sans', 'avec', 'the', 'of']);

// Ingrédients « non commerciaux » : exclus du matching s'ils sont seuls
// (« sel » exclu, mais « sel de Guérande » reste matchable).
const NON_COMMERCIAL = new Set(['sel', 'poivre', 'eau', 'glace', 'glacon', 'glacons']);

// Variantes orthographiques regroupées vers un token canonique.
const TOKEN_SYNONYMS = {
  echalotte: 'echalote', echalion: 'echalote',
  ognon: 'oignon',
  yogourt: 'yaourt', yoghourt: 'yaourt',
  beuf: 'boeuf',
};

// Normalisation : minuscule, sans accents, œ/æ déliés, alphanumérique.
export function normalizeName(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Tokenise : retire les mots vides, met au singulier, applique les synonymes.
export function tokenize(s) {
  return normalizeName(s)
    .split(' ')
    .filter(t => t && !STOPWORDS.has(t))
    .map(t => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
    .map(t => TOKEN_SYNONYMS[t] || t);
}

// Distance de Levenshtein (implémentation légère, sans dépendance).
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[b.length];
}

// Similarité de Jaccard entre deux ensembles de tokens.
function jaccard(tokensA, tokensB) {
  if (!tokensA.length || !tokensB.length) return { score: 0, common: 0 };
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = new Set([...setA, ...setB]).size;
  return { score: union ? inter / union : 0, common: inter };
}

// Rapproche un nom d'ingrédient du catalogue produits.
// `catalogue` : tableau de produits ayant au moins { id, nom }.
export function matchIngredient(rawName, catalogue) {
  const empty = { status: 'none', confidence: 0, product: null, suggestions: [] };
  const nName = normalizeName(rawName);
  const tokens = tokenize(rawName);

  if (!nName) return empty;
  // Ingrédient non commercial isolé -> on ne matche pas.
  if (tokens.length <= 1 && NON_COMMERCIAL.has(tokens[0])) {
    return { status: 'excluded', confidence: 0, product: null, suggestions: [] };
  }
  if (!Array.isArray(catalogue) || !catalogue.length) return empty;

  const cat = catalogue
    .filter(p => p && p.nom)
    .map(p => ({ product: p, n: normalizeName(p.nom), tk: tokenize(p.nom) }));

  // ── Passe 1 : match exact normalisé ──
  const exact = cat.find(c => c.n === nName);
  if (exact) {
    return { status: 'matched', confidence: 100, product: exact.product, suggestions: [{ product: exact.product, confidence: 100 }] };
  }

  // ── Passe 2 : Levenshtein ──
  let best = null;
  for (const c of cat) {
    const d = levenshtein(nName, c.n);
    if (best === null || d < best.d) best = { c, d };
  }
  if (best && best.d <= 2) {
    return { status: 'matched', confidence: 85, product: best.c.product, suggestions: [{ product: best.c.product, confidence: 85 }] };
  }

  // ── Passe 3 : tokenisé (Jaccard) ──
  const scored = cat
    .map(c => {
      const j = jaccard(tokens, c.tk);
      return { product: c.product, score: j.score, common: j.common };
    })
    .filter(s => s.score >= 0.5 && s.common >= 1)
    .sort((a, b) => b.score - a.score);

  // Levenshtein 3-4 -> ambigu (confiance 60), enrichi des correspondances tokenisées.
  if (best && best.d <= 4) {
    const suggestions = [{ product: best.c.product, confidence: 60 }];
    for (const s of scored.slice(0, 3)) {
      if (s.product.id !== best.c.product.id) {
        suggestions.push({ product: s.product, confidence: Math.round(s.score * 100) });
      }
    }
    return { status: 'ambiguous', confidence: 60, product: null, suggestions: suggestions.slice(0, 4) };
  }

  // Correspondances tokenisées seules.
  if (scored.length) {
    const strong = scored.filter(s => s.score >= 0.7 && s.common >= 2);
    const pool = strong.length ? strong : scored;
    return {
      status: 'ambiguous',
      confidence: Math.round(pool[0].score * 100),
      product: null,
      suggestions: pool.slice(0, 4).map(s => ({ product: s.product, confidence: Math.round(s.score * 100) })),
    };
  }

  return empty;
}
