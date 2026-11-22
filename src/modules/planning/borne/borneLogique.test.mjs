// node --test : la badgeuse (borneLogique.js), sans React ni base.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_BORNE, ajouterChiffre, codeComplet, codeTropSimple, estRefusBorne, lireReponse, messageChoixCode, normaliserFile, retirerChiffre, suiteDuRejeu,
} from './borneLogique.js';

test('refus pour cause de borne : par le hint ou par le message de la base', () => {
  assert.equal(estRefusBorne({ hint: 'borne_seulement', message: 'x' }), true);
  assert.equal(estRefusBorne({ message: MESSAGE_BORNE }), true);
  assert.equal(estRefusBorne(new Error("Le pointage se fait à la borne de l'établissement.")), true);
  assert.equal(estRefusBorne({ message: 'Shift introuvable, non autorisé, ou déjà pointé' }), false);
  assert.equal(estRefusBorne(null), false);
});

test('pavé : 4 chiffres au plus, rien d\'autre', () => {
  assert.equal(ajouterChiffre('', '1'), '1');
  assert.equal(ajouterChiffre('123', '4'), '1234');
  assert.equal(ajouterChiffre('1234', '5'), '1234');
  assert.equal(ajouterChiffre('12', 'a'), '12');
  assert.equal(retirerChiffre('123'), '12');
  assert.equal(retirerChiffre(''), '');
  assert.equal(codeComplet('0482'), true);
  assert.equal(codeComplet('482'), false);
});

test('réponse : arrivée, départ, déjà, hors planning', () => {
  const a = lireReponse({ ok: true, raison: 'arrivee', type: 'arrivee', heure: '09:58', prenom: 'Lina', nom: 'Favre' });
  assert.deepEqual([a.ton, a.titre, a.nom, a.heure, a.detail], ['succes', 'Arrivée enregistrée', 'Lina Favre', '09:58', '']);
  const d = lireReponse({ ok: true, raison: 'depart', type: 'depart', heure: '17:02', prenom: 'Lina', nom: '' });
  assert.deepEqual([d.titre, d.nom, d.heure, d.detail], ['Départ enregistré', 'Lina', '17:02', 'Bonne fin de journée.']);
  const h = lireReponse({ ok: true, raison: 'arrivee', heure: '10:00', hors_planning: true });
  assert.equal(h.detail, 'Elle est ajoutée au planning.');
  const j = lireReponse({ ok: true, raison: 'deja', type: 'depart', heure: '17:02' });
  assert.deepEqual([j.ton, j.titre, j.heure], ['info', 'Départ déjà enregistré', '17:02']);
  assert.equal(lireReponse({ ok: true, raison: 'deja', doublon: true }).titre, 'Pointage déjà enregistré');
});

test('réponse : aucune phrase ne porte de chiffre (glossaire), le chiffre va dans valeur', () => {
  const f = lireReponse({ ok: false, raison: 'code_faux', restants: 3 });
  assert.deepEqual([f.detail, f.valeur], ['Essais restants avant une pause :', '3']);
  assert.match(lireReponse({ ok: false, raison: 'code_faux', restants: 0 }).detail, /attend/);
  const att = lireReponse({ ok: false, raison: 'attente', secondes: 241 });
  assert.deepEqual([att.detail, att.valeur, att.attenteSecondes], ['Réessayez dans', '5 min', 241]);
  for (const r of [{ raison: 'revoquee' }, { raison: 'borne_inconnue' }, { raison: 'hors_fenetre' }, { raison: 'hors_ligne' }, { ok: true, raison: 'arrivee', heure: '08:00' }, null]) {
    const l = lireReponse(r);
    assert.doesNotMatch(`${l.titre} ${l.detail}`, /[0-9]/);
  }
  assert.equal(lireReponse({ ok: false, raison: 'revoquee' }).oublier, true);
  assert.equal(lireReponse({ ok: false, raison: 'borne_inconnue' }).oublier, true);
  assert.equal(lireReponse({ ok: false, raison: 'code_faux' }).oublier, undefined);
  assert.equal(lireReponse(null).ton, 'erreur');
  assert.equal(lireReponse({ raison: 'hors_ligne' }).titre, 'Pointage gardé sur la borne');
});

test('file hors ligne : suite du rejeu selon la réponse', () => {
  assert.equal(suiteDuRejeu({ ok: true, raison: 'arrivee' }), 'retirer');
  assert.equal(suiteDuRejeu({ ok: false, raison: 'code_faux' }), 'retirer');
  assert.equal(suiteDuRejeu({ ok: true, raison: 'deja', doublon: true }), 'retirer');
  assert.equal(suiteDuRejeu({ ok: false, raison: 'hors_fenetre' }), 'retirer');
  assert.equal(suiteDuRejeu({ ok: false, raison: 'attente', secondes: 30 }), 'attendre');
  assert.equal(suiteDuRejeu({ ok: false, raison: 'revoquee' }), 'oublier');
  assert.equal(suiteDuRejeu(undefined), 'attendre');
});

test('file hors ligne : lecture prudente, ordre du geste', () => {
  const f = normaliserFile([
    { clientUuid: 'b', code: '4826', eventAt: '2026-11-22T10:05:00Z' },
    { clientUuid: 'a', code: '5937', eventAt: '2026-11-22T10:00:00Z' },
    { clientUuid: 'c', code: '12', eventAt: '2026-11-22T10:01:00Z' },
    { code: '4826', eventAt: '2026-11-22T10:02:00Z' },
    null,
  ]);
  assert.deepEqual(f.map((e) => e.clientUuid), ['a', 'b']);
  assert.deepEqual(normaliserFile('illisible'), []);
});

test('choix du code : mêmes règles que la base, messages', () => {
  assert.equal(codeTropSimple('1111'), true);
  assert.equal(codeTropSimple('1234'), true);
  assert.equal(codeTropSimple('8765'), true);
  assert.equal(codeTropSimple('4826'), false);
  assert.equal(codeTropSimple('12'), false);
  assert.equal(messageChoixCode({ ok: true }).ok, true);
  assert.match(messageChoixCode({ ok: false, raison: 'indisponible' }).texte, /ne peut pas être retenu/);
  assert.match(messageChoixCode({ ok: false, raison: 'attente' }).texte, /une heure/);
  assert.equal(messageChoixCode(null).ok, false);
});
