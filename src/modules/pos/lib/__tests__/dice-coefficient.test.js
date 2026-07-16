/**
 * dice-coefficient.test.js - Tests unitaires (11 cas)
 *
 * Runner autonome :
 *   node src/modules/pos/lib/__tests__/dice-coefficient.test.js
 *
 * Compatible Vitest :
 *   npx vitest run src/modules/pos/lib/__tests__/
 */

import {
  diceCoefficient,
  diceScore,
  getMatchStatus,
  THRESHOLD_AUTO,
  THRESHOLD_SUGGESTED,
} from '../dice-coefficient.js';

// ── Mini test runner autonome ─────────────────────────────────────
let pass = 0;
let fail = 0;

function test(desc, fn) {
  try {
    fn();
    pass++;
    console.log(`  ✅ ${desc}`);
  } catch (e) {
    fail++;
    console.error(`  ❌ ${desc}`);
    console.error(`     ${e.message}`);
  }
}

function eq(actual, expected) {
  if (actual !== expected) throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function gte(actual, n) {
  if (actual < n) throw new Error(`Expected >= ${n}, got ${actual}`);
}
function lt(actual, n) {
  if (actual >= n) throw new Error(`Expected < ${n}, got ${actual}`);
}
function between(actual, lo, hi) {
  if (actual < lo || actual > hi) throw new Error(`Expected [${lo}–${hi}], got ${actual}`);
}

// ── Tests diceCoefficient (pré-normalisé) ─────────────────────────
console.log('\n🎲 dice-coefficient.js - 11 tests\n');

test('Match parfait → 100', () =>
  eq(diceCoefficient('risotto safran', 'risotto safran'), 100));

test('Chaînes sans aucun bigramme commun → 0', () =>
  eq(diceCoefficient('abc', 'xyz'), 0));

test('Chaîne vide → 0', () =>
  eq(diceCoefficient('', 'risotto'), 0));

test('null → 0 (robustesse)', () =>
  eq(diceCoefficient(null, 'risotto'), 0));

test('String 1 char (0 bigrammes) → 0', () =>
  eq(diceCoefficient('a', 'b'), 0));

test('String 2 chars identiques → 100', () =>
  eq(diceCoefficient('ab', 'ab'), 100));

// ── Tests diceScore (avec normalisation intégrée) ─────────────────

test('Cas auto ≥ 85 : "Risotto safran" ↔ "Risotto au safran"', () => {
  // "au" est stop-word → les deux normalisent en "risotto safran" → score 100
  const score = diceScore('Risotto safran', 'Risotto au safran');
  gte(score, THRESHOLD_AUTO);
});

test('Cas suggestion 50–84 : "Tartare bœuf" ↔ "Tartare de bœuf à l\'italienne"', () => {
  const score = diceScore('Tartare bœuf', "Tartare de bœuf à l'italienne");
  between(score, THRESHOLD_SUGGESTED, THRESHOLD_AUTO - 1);
});

test('Cas manuel < 50 : "Plat du jour" ↔ "Suprême de volaille"', () => {
  const score = diceScore('Plat du jour', 'Suprême de volaille');
  lt(score, THRESHOLD_SUGGESTED);
});

// ── Tests getMatchStatus ──────────────────────────────────────────

test('getMatchStatus(85) → "auto"',      () => eq(getMatchStatus(85), 'auto'));
test('getMatchStatus(84) → "suggested"', () => eq(getMatchStatus(84), 'suggested'));
test('getMatchStatus(50) → "suggested"', () => eq(getMatchStatus(50), 'suggested'));
test('getMatchStatus(49) → "manual"',    () => eq(getMatchStatus(49), 'manual'));
test('getMatchStatus(0)  → "manual"',    () => eq(getMatchStatus(0),  'manual'));

// ── Résultat ─────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests : ${pass} ✅  ${fail} ❌\n`);
if (fail > 0) process.exit(1);
