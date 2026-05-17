// ─────────────────────────────────────────────────────────────
// UnitParser — normalisation des unités et quantités d'ingrédients
// Utilisé par tous les importeurs (Excel, CSV, PDF).
//
// API :
//   parse(rawString)          -> { quantity, unit, original } | { error, original }
//   normalizeUnit(rawString)  -> unité canonique | null
//   parseQuantity(rawString)  -> nombre | null
//   getUnrecognizedUnits()    -> string[]  (collecté pendant la session)
// ─────────────────────────────────────────────────────────────

// Unité canonique -> variantes acceptées
export const UNIT_NORMALIZATION = {
  // POIDS
  g: ['g', 'gr', 'grs', 'gramme', 'grammes', 'gms'],
  kg: ['kg', 'kgs', 'kilo', 'kilos', 'kilogramme', 'kilogrammes'],
  mg: ['mg', 'milligramme', 'milligrammes'],
  // VOLUME
  ml: ['ml', 'millilitre', 'millilitres'],
  cl: ['cl', 'centilitre', 'centilitres'],
  l: ['l', 'litre', 'litres', 'lt'],
  dl: ['dl', 'decilitre', 'decilitres'],
  // CUILLERES
  'c.s.': ['c.s.', 'cs', 'c.a.s', 'c. a s.', 'c a s', 'cuillere a soupe', 'cuilleres a soupe', 'cuiller a soupe', 'tbsp', 'tablespoon', 'cas'],
  'c.c.': ['c.c.', 'cc', 'c.a.c', 'c. a c.', 'c a c', 'cuillere a cafe', 'cuilleres a cafe', 'tsp', 'teaspoon', 'cac'],
  // UNITES DE COMPTAGE
  'unité': ['u', 'unite', 'unites', 'piece', 'pieces', 'pc', 'pcs', 'p'],
  'pincée': ['pincee', 'pincees', 'pinch', 'pinches', 'pointe', 'pointe de couteau'],
  gousse: ['gousse', 'gousses'],
  botte: ['botte', 'bottes'],
  feuille: ['feuille', 'feuilles', 'leaf', 'leaves'],
  verre: ['verre', 'verres', 'glass'],
  tasse: ['tasse', 'tasses', 'cup', 'cups'],
  // INDEFINIS
  qsp: ['qsp', 'q.s.p.', 'qs', 'q.s.', 'quantite suffisante', 'selon gout', 'selon besoin', 'a votre gout', 'au gout', 'a discretion', 'pm'],
};

// Quantités textuelles -> valeur numérique
const QUANTITY_PARSERS = [
  { pattern: /^(\d+)\s*\/\s*(\d+)$/, parser: (m) => parseInt(m[1], 10) / parseInt(m[2], 10) },
  { pattern: /^(½|1\/2|un demi|une demie|demi|demie)$/, value: 0.5 },
  { pattern: /^(¼|1\/4|un quart|un quart de|quart)$/, value: 0.25 },
  { pattern: /^(¾|3\/4|trois quarts)$/, value: 0.75 },
  { pattern: /^(⅓|1\/3|un tiers)$/, value: 1 / 3 },
  { pattern: /^(⅔|2\/3|deux tiers)$/, value: 2 / 3 },
  { pattern: /^(\d+)[.,](\d+)$/, parser: (m) => parseFloat(`${m[1]}.${m[2]}`) },
  { pattern: /^(\d+(?:\.\d+)?)$/, parser: (m) => parseFloat(m[1]) },
  { pattern: /^une?$/, value: 1 },
  { pattern: /^deux$/, value: 2 },
  { pattern: /^trois$/, value: 3 },
  { pattern: /^quatre$/, value: 4 },
  { pattern: /^cinq$/, value: 5 },
  { pattern: /^six$/, value: 6 },
];

// Normalisation tolérante : minuscule, sans accents, espaces réduits.
const norm = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .trim()
  .replace(/\s+/g, ' ');
// Forme compacte : sans points ni espaces (matche "c. a s." == "c.a.s" == "c a s").
const compact = (s) => norm(s).replace(/[.\s]/g, '');

// Index de recherche unités (construit une fois).
const UNIT_BY_NORM = {};
const UNIT_BY_COMPACT = {};
for (const [canon, variants] of Object.entries(UNIT_NORMALIZATION)) {
  for (const v of variants) {
    UNIT_BY_NORM[norm(v)] = canon;
    UNIT_BY_COMPACT[compact(v)] = canon;
  }
}

// Unités non reconnues rencontrées pendant la session (pour amélioration du dico).
const unrecognized = new Set();
export const getUnrecognizedUnits = () => Array.from(unrecognized);
export const resetUnrecognizedUnits = () => unrecognized.clear();

// Renvoie l'unité canonique ou null.
export function normalizeUnit(raw) {
  const n = norm(raw);
  if (!n) return null;
  if (UNIT_BY_NORM[n]) return UNIT_BY_NORM[n];
  const c = compact(raw);
  if (UNIT_BY_COMPACT[c]) return UNIT_BY_COMPACT[c];
  return null;
}

// Renvoie une quantité numérique ou null.
export function parseQuantity(raw) {
  const n = norm(raw);
  if (!n) return null;
  for (const p of QUANTITY_PARSERS) {
    const m = n.match(p.pattern);
    if (m) return p.value != null ? p.value : p.parser(m);
  }
  return null;
}

// Vrai si la chaîne désigne une quantité indéfinie ("qsp", "selon goût"…).
function isIndefinite(n) {
  return Boolean(UNIT_BY_NORM[n]) && UNIT_BY_NORM[n] === 'qsp';
}

// Préfixe quantité : nombre, fraction, fraction unicode, ou nombre écrit.
const QTY_PREFIX = /^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|[¼½¾⅓⅔]|un demi|une demie|un quart|trois quarts|deux tiers|un tiers|une?|deux|trois|quatre|cinq|six)\s*(.*)$/;

// Parse une chaîne brute "30 g", "1/2 c.s.", "qsp", "2 gousses", "½ c.s. de sel".
// Renvoie { quantity, unit, original } ou { error:'unparseable', original }.
export function parse(rawString) {
  const original = String(rawString ?? '').trim();
  if (!original) return { quantity: null, unit: null, original };

  const n = norm(original);

  // Cas indéfini pur ("qsp", "selon goût"…)
  if (isIndefinite(n)) return { quantity: null, unit: 'qsp', original };

  let quantity = null;
  let rest = n;
  const m = n.match(QTY_PREFIX);
  if (m) {
    const q = parseQuantity(m[1]);
    if (q != null) {
      quantity = q;
      rest = (m[2] || '').trim();
    }
  }

  // Le reste peut être "unité" ou "unité de ingrédient" — on retire un "de"/"d'" éventuel.
  rest = rest.replace(/^d['e]\s+/, '').trim();

  let unit = normalizeUnit(rest);
  if (!unit && rest) {
    // Tente le premier mot significatif (ex: "g de farine").
    const first = rest.split(/\s+/)[0];
    unit = normalizeUnit(first);
    if (!unit && quantity != null) {
      // Quantité trouvée mais unité inconnue : on logue.
      unrecognized.add(first);
    }
  }

  if (quantity == null && !unit) {
    return { error: 'unparseable', original };
  }
  return { quantity, unit: unit || null, original };
}

// Conversion vers les unités utilisées par l'éditeur de recettes
// (UNITES_REC = g, kg, ml, L, pcs, cs, cc, pincée). Convertit la quantité
// si l'unité canonique n'a pas d'équivalent direct (cl -> ml, mg -> g…).
const APP_UNIT_MAP = {
  g: { u: 'g', f: 1 }, kg: { u: 'kg', f: 1 }, mg: { u: 'g', f: 0.001 },
  ml: { u: 'ml', f: 1 }, cl: { u: 'ml', f: 10 }, l: { u: 'L', f: 1 }, dl: { u: 'ml', f: 100 },
  'c.s.': { u: 'cs', f: 1 }, 'c.c.': { u: 'cc', f: 1 },
  'unité': { u: 'pcs', f: 1 }, gousse: { u: 'pcs', f: 1 }, botte: { u: 'pcs', f: 1 },
  feuille: { u: 'pcs', f: 1 }, verre: { u: 'pcs', f: 1 }, tasse: { u: 'pcs', f: 1 },
  'pincée': { u: 'pincée', f: 1 }, qsp: { u: 'g', f: 1 },
};

// Renvoie { unit, quantity, unknown } adaptés à l'éditeur de recettes.
export function toAppUnit(unit, quantity) {
  const q = Number(quantity) || 0;
  const m = APP_UNIT_MAP[unit];
  if (!m) return { unit: 'g', quantity: q, unknown: true };
  const converted = q * m.f;
  return { unit: m.u, quantity: Math.round(converted * 10000) / 10000, unknown: false };
}
