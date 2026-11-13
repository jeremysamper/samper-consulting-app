// node --test : règles des messages vocaux (vocal.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cheminVocal, dureeBornee, extensionDe, formatDuree, peutEnregistrer, typeDepose, typeEnregistrement,
} from './vocal.js';

test('type demandé : MP4 d\'abord, puis WebM Opus, puis WebM, sinon rien', () => {
  assert.equal(typeEnregistrement((t) => t === 'audio/mp4' || t === 'audio/webm'), 'audio/mp4');
  assert.equal(typeEnregistrement((t) => t.startsWith('audio/webm')), 'audio/webm;codecs=opus');
  assert.equal(typeEnregistrement((t) => t === 'audio/webm'), 'audio/webm');
  assert.equal(typeEnregistrement(() => false), '');
  assert.equal(typeEnregistrement(() => { throw new Error('x'); }), '');
  assert.equal(typeEnregistrement(undefined), '');
});

test('type déposé sans paramètre, extension accordée', () => {
  assert.equal(typeDepose('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(typeDepose('audio/mp4; codecs="mp4a.40.2"'), 'audio/mp4');
  assert.equal(typeDepose('video/webm'), 'audio/webm');
  assert.equal(typeDepose('audio/ogg'), '');
  assert.equal(extensionDe('audio/mp4'), '.m4a');
  assert.equal(extensionDe('audio/webm;codecs=opus'), '.webm');
  assert.equal(extensionDe(''), '');
});

test('chemin : dossier de l\'expéditeur, uuid en minuscules, extension', () => {
  assert.equal(cheminVocal('c1', 'ABCDEF12-3456-4789-8ABC-DEF012345678', 'audio/webm;codecs=opus'), 'c1/abcdef12-3456-4789-8abc-def012345678.webm');
  assert.equal(cheminVocal('u-9', '0f0f0f0f-0000-4000-8000-000000000000', 'audio/mp4'), 'u-9/0f0f0f0f-0000-4000-8000-000000000000.m4a');
});

test('durée bornée de 1 à 120 s, format m:ss', () => {
  assert.equal(dureeBornee(0.2), 1);
  assert.equal(dureeBornee(45.6), 46);
  assert.equal(dureeBornee(119.6), 120);
  assert.equal(dureeBornee(400), 120);
  assert.equal(dureeBornee(NaN), 1);
  assert.equal(formatDuree(0), '0:00');
  assert.equal(formatDuree(65.9), '1:05');
  assert.equal(formatDuree(120), '2:00');
});

test('appareil : micro et enregistreur requis', () => {
  const MediaRecorder = function MediaRecorder() {};
  assert.equal(peutEnregistrer({ navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder }), true);
  assert.equal(peutEnregistrer({ navigator: {}, MediaRecorder }), false);
  assert.equal(peutEnregistrer({ navigator: { mediaDevices: { getUserMedia() {} } } }), false);
  assert.equal(peutEnregistrer(undefined), false);
});
