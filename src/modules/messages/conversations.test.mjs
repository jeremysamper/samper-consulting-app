// node --test : formats et regroupements de la messagerie (conversations.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnnuaire, buildContacts, groupConversations } from './conversations.js';

const p = (id, prenom, nom, actif = true) => ({ id, prenom, nom, email: `${id}@test.ch`, actif });
const profiles = [
  p('moi', 'Léa', 'Cuisine'),
  p('z', 'Zoé', 'Extra'),
  p('e', 'Émile', 'Salle'),
  p('a', 'Anne', 'Patron'),
  p('x', 'Paul', 'Parti', false),
  p('n', 'Noé', 'Salle'),
];
const profileById = new Map(profiles.map((x) => [x.id, x]));
const m = (id, de, a, jour, lu = true) => ({ id, senderId: de, recipientId: a, message: id, createdAt: `2026-11-${jour}T10:00:00Z`, readAt: lu ? `2026-11-${jour}T10:01:00Z` : null });

test('annuaire : comptes actifs, sans soi, par ordre alphabétique, accents compris', () => {
  const noms = buildAnnuaire({ profiles, userId: 'moi' }).map((x) => x.id);
  assert.deepEqual(noms, ['a', 'e', 'n', 'z']);
});

test('annuaire : le compte désactivé n\'y est jamais, même cherché', () => {
  assert.deepEqual(buildAnnuaire({ profiles, userId: 'moi', search: 'Paul' }), []);
});

test('annuaire : recherche sans accents, sur le nom et l\'adresse', () => {
  assert.deepEqual(buildAnnuaire({ profiles, userId: 'moi', search: 'emile' }).map((x) => x.id), ['e']);
  assert.deepEqual(buildAnnuaire({ profiles, userId: 'moi', search: 'n@test' }).map((x) => x.id), ['n']);
  assert.deepEqual(buildAnnuaire({ profiles, userId: 'moi', search: '  ' }).length, 4);
});

test('conversations : ordre inchangé, conversations récentes d\'abord puis les autres par nom', () => {
  const messages = [m('3', 'z', 'moi', '11', false), m('2', 'moi', 'n', '10'), m('1', 'x', 'moi', '09')];
  const conversations = groupConversations(messages, 'moi');
  const rows = buildContacts({ conversations, profiles, profileById, userId: 'moi', search: '' });
  assert.deepEqual(rows.map((r) => r.id), ['z', 'n', 'x', 'a', 'e']);
  assert.equal(rows[0].unread, 1);
  assert.equal(rows[1].unread, 0);
});
