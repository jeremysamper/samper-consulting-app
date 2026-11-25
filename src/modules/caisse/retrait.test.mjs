// node --test : vente à emporter et commande d'avance (retrait.js, lot 01).
// La table CAS_LIBELLE se rejoue telle quelle contre caisse_libelle_retrait
// dans l'essai à blanc de la migration : les deux libellés sont égaux.
import test from 'node:test';
import assert from 'node:assert/strict';
import { heurePromiseIso, libelleRetrait, nomRetraitValide, reperesRetrait } from './retrait.js';

const LONG = 'Maximilienne Zurbriggen-Favre de la Combe';

export const CAS_LIBELLE = [
  [{ numero: 12, nom: 'Léa', aEmporter: true, heure: '2026-11-25T11:30:00Z' }, 'Retrait 12, Léa, à emporter, 12:30'],
  [{ numero: 12, aEmporter: true, heure: '2026-11-25T11:30:00Z' }, 'Retrait 12, à emporter, 12:30'],
  [{ numero: 3, nom: 'Léa', aEmporter: true }, 'Retrait 3, Léa, à emporter'],
  [{ numero: 3, nom: 'Léa', heure: '2026-11-25T11:30:00Z' }, 'Retrait 3, Léa, 12:30'],
  [{ numero: 3 }, 'Retrait 3'],
  [{ test: true, numero: null, nom: 'Léa', aEmporter: true }, 'TEST Direct'],
  [{ numero: 128, nom: LONG, aEmporter: true }, 'Retrait 128, Maximilienne Zurbriggen-Favre de la Comb, à emporter'],
  [{ numero: 4, nom: '1234' }, 'Retrait 4, 1234'],
  [{ nom: '1234' }, 'Direct, 1234'],
  [{}, 'Direct'],
  [{ numero: 7, nom: '   ' }, 'Retrait 7'],
  [{ numero: 7, heure: '2026-07-15T10:05:00Z' }, 'Retrait 7, 12:05'],
  [{ numero: 7, heure: '2026-01-15T10:05:00Z' }, 'Retrait 7, 11:05'],
];

test('libellé du bon : chaque cas de la table', () => {
  for (const [entree, attendu] of CAS_LIBELLE) assert.equal(libelleRetrait(entree), attendu, JSON.stringify(entree));
});

test('libellé : nom coupé à 40 caractères, jamais des chiffres seuls', () => {
  const l = libelleRetrait({ numero: 1, nom: LONG });
  assert.equal(l.split(', ')[1].length, 40);
  assert.equal(libelleRetrait({ numero: 1, nom: 'a'.repeat(39) + ' bcd' }), 'Retrait 1, ' + 'a'.repeat(39));
  for (const [entree] of CAS_LIBELLE) assert.doesNotMatch(libelleRetrait(entree), /^\d+$/);
  assert.doesNotMatch(libelleRetrait({ nom: '42' }), /^\d+$/);
});

test('libellé : heure d\'été et heure d\'hiver rendues à Zurich', () => {
  assert.match(libelleRetrait({ numero: 1, heure: '2026-07-15T18:00:00Z' }), /20:00$/);
  assert.match(libelleRetrait({ numero: 1, heure: '2026-12-15T18:00:00Z' }), /19:00$/);
});

test('nom : vide ou fait d\'espaces rendu nul, espaces resserrés, 120 au plus', () => {
  assert.equal(nomRetraitValide(''), null);
  assert.equal(nomRetraitValide('    '), null);
  assert.equal(nomRetraitValide(null), null);
  assert.equal(nomRetraitValide('  Léa   Martin '), 'Léa Martin');
  assert.equal(nomRetraitValide('a'.repeat(200)).length, 120);
});

test('heure promise : aujourd\'hui à Zurich, passé de plus de cinq minutes refusé', () => {
  const midi = new Date('2026-11-25T11:00:00Z'); // 12:00 à Zurich
  assert.equal(heurePromiseIso('12:30', midi), '2026-11-25T11:30:00.000Z');
  assert.equal(heurePromiseIso('11:56', midi), '2026-11-25T10:56:00.000Z');
  assert.equal(heurePromiseIso('11:50', midi), null);
  assert.equal(heurePromiseIso('', midi), null);
  assert.equal(heurePromiseIso('25:00', midi), null);
  // Autour de minuit : à 23:50, « 00:10 » est aujourd'hui 00:10, donc passé.
  const tard = new Date('2026-11-25T22:50:00Z'); // 23:50 à Zurich
  assert.equal(heurePromiseIso('00:10', tard), null);
  assert.equal(heurePromiseIso('23:58', tard), '2026-11-25T22:58:00.000Z');
  // Heure d'été.
  assert.equal(heurePromiseIso('18:00', new Date('2026-07-15T10:00:00Z')), '2026-07-15T16:00:00.000Z');
});

test('repères : vides pour un ticket sans rien, de table ou de test', () => {
  assert.equal(reperesRetrait({ table_id: null }).vide, true);
  assert.equal(reperesRetrait(null).vide, true);
  const table = reperesRetrait({ table_id: 't1', retrait_numero: 4, retrait_nom: 'Léa', a_emporter: true });
  assert.equal(table.vide, true);
  assert.equal(table.numero, null);
  assert.equal(reperesRetrait({ table_id: null, test: true, a_emporter: true }).vide, true);
});

test('repères : numéro, nom, heure de Zurich et à emporter', () => {
  const r = reperesRetrait({ table_id: null, retrait_numero: 12, retrait_nom: ' Léa ', retrait_heure: '2026-11-25T11:30:00Z', a_emporter: true });
  assert.deepEqual(r, { numero: 12, nom: 'Léa', heure: '12:30', aEmporter: true, vide: false });
  assert.equal(reperesRetrait({ table_id: null, a_emporter: true }).vide, false);
});
