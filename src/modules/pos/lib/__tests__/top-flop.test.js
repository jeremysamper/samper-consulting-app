/**
 * Tests unitaires - logique useTopFlop
 * Exécution : node src/modules/pos/lib/__tests__/top-flop.test.js
 */

// ── Mini runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
function test(label, fn) {
  try { fn(); console.log(`  ✅ ${label}`); passed++; }
  catch (e) { console.error(`  ❌ ${label}\n     ${e.message}`); failed++; }
}
function expect(val) {
  return {
    toBe:       (exp) => { if (val !== exp) throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`); },
    toBeNull:   ()    => { if (val !== null) throw new Error(`Expected null, got ${JSON.stringify(val)}`); },
    toBeTruthy: ()    => { if (!val) throw new Error(`Expected truthy, got ${JSON.stringify(val)}`); },
    toBeFalsy:  ()    => { if (val)  throw new Error(`Expected falsy, got ${JSON.stringify(val)}`); },
  };
}

// ── Logique extraite ─────────────────────────────────────────────────────────

/**
 * Calcule delta et isNew pour un pos_item.
 */
function computeItemDelta(qty_A, qty_B) {
  const delta = qty_B > 0 ? Math.round((qty_A - qty_B) / qty_B * 100) : null;
  const isNew  = qty_A > 0 && qty_B === 0;
  return { qty_A, qty_B, delta, isNew };
}

/**
 * Applique le filtre top/flop sur une liste triée qty_A desc.
 * @param {Array}  items
 * @param {'all'|'top10'|'flop10'} filter
 * @returns {Array}
 */
function applyFilter(items, filter) {
  if (filter === 'top10')  return items.slice(0, 10);
  if (filter === 'flop10') return [...items].reverse().slice(0, 10).reverse();
  return items;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

console.log('\n📊 useTopFlop - Tests\n');

test('Delta positif - +50%', () => {
  const { delta } = computeItemDelta(30, 20);
  expect(delta).toBe(50);
});

test('Delta négatif - -25%', () => {
  const { delta } = computeItemDelta(15, 20);
  expect(delta).toBe(-25);
});

test('Delta nul - pas de variation', () => {
  const { delta } = computeItemDelta(20, 20);
  expect(delta).toBe(0);
});

test('Nouveau plat (qty_B=0, qty_A>0) → delta=null, isNew=true', () => {
  const r = computeItemDelta(12, 0);
  expect(r.delta).toBeNull();
  expect(r.isNew).toBeTruthy();
});

test('Aucune vente (qty_A=0, qty_B=0) → delta=null, isNew=false', () => {
  const r = computeItemDelta(0, 0);
  expect(r.delta).toBeNull();
  expect(r.isNew).toBeFalsy();
});

test('Filtre top10 retourne les 10 premiers éléments', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ posItemId: String(i), qty_A: 15 - i }));
  const top = applyFilter(items, 'top10');
  expect(top.length).toBe(10);
  expect(top[0].qty_A).toBe(15);
});

test('Filtre flop10 retourne les 10 items avec les plus faibles qty_A, ordre décroissant', () => {
  // items : qty_A = 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1
  const items = Array.from({ length: 15 }, (_, i) => ({ posItemId: String(i), qty_A: 15 - i }));
  const flop = applyFilter(items, 'flop10');
  expect(flop.length).toBe(10);
  // Les 10 plus faibles sont qty_A 1..10 ; remis en décroissant → [10, 9, 8, ..., 1]
  expect(flop[0].qty_A).toBe(10);
});

test('Filtre "all" retourne tous les éléments', () => {
  const items = Array.from({ length: 15 }, (_, i) => ({ posItemId: String(i) }));
  const all = applyFilter(items, 'all');
  expect(all.length).toBe(15);
});

// ── Résultat ─────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passés, ${failed} échoués\n`);
if (failed > 0) process.exit(1);
