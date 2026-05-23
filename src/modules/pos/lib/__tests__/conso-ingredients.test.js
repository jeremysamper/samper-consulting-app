/**
 * Tests unitaires — logique useConsoIngredients (normalisation + calcul)
 * Exécution : node src/modules/pos/lib/__tests__/conso-ingredients.test.js
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
    toBeCloseTo: (exp, dec = 2) => {
      const factor = Math.pow(10, dec);
      if (Math.round(val * factor) !== Math.round(exp * factor))
        throw new Error(`Expected ~${exp} (±1e-${dec}), got ${val}`);
    },
    toEqual: (exp) => {
      if (JSON.stringify(val) !== JSON.stringify(exp))
        throw new Error(`Expected ${JSON.stringify(exp)}, got ${JSON.stringify(val)}`);
    },
  };
}

// ── normalizeQty (copie locale pour les tests) ────────────────────────────────

function normalizeQty(raw, unite) {
  if (unite === 'g' && raw >= 500) {
    return { quantite: Math.round(raw / 10) / 100, unite: 'kg' };
  }
  if (unite === 'ml' && raw >= 500) {
    return { quantite: Math.round(raw / 10) / 100, unite: 'L' };
  }
  return { quantite: Math.round(raw * 10) / 10, unite };
}

// ── calcConsoIngredients (logique pure, sans Supabase) ───────────────────────

/**
 * @param {Array<{posItemId, qtySold}>}      ventes
 * @param {Object}                           mappingByItem   posItemId → recipeId
 * @param {Object}                           recetteById     recipeId → {portions, ingredients[]}
 * @returns {{ items: [{nom, quantite, unite}], excluded: number }}
 */
function calcConsoIngredients(ventes, mappingByItem, recetteById) {
  const acc = new Map();
  let excluded = 0;

  for (const { posItemId, qtySold } of ventes) {
    const recipeId = mappingByItem[posItemId];
    const recette  = recetteById[recipeId];

    if (!recette || !(recette.portions > 0)) { excluded++; continue; }

    for (const ing of (recette.ingredients ?? [])) {
      const nom        = (ing.nom   ?? '').trim();
      const unite      = (ing.unite ?? '').trim();
      const qteRecette = Number(ing.quantite ?? 0);
      if (!nom || !unite || qteRecette <= 0) continue;

      const conso = qtySold * (qteRecette / recette.portions);
      const key   = `${nom}|${unite}`;
      if (acc.has(key)) acc.get(key).raw += conso;
      else              acc.set(key, { nom, unite, raw: conso });
    }
  }

  const result = [];
  for (const { nom, unite, raw } of acc.values()) {
    const { quantite, unite: u } = normalizeQty(raw, unite);
    result.push({ nom, quantite, unite: u, _raw: raw });
  }
  result.sort((a, b) => b._raw - a._raw);

  return {
    items: result.map(({ nom, quantite, unite }) => ({ nom, quantite, unite })),
    excluded,
  };
}

// ── Tests normalizeQty ────────────────────────────────────────────────────────

console.log('\n🥗 useConsoIngredients — Tests normalisation\n');

test('g < 500 → reste en g', () => {
  const r = normalizeQty(450, 'g');
  expect(r.unite).toBe('g');
  expect(r.quantite).toBe(450);
});

test('g = 499 → reste en g (seuil non atteint)', () => {
  const r = normalizeQty(499, 'g');
  expect(r.unite).toBe('g');
});

test('g = 500 → converti en kg', () => {
  const r = normalizeQty(500, 'g');
  expect(r.unite).toBe('kg');
  expect(r.quantite).toBe(0.5);
});

test('g = 1234 → 1.23 kg', () => {
  const r = normalizeQty(1234, 'g');
  expect(r.unite).toBe('kg');
  expect(r.quantite).toBeCloseTo(1.23, 2);
});

test('ml < 500 → reste en ml', () => {
  const r = normalizeQty(250, 'ml');
  expect(r.unite).toBe('ml');
  expect(r.quantite).toBe(250);
});

test('ml = 750 → 0.75 L', () => {
  const r = normalizeQty(750, 'ml');
  expect(r.unite).toBe('L');
  expect(r.quantite).toBeCloseTo(0.75, 2);
});

test('pcs reste en pcs peu importe la quantité', () => {
  const r = normalizeQty(1200, 'pcs');
  expect(r.unite).toBe('pcs');
  expect(r.quantite).toBe(1200);
});

// ── Tests calcConsoIngredients ────────────────────────────────────────────────

console.log('\n🥗 useConsoIngredients — Tests calcul\n');

test('Calcul correct sur 1 plat — 5 portions vendues', () => {
  const ventes   = [{ posItemId: 'p1', qtySold: 5 }];
  const mapping  = { p1: 'r1' };
  const recettes = {
    r1: {
      portions: 4,
      ingredients: [{ nom: 'Bœuf', unite: 'g', quantite: 800 }],
    },
  };
  // conso = 5 × (800 / 4) = 1000g → 1.0 kg
  const { items } = calcConsoIngredients(ventes, mapping, recettes);
  expect(items.length).toBe(1);
  expect(items[0].nom).toBe('Bœuf');
  expect(items[0].unite).toBe('kg');
  expect(items[0].quantite).toBeCloseTo(1.0, 2);
});

test('Agrégation multi-plats sur même ingrédient', () => {
  const ventes = [
    { posItemId: 'p1', qtySold: 10 },  // Tartare: 200g bœuf / 2 portions = 100g/portion → 1000g
    { posItemId: 'p2', qtySold:  5 },  // Joue:    600g bœuf / 2 portions = 300g/portion → 1500g
  ];
  const mapping  = { p1: 'r1', p2: 'r2' };
  const recettes = {
    r1: { portions: 2, ingredients: [{ nom: 'Bœuf', unite: 'g', quantite: 200 }] },
    r2: { portions: 2, ingredients: [{ nom: 'Bœuf', unite: 'g', quantite: 600 }] },
  };
  // Total bœuf = 1000 + 1500 = 2500g → 2.5 kg
  const { items } = calcConsoIngredients(ventes, mapping, recettes);
  expect(items.length).toBe(1);
  expect(items[0].nom).toBe('Bœuf');
  expect(items[0].unite).toBe('kg');
  expect(items[0].quantite).toBeCloseTo(2.5, 2);
});

test('Recette sans portions → exclue + excluded++', () => {
  const ventes   = [{ posItemId: 'p1', qtySold: 5 }];
  const mapping  = { p1: 'r1' };
  const recettes = {
    r1: { portions: 0, ingredients: [{ nom: 'Farine', unite: 'g', quantite: 200 }] },
  };
  const { items, excluded } = calcConsoIngredients(ventes, mapping, recettes);
  expect(items.length).toBe(0);
  expect(excluded).toBe(1);
});

test('Recette avec portions=null → exclue', () => {
  const ventes   = [{ posItemId: 'p1', qtySold: 3 }];
  const mapping  = { p1: 'r1' };
  const recettes = {
    r1: { portions: null, ingredients: [{ nom: 'Sel', unite: 'g', quantite: 10 }] },
  };
  const { excluded } = calcConsoIngredients(ventes, mapping, recettes);
  expect(excluded).toBe(1);
});

test('Ingrédient avec quantite=0 ignoré', () => {
  const ventes   = [{ posItemId: 'p1', qtySold: 10 }];
  const mapping  = { p1: 'r1' };
  const recettes = {
    r1: {
      portions: 4,
      ingredients: [
        { nom: 'Huile', unite: 'ml', quantite: 0 },
        { nom: 'Sel',   unite: 'g',  quantite: 5  },
      ],
    },
  };
  const { items } = calcConsoIngredients(ventes, mapping, recettes);
  expect(items.length).toBe(1);
  expect(items[0].nom).toBe('Sel');
});

test('Tri par raw décroissant', () => {
  const ventes   = [{ posItemId: 'p1', qtySold: 10 }];
  const mapping  = { p1: 'r1' };
  const recettes = {
    r1: {
      portions: 1,
      ingredients: [
        { nom: 'Farine', unite: 'g', quantite: 100 },
        { nom: 'Bœuf',   unite: 'g', quantite: 300 },
        { nom: 'Sel',     unite: 'g', quantite: 10  },
      ],
    },
  };
  const { items } = calcConsoIngredients(ventes, mapping, recettes);
  // Bœuf 3000g > Farine 1000g > Sel 100g
  expect(items[0].nom).toBe('Bœuf');
  expect(items[1].nom).toBe('Farine');
  expect(items[2].nom).toBe('Sel');
});

// ── Résultat ─────────────────────────────────────────────────────────────────
console.log(`\n  ${passed} passés, ${failed} échoués\n`);
if (failed > 0) process.exit(1);
