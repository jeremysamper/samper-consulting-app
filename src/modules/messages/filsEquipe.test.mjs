import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FILS_EQUIPE, equipeDuSoir, estDuSoir, filsDuRole, lireCanauxLus, nonLusDuFil, participe, resumeFils,
} from './filsEquipe.js';

test('les fils de chaque rôle suivent canal_participant', () => {
  assert.deepEqual(filsDuRole('cuisinier').map((f) => f.canal), ['cuisine', 'tous']);
  assert.deepEqual(filsDuRole('serveur').map((f) => f.canal), ['restaurant', 'tous']);
  assert.deepEqual(filsDuRole('hote').map((f) => f.canal), ['restaurant', 'tous']);
  assert.deepEqual(filsDuRole('patron').map((f) => f.canal), FILS_EQUIPE.map((f) => f.canal));
  assert.deepEqual(filsDuRole('resp_cuisine').map((f) => f.canal), ['cuisine', 'tous']);
  assert.equal(participe('direction', 'cuisinier'), false);
  assert.equal(participe('tous', ''), false);
});

test("l'équipe du soir : horaires du jour pendant le service du soir", () => {
  const jour = '2026-11-22';
  const shifts = [
    { userId: 'a', date: jour, debut: '17:00', fin: '23:00' },
    { userId: 'b', date: jour, debut: '08:00', fin: '15:00' },
    { userId: 'c', date: jour, debut: '10:00', fin: '00:30' },
    { userId: 'd', date: '2026-11-23', debut: '17:00', fin: '23:00' },
    { userId: 'e', date: jour, debut: '11:00', fin: '19:30' },
    { userId: 'a', date: jour, debut: '10:00', fin: '14:00' },
  ];
  assert.deepEqual(equipeDuSoir(shifts, jour).sort(), ['a', 'c', 'e']);
  assert.deepEqual(equipeDuSoir(shifts, jour, { sauf: 'a' }).sort(), ['c', 'e']);
  assert.equal(estDuSoir({ debut: '', fin: '' }), false);
});

test('non-lus : depuis la dernière lecture, sans ses propres messages', () => {
  const msgs = [
    { id: 1, canal: 'cuisine', createdBy: 'moi', createdAt: '2026-11-22T10:00:00Z' },
    { id: 2, canal: 'cuisine', createdBy: 'lui', createdAt: '2026-11-22T11:00:00Z' },
    { id: 3, canal: 'cuisine', createdBy: 'lui', createdAt: '2026-11-21T11:00:00Z' },
  ];
  assert.equal(nonLusDuFil(msgs, { lu: '2026-11-22T10:30:00Z', moi: 'moi' }), 1);
  assert.equal(nonLusDuFil(msgs, { moi: 'moi', depuis: '2026-11-22T00:00:00Z' }), 1);
  const r = resumeFils({ role: 'cuisinier', messages: msgs, etabId: 'e1', moi: 'moi', lus: { 'e1:cuisine': '2026-11-22T12:00:00Z' } });
  assert.equal(r[0].canal, 'cuisine');
  assert.equal(r[0].dernier.id, 2);
  assert.equal(r[0].nonLus, 0);
  assert.equal(r[1].dernier, null);
});

test('lecture prudente de canaux_lus', () => {
  assert.deepEqual(lireCanauxLus({ 'e1:tous': '2026-11-22T10:00:00Z', 'e1:x': 'pas une date', y: 3 }), { 'e1:tous': '2026-11-22T10:00:00Z' });
  assert.deepEqual(lireCanauxLus(null), {});
});
