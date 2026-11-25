// node --test : règle de pension (pension.js), lue par Repas hôtel et par la
// prévision des couverts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pensionComprend, sejourMange } from './pension.js';

const J = '2026-11-19';
const sejour = (o = {}) => ({ statut: 'en_maison', pension: 'complete', arrivee: '2026-11-18', depart: '2026-11-20', ...o });

test('ce que comprend chaque pension', () => {
  assert.equal(pensionComprend('aucune', 'petit_dejeuner'), false);
  assert.equal(pensionComprend('petit_dejeuner', 'petit_dejeuner'), true);
  assert.equal(pensionComprend('petit_dejeuner', 'diner'), false);
  assert.equal(pensionComprend('demi', 'diner'), true);
  assert.equal(pensionComprend('demi', 'dejeuner'), false);
  assert.equal(pensionComprend('complete', 'dejeuner'), true);
  assert.equal(pensionComprend('all_inclusive', 'diner'), true);
});

test("jour d'arrivée : déjeuner et dîner, pas de petit-déjeuner", () => {
  const s = sejour({ arrivee: J, depart: '2026-11-21' });
  assert.equal(sejourMange(s, J, 'petit_dejeuner'), false);
  assert.equal(sejourMange(s, J, 'dejeuner'), true);
  assert.equal(sejourMange(s, J, 'diner'), true);
});

test('jour de départ : petit-déjeuner seulement', () => {
  const s = sejour({ arrivee: '2026-11-17', depart: J });
  assert.equal(sejourMange(s, J, 'petit_dejeuner'), true);
  assert.equal(sejourMange(s, J, 'dejeuner'), false);
  assert.equal(sejourMange(s, J, 'diner'), false);
});

test("en plein séjour : les trois repas ; avant l'arrivée et après le départ : aucun", () => {
  const s = sejour();
  for (const r of ['petit_dejeuner', 'dejeuner', 'diner']) {
    assert.equal(sejourMange(s, J, r), true, r);
    assert.equal(sejourMange(s, '2026-11-17', r), false, `avant ${r}`);
    assert.equal(sejourMange(s, '2026-11-21', r), false, `après ${r}`);
  }
});

test('statuts : prévu et en maison seulement', () => {
  assert.equal(sejourMange(sejour({ statut: 'prevu' }), J, 'diner'), true);
  for (const statut of ['annule', 'no_show', 'parti']) assert.equal(sejourMange(sejour({ statut }), J, 'diner'), false, statut);
  assert.equal(sejourMange(null, J, 'diner'), false);
});
