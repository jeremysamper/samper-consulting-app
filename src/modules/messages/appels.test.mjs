// node --test : règles de l'appel audio dans l'app (appels.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STUN_DIRECT, codeAppel, configIce, estIos, lireJournal, messageAppel, messageMicro, peutAppeler,
  sonneEncore, sonnerieRestante, viaRelais,
} from './appels.js';

test('code stable lu dans le message de la base', () => {
  assert.equal(codeAppel({ message: 'appel_occupe' }), 'appel_occupe');
  assert.equal(codeAppel({ message: 'ERROR: appel_plus_en_sonnerie (P0001)' }), 'appel_plus_en_sonnerie');
  assert.equal(codeAppel({ message: 'Failed to fetch' }), null);
  assert.equal(codeAppel(null), null);
});

test('chaque refus de la base a sa phrase, sans nom dedans', () => {
  const codes = ['appel_session', 'appel_compte_inactif', 'appel_appele_invalide', 'appel_appele_introuvable',
    'appel_poste_partage', 'appel_occupe', 'appel_offre_invalide', 'appel_reponse_invalide', 'appel_issue_invalide',
    'appel_introuvable', 'appel_plus_en_sonnerie'];
  const repli = messageAppel({ message: 'autre chose' });
  for (const c of codes) {
    const t = messageAppel({ message: c });
    assert.notEqual(t, repli, c);
    assert.ok(!/appel_/.test(t), c);
  }
  assert.match(messageAppel({ message: 'appel_poste_partage' }), /iPad de poste/);
  assert.match(repli, /Vérifiez la connexion/);
});

test('micro : une phrase par refus, et le cas iOS « relancez l\'app »', () => {
  const err = (name, message = '') => Object.assign(new Error(message), { name });
  assert.match(messageMicro(err('NotAllowedError'), false), /Micro refusé/);
  assert.match(messageMicro(err('SecurityError'), false), /Micro refusé/);
  assert.match(messageMicro(err('NotFoundError'), false), /Aucun micro/);
  assert.match(messageMicro(err('NotReadableError'), false), /déjà utilisé/);
  assert.match(messageMicro(err('NotReadableError'), true), /relancez-la/);
  assert.match(messageMicro(err('AbortError', 'No AVAudioSessionCaptureDevice'), true), /relancez-la/);
  assert.match(messageMicro(err('TypeError'), false), /n'a pas pu s'ouvrir/);
});

test('iOS et iPadOS reconnus, Mac et Android non', () => {
  assert.equal(estIos({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X)' }), true);
  assert.equal(estIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), true);
  assert.equal(estIos({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), false);
  assert.equal(estIos({ userAgent: 'Mozilla/5.0 (Linux; Android 14)' }), false);
});

test('appel-turn : relais, connexion directe sur 503 ou panne, refus sur 401 et 403', () => {
  const ice = [{ urls: ['turn:turn.cloudflare.com:3478'], username: 'u', credential: 'c' }];
  assert.deepEqual(configIce(200, { iceServers: ice, ttl: 1800 }), { iceServers: ice, relais: true });
  assert.deepEqual(configIce(503, { error: 'Relais non configuré.' }), { iceServers: STUN_DIRECT, relais: false });
  assert.deepEqual(configIce(502, null), { iceServers: STUN_DIRECT, relais: false });
  assert.deepEqual(configIce(0, null), { iceServers: STUN_DIRECT, relais: false });
  assert.deepEqual(configIce(200, {}), { iceServers: STUN_DIRECT, relais: false });
  assert.match(configIce(403, { error: 'Poste partagé : appel indisponible.' }).refus, /iPad de poste/);
  assert.match(configIce(403, { error: 'Compte inactif.' }).refus, /désactivé/);
  assert.match(configIce(401, { error: 'Non authentifié.' }).refus, /Session expirée/);
  assert.equal(STUN_DIRECT[0].urls, 'stun:stun.cloudflare.com:3478');
});

test('sonnerie : jamais pour une ligne échue (rejeu au réveil), marge de 2 s', () => {
  const t0 = Date.parse('2026-11-13T10:00:00Z');
  const ligne = { etat: 'sonne', expire_a: '2026-11-13T10:00:30Z' };
  assert.equal(sonneEncore(ligne, t0), true);
  assert.equal(sonneEncore(ligne, t0 + 31000), true);
  assert.equal(sonneEncore(ligne, t0 + 32000), false);
  assert.equal(sonneEncore(ligne, t0 + 120000), false);
  assert.equal(sonneEncore({ ...ligne, etat: 'en_cours' }, t0), false);
  assert.equal(sonneEncore({ etat: 'sonne', expire_a: null }, t0), false);
  assert.equal(sonnerieRestante(ligne, t0), 32000);
  assert.equal(sonnerieRestante(ligne, t0 + 40000), 0);
});

test('journal : sens, issue et durée à part', () => {
  const base = { appelant_id: 'a', appele_id: 'b' };
  assert.deepEqual(lireJournal({ ...base, etat: 'termine', duree_s: 125, duree_approx: false }, 'a'),
    { sens: 'emis', autreId: 'b', issue: 'Terminé', duree: '2:05', environ: false, manque: false });
  assert.deepEqual(lireJournal({ ...base, etat: 'termine', duree_s: 90, duree_approx: true }, 'b'),
    { sens: 'recu', autreId: 'a', issue: 'Terminé', duree: '1:30', environ: true, manque: false });
  assert.equal(lireJournal({ ...base, etat: 'manque' }, 'a').issue, 'Sans réponse');
  assert.equal(lireJournal({ ...base, etat: 'manque' }, 'b').issue, 'Manqué');
  assert.equal(lireJournal({ ...base, etat: 'manque' }, 'b').manque, true);
  assert.equal(lireJournal({ ...base, etat: 'refuse' }, 'a').issue, 'Refusé');
  assert.equal(lireJournal({ ...base, etat: 'echec' }, 'a').duree, null);
});

test('relais : lu sur la paire de candidats retenue', () => {
  const rapport = (paire, typeLocal, typeDistant) => {
    const m = new Map([
      ['T', { id: 'T', type: 'transport', selectedCandidatePairId: paire }],
      ['P1', { id: 'P1', type: 'candidate-pair', localCandidateId: 'L1', remoteCandidateId: 'R1', state: 'succeeded' }],
      ['L1', { id: 'L1', type: 'local-candidate', candidateType: typeLocal }],
      ['R1', { id: 'R1', type: 'remote-candidate', candidateType: typeDistant }],
    ]);
    return m;
  };
  assert.equal(viaRelais(rapport('P1', 'relay', 'srflx')), true);
  assert.equal(viaRelais(rapport('P1', 'host', 'relay')), true);
  assert.equal(viaRelais(rapport('P1', 'srflx', 'host')), false);
  assert.equal(viaRelais(rapport('absente', 'relay', 'relay')), null);
  assert.equal(viaRelais(null), null);
});

test('appareil capable d\'appeler : WebRTC et micro', () => {
  assert.equal(peutAppeler({ RTCPeerConnection: function () {}, navigator: { mediaDevices: { getUserMedia() {} } } }), true);
  assert.equal(peutAppeler({ navigator: { mediaDevices: { getUserMedia() {} } } }), false);
  assert.equal(peutAppeler({ RTCPeerConnection: function () {}, navigator: {} }), false);
});
