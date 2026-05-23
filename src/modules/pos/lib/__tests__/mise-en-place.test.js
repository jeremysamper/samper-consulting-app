/**
 * Tests unitaires — logique useMiseEnPlace
 * Exécution : node src/modules/pos/lib/__tests__/mise-en-place.test.js
 */

// ── Mini runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✅ ${label}`); passed++; }
  catch (e) { console.error(`  ❌ ${label}\n     ${e.message}`); failed++; }
}
function expect(val) {
  return {
    toBe:        (exp) => { if (val !== exp) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toEqual:     (exp) => { if (JSON.stringify(val) !== JSON.stringify(exp)) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toBeCloseTo: (exp, precision = 1) => {
      const factor = Math.pow(10, precision);
      if (Math.round(val * factor) !== Math.round(exp * factor))
        throw new Error(`Expected ~${exp}, got ${val}`);
    },
    toBeTruthy:  () => { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeFalsy:   () => { if (val)  throw new Error(`Expected falsy, got ${JSON.stringify(val)}`); },
    toBeGreaterThan: (exp) => { if (val <= exp) throw new Error(`Expected > ${exp}, got ${val}`); },
  };
}

// ── Logique extraite (sans React/Supabase) ────────────────────────────────────

function dowFromDateStr(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

/**
 * Calcule la prédiction pour un pos_item.
 * @param {Array<{dow: number, qty: number}>} sales  Ventes 14j
 * @param {number}                            tomorrowDow
 * @returns {{ qty: number, reliable: boolean, occurrences: number }}
 */
function computePrediction(sales, tomorrowDow) {
  const sameDow = sales.filter((s) => s.dow === tomorrowDow);
  if (sameDow.length >= 2) {
    const total = sameDow.reduce((acc, s) => acc + s.qty, 0);
    return { qty: Math.ceil(total / sameDow.length), reliable: true, occurrences: sameDow.length };
  }
  if (sales.length > 0) {
    const total = sales.reduce((acc, s) => acc + s.qty, 0);
    return { qty: Math.ceil(total / sales.length), reliable: false, occurrences: sales.length };
  }
  return { qty: 0, reliable: false, occurrences: 0 };
}

// Construit les sales avec dow pour les tests
function makeSales(entries) {
  return entries.map(([dateStr, qty]) => ({ dow: dowFromDateStr(dateStr), qty }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n📋 useMiseEnPlace — Tests\n');

test('Historique complet — 2 lundis → fiable, moyenne correcte', () => {
  // dow 1 = lundi
  const sales = makeSales([
    ['2026-05-18', 20],  // lundi
    ['2026-05-11', 16],  // lundi
    ['2026-05-12', 12],  // mardi
    ['2026-05-19', 10],  // mardi
  ]);
  const r = computePrediction(sales, 1); // demain = lundi
  expect(r.reliable).toBe(true);
  expect(r.occurrences).toBe(2);
  expect(r.qty).toBe(18); // ceil((20+16)/2) = 18
});

test('Historique complet — arrondi supérieur', () => {
  const sales = makeSales([
    ['2026-05-18', 7],   // lundi
    ['2026-05-11', 8],   // lundi
    ['2026-05-04', 8],   // lundi
  ]);
  const r = computePrediction(sales, 1);
  expect(r.reliable).toBe(true);
  expect(r.qty).toBe(8); // ceil((7+8+8)/3) = ceil(7.67) = 8
});

test('Arrondi supérieur fractionnaire', () => {
  const sales = makeSales([
    ['2026-05-18', 10],  // lundi
    ['2026-05-11', 11],  // lundi
  ]);
  const r = computePrediction(sales, 1);
  expect(r.qty).toBe(11); // ceil(10.5) = 11
});

test('Historique court (1 seul lundi) → non fiable, moyenne globale', () => {
  const sales = makeSales([
    ['2026-05-18', 20],  // lundi (unique)
    ['2026-05-12', 12],  // mardi
    ['2026-05-13', 14],  // mercredi
    ['2026-05-14',  8],  // jeudi
  ]);
  const r = computePrediction(sales, 1); // demain = lundi
  expect(r.reliable).toBe(false);
  expect(r.occurrences).toBe(4); // toutes les ventes
  expect(r.qty).toBe(14); // ceil((20+12+14+8)/4) = ceil(13.5) = 14
});

test('Aucune vente → qty=0, non fiable', () => {
  const r = computePrediction([], 1);
  expect(r.qty).toBe(0);
  expect(r.reliable).toBe(false);
  expect(r.occurrences).toBe(0);
});

test('Aucune vente le bon jour mais ventes autres jours → non fiable', () => {
  const sales = makeSales([
    ['2026-05-12', 15],  // mardi
    ['2026-05-13', 12],  // mercredi
  ]);
  const r = computePrediction(sales, 1); // demain = lundi → 0 vente ce jour
  expect(r.reliable).toBe(false);
  expect(r.occurrences).toBe(2);
});

test('3 occurrences du même DOW → fiable', () => {
  const sales = makeSales([
    ['2026-05-04', 10],  // lundi
    ['2026-05-11', 14],  // lundi
    ['2026-05-18', 12],  // lundi
    ['2026-05-19',  5],  // mardi
  ]);
  const r = computePrediction(sales, 1);
  expect(r.reliable).toBe(true);
  expect(r.occurrences).toBe(3);
  expect(r.qty).toBe(12); // ceil((10+14+12)/3) = 12
});

test('DOW dimanche (0) fonctionne correctement', () => {
  const sales = makeSales([
    ['2026-05-17', 30],  // dimanche
    ['2026-05-10', 28],  // dimanche
  ]);
  const r = computePrediction(sales, 0); // dow=0 (dimanche)
  expect(r.reliable).toBe(true);
  expect(r.qty).toBe(29); // ceil((30+28)/2) = 29
});

// ── Résultat ─────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passés, ${failed} échoués\n`);
if (failed > 0) process.exit(1);
