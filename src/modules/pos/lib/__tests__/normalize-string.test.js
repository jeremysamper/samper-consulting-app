/**
 * normalize-string.test.js — Tests unitaires (11 cas)
 *
 * Runner autonome — exécutable directement avec Node.js ESM :
 *   node src/modules/pos/lib/__tests__/normalize-string.test.js
 *
 * Compatible Vitest si ajouté au projet :
 *   npx vitest run src/modules/pos/lib/__tests__/
 */

import { normalizeString } from '../normalize-string.js';

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
  if (actual !== expected) {
    throw new Error(`Expected "${expected}", got "${actual}"`);
  }
}

// ── Tests ─────────────────────────────────────────────────────────
console.log('\n📐 normalize-string.js — 11 tests\n');

test('Lowercase pur', () =>
  eq(normalizeString('BOUILLABAISSE'), 'bouillabaisse'));

test('Suppression accents (é, è, ê)', () =>
  eq(normalizeString('Côte de bœuf'), 'cote boeuf'));

test('Ligature œ → oe', () =>
  eq(normalizeString('Bœuf bourguignon'), 'boeuf bourguignon'));

test('Ligature æ → ae', () =>
  eq(normalizeString('Salade niçoise'), 'salade nicoise'));

test('Stop-word "au" retiré — cas brief', () =>
  eq(normalizeString('Risotto au safran'), 'risotto safran'));

test('Stop-words "de", "à", "l\'" retirés — cas brief', () =>
  eq(normalizeString("Tartare de bœuf à l'italienne"), 'tartare boeuf italienne'));

test('Ponctuation et apostrophe supprimées', () =>
  eq(normalizeString('Salade, César!'), 'salade cesar'));

test('Espaces multiples nettoyés', () =>
  eq(normalizeString('Soupe   du   jour'), 'soupe jour'));

test('Chaîne vide → vide', () =>
  eq(normalizeString(''), ''));

test('null → vide (robustesse)', () =>
  eq(normalizeString(null), ''));

test('Que des stop-words → vide', () =>
  eq(normalizeString('le la les de du'), ''));

test('Chiffres conservés', () =>
  eq(normalizeString('Formule 3 plats'), 'formule 3 plats'));

// ── Résultat ─────────────────────────────────────────────────────
console.log(`\n${pass + fail} tests : ${pass} ✅  ${fail} ❌\n`);
if (fail > 0) process.exit(1);
