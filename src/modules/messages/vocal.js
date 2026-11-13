// Messages vocaux : règles partagées par la page Messages et le panneau de la
// barre du haut (lot C3). Fonctions pures, sans navigateur, testées par
// vocal.test.mjs.
//
// La base (migration 20261113_messages_vocaux) impose : deux minutes au plus,
// une seconde au moins, un fichier dans le compartiment privé messages-vocaux,
// au chemin <id de l'expéditeur>/<uuid en minuscules>, extension .m4a ou .webm
// permise, type audio/mp4 ou audio/webm sans paramètre, 3 Mio au plus.

export const DUREE_MAX_S = 120;
// Texte gardé dans la colonne message : les sessions encore ouvertes sur
// l'ancien front affichent une ligne lisible (K8).
export const TEXTE_VOCAL = 'Message vocal';
// 64 kbit/s : deux minutes font environ 960 000 octets, sous le plafond.
export const DEBIT_AUDIO = 64000;

// Types demandés à l'enregistreur, dans l'ordre : le MP4 (AAC) se lit sur les
// trois familles d'appareils ; le WebM (Opus) est le repli de Chrome.
const TYPES = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

export function typeEnregistrement(estPris) {
  if (typeof estPris !== 'function') return '';
  return TYPES.find((t) => { try { return estPris(t); } catch { return false; } }) || '';
}

// Type déposé : sans paramètre (le compartiment refuse « audio/webm;codecs=opus »).
export function typeDepose(type) {
  const base = String(type || '').split(';')[0].trim().toLowerCase();
  if (base === 'audio/mp4' || base === 'audio/x-m4a' || base === 'video/mp4') return 'audio/mp4';
  if (base === 'audio/webm' || base === 'video/webm') return 'audio/webm';
  return '';
}

export function extensionDe(type) {
  const t = typeDepose(type);
  if (t === 'audio/mp4') return '.m4a';
  if (t === 'audio/webm') return '.webm';
  return '';
}

export function cheminVocal(expediteurId, uuid, type) {
  return `${expediteurId}/${String(uuid).toLowerCase()}${extensionDe(type)}`;
}

// Durée enregistrée, en secondes entières, de 1 à 120 (contrainte de la base).
export function dureeBornee(secondes) {
  const s = Math.round(Number(secondes) || 0);
  return Math.min(DUREE_MAX_S, Math.max(1, s));
}

export function formatDuree(secondes) {
  const s = Math.max(0, Math.floor(Number(secondes) || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// L'appareil sait-il enregistrer ici ? Un contexte non sécurisé (http) n'a pas
// de navigator.mediaDevices.
export function peutEnregistrer(env = globalThis) {
  const nav = env?.navigator;
  return Boolean(nav?.mediaDevices?.getUserMedia && typeof env?.MediaRecorder === 'function');
}

export const estVocal = (m) => Boolean(m?.audioPath);

// Uuid v4 en minuscules : randomUUID quand l'appareil l'offre, sinon tiré de
// getRandomValues (même format, le chemin est contrôlé par la base).
export function nouvelUuid(c = globalThis.crypto) {
  if (typeof c?.randomUUID === 'function') return c.randomUUID().toLowerCase();
  const o = new Uint8Array(16);
  c.getRandomValues(o);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = [...o].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
