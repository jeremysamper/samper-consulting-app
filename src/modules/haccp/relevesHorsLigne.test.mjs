import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  elementDeFile, fusionnerEnAttente, issueRejeu, nouvelIdReleve,
  phraseAttente, phraseGardes, phraseRefus, rejouerFile,
} from './relevesHorsLigne.js';

const releve = (id, date, heure, extra = {}) => ({ id, etablissementId: 'e1', zoneId: 'z1', date, heure, valeur: 3.5, operateur: 'u1', conforme: true, commentaire: '', ...extra });
const el = (id, createdAt, extra = {}) => ({ ...releve(id, '2026-11-25', '14:02'), zoneNom: 'Frigo 2', userId: 'u1', createdAt, attempts: 0, ...extra });

test('nouvelIdReleve préfixe hr- et deux appels diffèrent', () => {
  const a = nouvelIdReleve(globalThis.crypto.randomUUID());
  const b = nouvelIdReleve(globalThis.crypto.randomUUID());
  assert.ok(a.startsWith('hr-'));
  assert.notEqual(a, b);
});

test('elementDeFile garde date et heure du geste, attempts 0 et userId', () => {
  const e = elementDeFile(releve('hr-1', '2026-11-25', '06:10'), { userId: 'u1', maintenantMs: 99, zoneNom: 'Frigo 1' });
  assert.equal(e.date, '2026-11-25');
  assert.equal(e.heure, '06:10');
  assert.equal(e.attempts, 0);
  assert.equal(e.userId, 'u1');
  assert.equal(e.createdAt, 99);
  assert.equal(e.zoneNom, 'Frigo 1');
});

test('fusionnerEnAttente : doublon, autre établissement, ordre, liste vide', () => {
  const serveur = [releve('a', '2026-11-24', '08:00'), releve('b', '2026-11-25', '07:00')];
  const file = [el('b', 1), el('c', 2, { etablissementId: 'e2' }), el('d', 3, { heure: '09:00' })];
  const out = fusionnerEnAttente(serveur, file, 'e1');
  assert.deepEqual(out.map((r) => r.id), ['d', 'b', 'a']);
  assert.equal(out.find((r) => r.id === 'b').enAttente, undefined);
  assert.equal(out.find((r) => r.id === 'd').enAttente, true);
  const vide = fusionnerEnAttente([], [el('x', 1), el('y', 2)], 'e1');
  assert.equal(vide.length, 2);
  assert.ok(vide.every((r) => r.enAttente === true));
});

test('fusionnerEnAttente avec ecritsSession', () => {
  const ecrit = releve('s1', '2026-11-25', '10:00');
  const absent = fusionnerEnAttente([releve('a', '2026-11-24', '08:00')], [], 'e1', [ecrit]);
  assert.equal(absent.filter((r) => r.id === 's1').length, 1);
  assert.equal(absent.find((r) => r.id === 's1').enAttente, undefined);
  const present = fusionnerEnAttente([ecrit], [], 'e1', [ecrit]);
  assert.equal(present.filter((r) => r.id === 's1').length, 1);
});

test('issueRejeu', () => {
  assert.equal(issueRejeu(null, 0), 'envoye');
  assert.equal(issueRejeu(new Error('Failed to fetch'), 0), 'reessayer');
  assert.equal(issueRejeu({ code: 'PGRST301' }, 0), 'reessayer');
  assert.equal(issueRejeu({ code: '23503' }, 0), 'refuse');
  assert.equal(issueRejeu({ code: '42501' }, 0), 'refuse');
  assert.equal(issueRejeu({ code: 'XX999' }, 8), 'tentative');
  assert.equal(issueRejeu({ code: 'XX999' }, 9), 'refuse');
});

function faux(reponses) {
  const journal = { envoyer: [], retirer: [], garder: [], avertir: [] };
  return {
    journal,
    deps: {
      envoyer: async (e) => { journal.envoyer.push(e.id); return reponses[e.id] || { error: null }; },
      retirer: async (id) => { journal.retirer.push(id); },
      garder: async (e) => { journal.garder.push(e); },
      avertir: async (e) => { journal.avertir.push(e.id); },
    },
  };
}

test('rejouerFile : un refus au milieu', async () => {
  const { journal, deps } = faux({ b: { error: { code: '23503' } } });
  const res = await rejouerFile({ elements: [el('c', 3), el('a', 1), el('b', 2)], ...deps });
  assert.deepEqual(journal.retirer, ['a', 'b', 'c']);
  assert.deepEqual(journal.avertir, ['b']);
  assert.deepEqual(res, { envoyes: 2, refuses: 1, restants: 0 });
});

test('rejouerFile : panne réseau sur le premier', async () => {
  const { journal, deps } = faux({ a: { error: new Error('Failed to fetch') } });
  await rejouerFile({ elements: [el('a', 1), el('b', 2)], ...deps });
  assert.deepEqual(journal.envoyer, ['a']);
  assert.equal(journal.retirer.length, 0);
  assert.equal(journal.garder.length, 0);
});

test('rejouerFile : code inconnu compte une tentative et passe au suivant', async () => {
  const { journal, deps } = faux({ a: { error: { code: 'XX999' } } });
  await rejouerFile({ elements: [el('a', 1, { attempts: 2 }), el('b', 2)], ...deps });
  assert.equal(journal.garder.length, 1);
  assert.equal(journal.garder[0].attempts, 3);
  assert.deepEqual(journal.envoyer, ['a', 'b']);
  assert.deepEqual(journal.retirer, ['b']);
});

test('rejouerFile : doublon ignoré par la base, retiré sans avis', async () => {
  const { journal, deps } = faux({ a: { error: null } });
  await rejouerFile({ elements: [el('a', 1)], ...deps });
  assert.deepEqual(journal.retirer, ['a']);
  assert.equal(journal.avertir.length, 0);
});

test('phrases', () => {
  assert.equal(phraseAttente(1), '1 relevé attend le réseau. Il partira seul.');
  assert.equal(phraseAttente(3), '3 relevés attendent le réseau. Ils partiront seuls.');
  assert.equal(phraseGardes(1, '14:02'), '1 relevé gardé sur cet appareil à 14:02. Il partira au retour du réseau.');
  assert.equal(phraseGardes(3, '14:02'), '3 relevés gardés sur cet appareil à 14:02. Ils partiront au retour du réseau.');
  const p = phraseRefus(el('a', 1));
  assert.ok(p.includes('25.11'));
  assert.ok(p.includes('14:02'));
  assert.ok(p.includes('Frigo 2'));
  assert.ok(p.includes('3,5'));
});
