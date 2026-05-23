// deno test supabase/functions/_shared/__tests__/timezone.test.ts

import { assertEquals, assertThrows } from 'jsr:@std/assert';
import { utcToLocalDateString, localDateToUtcRange } from '../timezone.ts';

// ── utcToLocalDateString ──────────────────────────────────────────

Deno.test('UTC+2 (été CEST) : 22:45 UTC → lendemain local', () => {
  // 2026-05-22T22:45:00Z = 2026-05-23T00:45:00 CEST
  assertEquals(
    utcToLocalDateString('2026-05-22T22:45:00Z', 'Europe/Zurich'),
    '2026-05-23'
  );
});

Deno.test('UTC+2 (été CEST) : 21:45 UTC → même jour local', () => {
  // 2026-05-22T21:45:00Z = 2026-05-22T23:45:00 CEST
  assertEquals(
    utcToLocalDateString('2026-05-22T21:45:00Z', 'Europe/Zurich'),
    '2026-05-22'
  );
});

Deno.test('UTC+1 (hiver CET) : 22:45 UTC → lendemain local', () => {
  // 2026-01-15T22:45:00Z = 2026-01-15T23:45:00 CET → même jour
  // mais 2026-01-15T23:45:00Z = 2026-01-16T00:45:00 CET → lendemain
  assertEquals(
    utcToLocalDateString('2026-01-15T23:45:00Z', 'Europe/Zurich'),
    '2026-01-16'
  );
});

Deno.test('UTC+1 (hiver CET) : 22:30 UTC → même jour local', () => {
  // 2026-01-15T22:30:00Z = 2026-01-15T23:30:00 CET → même jour
  assertEquals(
    utcToLocalDateString('2026-01-15T22:30:00Z', 'Europe/Zurich'),
    '2026-01-15'
  );
});

Deno.test('Cas limite minuit UTC = 02:00 local (été)', () => {
  // 2026-05-22T00:00:00Z = 2026-05-22T02:00:00 CEST → même jour
  assertEquals(
    utcToLocalDateString('2026-05-22T00:00:00Z', 'Europe/Zurich'),
    '2026-05-22'
  );
});

Deno.test('Fallback Europe/Zurich si timezone invalide', () => {
  // Doit retourner une date valide sans lever d'exception
  const result = utcToLocalDateString('2026-05-22T10:00:00Z', 'Invalid/Timezone');
  assertEquals(result.length, 10); // "YYYY-MM-DD"
  assertEquals(result.slice(0, 4), '2026');
});

Deno.test('Lève une erreur si timestamp invalide', () => {
  assertThrows(
    () => utcToLocalDateString('not-a-date', 'Europe/Zurich'),
    Error,
    'timestamp invalide'
  );
});

// ── localDateToUtcRange ───────────────────────────────────────────

Deno.test('localDateToUtcRange : 2026-05-22 → bornes UTC (été, UTC+2)', () => {
  const { from, to } = localDateToUtcRange('2026-05-22', 'Europe/Zurich');

  // Minuit CEST = 22:00 UTC la veille
  assertEquals(from, '2026-05-21T22:00:00.000Z');
  // 23:59:59.999 CEST = 21:59:59.999 UTC
  assertEquals(to, '2026-05-22T21:59:59.999Z');
});

Deno.test('localDateToUtcRange : 2026-01-15 → bornes UTC (hiver, UTC+1)', () => {
  const { from, to } = localDateToUtcRange('2026-01-15', 'Europe/Zurich');

  // Minuit CET = 23:00 UTC la veille
  assertEquals(from, '2026-01-14T23:00:00.000Z');
  // 23:59:59.999 CET = 22:59:59.999 UTC
  assertEquals(to, '2026-01-15T22:59:59.999Z');
});

Deno.test('round-trip : from+to couvrent exactement 24h', () => {
  const { from, to } = localDateToUtcRange('2026-05-22', 'Europe/Zurich');
  const diff = new Date(to).getTime() - new Date(from).getTime();
  // 24h - 1ms = 86399999ms
  assertEquals(diff, 86_399_999);
});
