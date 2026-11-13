// Moteur de l'appel audio dans l'app (lot C4) : un seul pour toute l'app,
// hors React. Il tient le micro, la connexion WebRTC, la sonnerie, les
// minuteries et les appels aux fonctions de la base (migration
// 20261113_appels.sql) ; le bandeau de la coque et la page Messages lisent son
// état par useMoteurAppel(). Il ne lit jamais la table lui-même : le hook de
// coque useAppels (un seul canal pour l'app) lui passe les lignes vivantes.
//
// Phases :
//   repos        rien
//   entrant      un appel sonne sur cet appareil
//   preparation  micro et identifiants du relais demandés, offre en collecte
//   sortant      l'appel sonne chez l'autre (30 s au plus)
//   connexion    réponse donnée ou reçue, liaison audio en cours d'établissement
//   en_cours     on se parle
//   fin          message de fin ou de refus, retiré seul ou par « Fermer »
import React from 'react';
import { dbService } from '../../services/dbService.js';
import {
  BATTEMENT_MS, COLLECTE_MAX_MS, CONNEXION_MAX_MS, FIN_AFFICHEE_MS,
  configIce, messageAppel, messageMicro, sonneEncore, sonnerieRestante, viaRelais,
} from './appels.js';
import { formatDuree } from './vocal.js';

const REPOS = { phase: 'repos', appelId: null, autreId: null, sens: null, debut: null, relais: null, micCoupe: false, instable: false, message: null, duree: null, erreur: false, sonMuet: false };

let etat = REPOS;
const abonnes = new Set();
const x = {
  moi: null, jeton: 0, ligne: null, pc: null, flux: null, audio: null,
  minuteurs: {}, battement: null, verrou: null, vus: new Set(), nom: '',
};

function poser(partiel) {
  etat = { ...etat, ...partiel };
  abonnes.forEach((fn) => { try { fn(); } catch { /* un abonné ne bloque pas les autres */ } });
}

function client() { return dbService.getClient(); }

// ── Sonnerie (Web Audio : aucun fichier, aucun blob:) ──────────────────
// Le navigateur ne laisse jouer un son qu'après un geste de la personne :
// le premier toucher de la session débloque le contexte audio. À la
// sonnerie, on tente aussi : un navigateur qui l'autorise joue tout de suite.
let ctxAudio = null;
let sonnerie = null;
function debloquerSon() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctxAudio) {
      ctxAudio = new AC();
      ctxAudio.onstatechange = () => { if (ctxAudio.state === 'running' && etat.sonMuet) poser({ sonMuet: false }); };
    }
    if (ctxAudio.state === 'suspended') ctxAudio.resume().catch(() => {});
  } catch { /* pas de son sur cet appareil */ }
}
let deblocageInstalle = false;
function installerDeblocage() {
  if (deblocageInstalle || typeof window === 'undefined') return;
  deblocageInstalle = true;
  const surGeste = () => debloquerSon();
  window.addEventListener('pointerdown', surGeste, { capture: true, passive: true });
  window.addEventListener('keydown', surGeste, { capture: true });
}
function bip(debut, duree) {
  const osc = ctxAudio.createOscillator();
  const gain = ctxAudio.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, debut);
  gain.gain.exponentialRampToValueAtTime(0.18, debut + 0.03);
  gain.gain.setValueAtTime(0.18, debut + duree - 0.05);
  gain.gain.exponentialRampToValueAtTime(0.0001, debut + duree);
  osc.connect(gain).connect(ctxAudio.destination);
  osc.start(debut);
  osc.stop(debut + duree + 0.02);
}
function sonner() {
  arreterSonnerie();
  debloquerSon();
  const cycle = () => {
    if (ctxAudio && ctxAudio.state === 'running') {
      const t = ctxAudio.currentTime + 0.05;
      bip(t, 0.4);
      bip(t + 0.6, 0.4);
    }
    try { navigator.vibrate?.([400, 200, 400]); } catch { /* pas de vibration */ }
  };
  poser({ sonMuet: !(ctxAudio && ctxAudio.state === 'running') });
  cycle();
  sonnerie = setInterval(cycle, 3000);
}
function arreterSonnerie() {
  if (sonnerie) { clearInterval(sonnerie); sonnerie = null; }
  try { navigator.vibrate?.(0); } catch { /* pas de vibration */ }
}

// ── Verrou d'écran pendant l'appel ─────────────────────────────────────
function verrouiller() {
  if (x.verrou || !navigator.wakeLock?.request || document.visibilityState !== 'visible') return;
  navigator.wakeLock.request('screen').then((v) => {
    if (!['connexion', 'en_cours'].includes(etat.phase)) { v.release().catch(() => {}); return; }
    x.verrou = v;
    v.addEventListener?.('release', () => { if (x.verrou === v) x.verrou = null; });
  }).catch(() => { /* refusé : l'écran peut s'éteindre */ });
}
function deverrouiller() {
  const v = x.verrou;
  x.verrou = null;
  if (v) v.release().catch(() => {});
}
if (typeof document !== 'undefined') {
  // Le verrou tombe quand la page est masquée ; il se reprend au retour.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && ['connexion', 'en_cours'].includes(etat.phase)) verrouiller();
  });
}

// ── Nettoyage ──────────────────────────────────────────────────────────
function arreterMinuteurs() {
  Object.values(x.minuteurs).forEach((t) => clearTimeout(t));
  x.minuteurs = {};
  if (x.battement) { clearInterval(x.battement); x.battement = null; }
}
function liberer() {
  arreterMinuteurs();
  arreterSonnerie();
  deverrouiller();
  if (x.pc) {
    x.pc.ontrack = null;
    x.pc.onconnectionstatechange = null;
    try { x.pc.close(); } catch { /* déjà fermée */ }
    x.pc = null;
  }
  if (x.flux) { x.flux.getTracks().forEach((t) => { try { t.stop(); } catch { /* déjà arrêtée */ } }); x.flux = null; }
  if (x.audio) { try { x.audio.pause(); x.audio.srcObject = null; x.audio.remove(); } catch { /* déjà retiré */ } x.audio = null; }
}

// Fin de l'appel sur cet appareil, avec son message. erreur : la phrase dit un
// refus ou une panne, elle reste jusqu'à « Fermer ». duree : m:ss d'un appel
// terminé, rendue à part du message (traduction de l'écran).
function finir(message, erreur = false, duree = null) {
  x.jeton += 1;
  if (x.ligne?.id) x.vus.add(x.ligne.id);
  x.ligne = null;
  liberer();
  if (!message) { poser({ ...REPOS }); return; }
  poser({ ...REPOS, phase: 'fin', autreId: etat.autreId, sens: etat.sens, message, duree, erreur });
  if (!erreur) {
    const jeton = x.jeton;
    x.minuteurs.fin = setTimeout(() => { if (jeton === x.jeton && etat.phase === 'fin') poser({ ...REPOS }); }, FIN_AFFICHEE_MS);
  }
}

// ── Préparation : micro, relais, connexion ─────────────────────────────
async function demanderMicro() {
  return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
}

async function identifiantsRelais() {
  try {
    const { data, error } = await client().functions.invoke('appel-turn', { method: 'POST', body: {} });
    if (!error) return configIce(200, data);
    const rep = error.context;
    let corps = null;
    let statut = 0;
    if (rep && typeof rep.status === 'number') {
      statut = rep.status;
      try { corps = await rep.clone().json(); } catch { /* corps illisible */ }
    }
    return configIce(statut, corps);
  } catch {
    return configIce(0, null);
  }
}

function attendreCollecte(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    let t = null;
    const fin = () => { clearTimeout(t); pc.removeEventListener('icegatheringstatechange', change); resolve(); };
    const change = () => { if (pc.iceGatheringState === 'complete') fin(); };
    t = setTimeout(fin, COLLECTE_MAX_MS);
    pc.addEventListener('icegatheringstatechange', change);
  });
}

function sonDistant(flux) {
  if (!x.audio) {
    const a = document.createElement('audio');
    a.autoplay = true;
    a.setAttribute('playsinline', '');
    a.hidden = true;
    document.body.appendChild(a);
    x.audio = a;
  }
  if (x.audio.srcObject !== flux) x.audio.srcObject = flux;
  x.audio.play?.().catch(() => { /* lecture refusée : le prochain toucher la relance */ });
}

function creerConnexion(iceServers) {
  const pc = new window.RTCPeerConnection({ iceServers, iceTransportPolicy: 'all' });
  pc.ontrack = (e) => { sonDistant(e.streams?.[0] || new window.MediaStream([e.track])); };
  pc.onconnectionstatechange = () => {
    if (x.pc !== pc) return;
    const s = pc.connectionState;
    if (s === 'connected') {
      clearTimeout(x.minuteurs.connexion);
      if (etat.phase !== 'en_cours') poser({ phase: 'en_cours', debut: etat.debut || Date.now(), instable: false });
      else if (etat.instable) poser({ instable: false });
      verrouiller();
    } else if (s === 'disconnected') {
      poser({ instable: true });
    } else if (s === 'failed') {
      echec();
    }
  };
  return pc;
}

async function relaisUtilise() {
  try { return viaRelais(await x.pc?.getStats()); } catch { return null; }
}

function texteEchec() {
  return etat.relais
    ? "La connexion n'a pas pu s'établir."
    : "La connexion n'a pas pu s'établir. Entre deux réseaux différents (Wi-Fi et 4G par exemple), l'appel peut ne pas aboutir.";
}

async function echec() {
  const id = x.ligne?.id;
  const via = await relaisUtilise();
  if (id) client().rpc('appel_terminer', { p_id: id, p_issue: 'echec', p_via_relais: via }).then(() => {}, () => {});
  finir(texteEchec(), true);
}

function lancerBattement() {
  if (x.battement) return;
  x.battement = setInterval(async () => {
    const id = x.ligne?.id;
    if (!id) return;
    const { data, error } = await client().rpc('appel_battement', { p_id: id });
    if (error || !data || x.ligne?.id !== id) return;
    // Coupé par la base (15 minutes) ou raccroché sans que l'événement arrive.
    if (data.etat !== 'en_cours') finDistante(data);
  }, BATTEMENT_MS);
}

function attendreConnexion() {
  clearTimeout(x.minuteurs.connexion);
  x.minuteurs.connexion = setTimeout(() => { if (etat.phase === 'connexion') echec(); }, CONNEXION_MAX_MS);
}

function finDistante(ligne) {
  if (ligne.etat === 'refuse') { finir('Appel refusé.'); return; }
  if (ligne.etat === 'manque') { finir(etat.sens === 'emis' ? 'Pas de réponse.' : 'Appel manqué.'); return; }
  if (ligne.etat === 'echec') { finir(texteEchec(), true); return; }
  finir('Appel terminé.', false, ligne.duree_s != null ? formatDuree(ligne.duree_s) : null);
}

// ── Actions ────────────────────────────────────────────────────────────

// Appeler une personne. nom : son nom affiché, pour les messages.
export async function lancer(autreId, nom = '') {
  if (!x.moi || !autreId || !['repos', 'fin'].includes(etat.phase)) return;
  debloquerSon();
  liberer();
  const jeton = ++x.jeton;
  x.nom = nom;
  poser({ ...REPOS, phase: 'preparation', autreId, sens: 'emis' });
  let flux;
  let ice;
  try {
    [flux, ice] = await Promise.all([demanderMicro(), identifiantsRelais()]);
  } catch (err) {
    if (jeton === x.jeton) finir(messageMicro(err), true);
    return;
  }
  if (jeton !== x.jeton) { flux.getTracks().forEach((t) => t.stop()); return; }
  x.flux = flux;
  if (ice.refus) { finir(ice.refus, true); return; }
  poser({ relais: ice.relais });
  try {
    const pc = creerConnexion(ice.iceServers);
    x.pc = pc;
    flux.getTracks().forEach((t) => pc.addTrack(t, flux));
    await pc.setLocalDescription(await pc.createOffer());
    await attendreCollecte(pc);
    if (jeton !== x.jeton) return;
    const { data, error } = await client().rpc('appel_lancer', { p_appele: autreId, p_offre: JSON.stringify(pc.localDescription) });
    if (jeton !== x.jeton) {
      // Annulé pendant l'envoi : l'appel lancé est clos aussitôt.
      if (data?.id) client().rpc('appel_terminer', { p_id: data.id }).then(() => {}, () => {});
      return;
    }
    if (error || !data?.id) { finir(messageAppel(error), true); return; }
    x.ligne = data;
    poser({ phase: 'sortant', appelId: data.id });
    // Sans réponse à l'échéance de la base : l'appelant clôt en « manqué ».
    const reste = Math.min(32000, Math.max(5000, Date.parse(data.expire_a) - Date.now()));
    x.minuteurs.echeance = setTimeout(async () => {
      if (jeton !== x.jeton || etat.phase !== 'sortant') return;
      const r = await client().rpc('appel_terminer', { p_id: data.id, p_issue: 'manque' });
      if (jeton !== x.jeton || etat.phase !== 'sortant') return;
      if (r.data && r.data.etat === 'en_cours') { recevoir([r.data]); return; }
      finir('Pas de réponse.');
    }, reste);
  } catch {
    if (jeton === x.jeton) finir("L'appel n'a pas pu se préparer. Réessayez.", true);
  }
}

export async function repondre() {
  if (etat.phase !== 'entrant' || !x.ligne) return;
  debloquerSon();
  arreterSonnerie();
  const ligne = x.ligne;
  const jeton = ++x.jeton;
  poser({ phase: 'connexion', appelId: ligne.id });
  let flux;
  let ice;
  try {
    [flux, ice] = await Promise.all([demanderMicro(), identifiantsRelais()]);
  } catch (err) {
    if (jeton !== x.jeton) return;
    client().rpc('appel_terminer', { p_id: ligne.id, p_issue: 'echec' }).then(() => {}, () => {});
    finir(messageMicro(err), true);
    return;
  }
  if (jeton !== x.jeton) { flux.getTracks().forEach((t) => t.stop()); return; }
  x.flux = flux;
  if (ice.refus) {
    client().rpc('appel_refuser', { p_id: ligne.id }).then(() => {}, () => {});
    finir(ice.refus, true);
    return;
  }
  poser({ relais: ice.relais });
  try {
    const pc = creerConnexion(ice.iceServers);
    x.pc = pc;
    await pc.setRemoteDescription(JSON.parse(ligne.offre));
    flux.getTracks().forEach((t) => pc.addTrack(t, flux));
    await pc.setLocalDescription(await pc.createAnswer());
    await attendreCollecte(pc);
    if (jeton !== x.jeton) return;
    const { data, error } = await client().rpc('appel_repondre', { p_id: ligne.id, p_reponse: JSON.stringify(pc.localDescription) });
    if (jeton !== x.jeton) return;
    if (error || !data?.id) { finir(messageAppel(error), true); return; }
    x.ligne = data;
    lancerBattement();
    attendreConnexion();
  } catch {
    if (jeton !== x.jeton) return;
    client().rpc('appel_terminer', { p_id: ligne.id, p_issue: 'echec' }).then(() => {}, () => {});
    finir("L'appel n'a pas pu se préparer. Réessayez.", true);
  }
}

export function refuser() {
  if (etat.phase !== 'entrant' || !x.ligne) return;
  const id = x.ligne.id;
  client().rpc('appel_refuser', { p_id: id }).then(() => {}, () => {});
  finir(null);
}

export async function raccrocher() {
  const phase = etat.phase;
  if (phase === 'entrant') { refuser(); return; }
  if (phase === 'preparation') { finir(null); return; }
  const id = x.ligne?.id;
  if (!id) { finir(null); return; }
  if (phase === 'sortant') {
    client().rpc('appel_terminer', { p_id: id }).then(() => {}, () => {});
    finir('Appel annulé.');
    return;
  }
  if (phase === 'connexion' || phase === 'en_cours') {
    const via = await relaisUtilise();
    const debut = etat.debut;
    const { data } = await client().rpc('appel_terminer', { p_id: id, p_issue: null, p_via_relais: via });
    if (x.ligne?.id !== id) return;
    const duree = data?.duree_s ?? (debut ? Math.round((Date.now() - debut) / 1000) : null);
    finir('Appel terminé.', false, duree != null ? formatDuree(duree) : null);
  }
}

export function basculerMicro() {
  if (!x.flux) return;
  const coupe = !etat.micCoupe;
  x.flux.getAudioTracks().forEach((t) => { t.enabled = !coupe; });
  poser({ micCoupe: coupe });
}

export function fermer() {
  if (etat.phase === 'fin') finir(null);
}

// ── Lignes reçues du canal de la coque ─────────────────────────────────

// Id de l'appel suivi par cet appareil (relu même quand il n'est plus vivant).
export function appelSuivi() { return x.ligne?.id || null; }

export function recevoir(lignes = []) {
  if (!x.moi) return;
  const suivi = x.ligne?.id ? lignes.find((l) => l.id === x.ligne.id) : null;
  if (suivi) {
    const phase = etat.phase;
    if (phase === 'sortant') {
      if (suivi.etat === 'en_cours' && suivi.reponse && x.pc) {
        x.ligne = suivi;
        clearTimeout(x.minuteurs.echeance);
        poser({ phase: 'connexion' });
        x.pc.setRemoteDescription(JSON.parse(suivi.reponse)).catch(() => echec());
        lancerBattement();
        attendreConnexion();
      } else if (suivi.etat !== 'sonne' && suivi.etat !== 'en_cours') {
        finDistante(suivi);
      }
      return;
    }
    if (phase === 'entrant') {
      if (suivi.etat === 'sonne') return;
      // Pris sur un autre appareil du même compte : cet appareil se tait.
      if (suivi.etat === 'en_cours') { finir(null); return; }
      finir(suivi.etat === 'manque' ? 'Appel manqué.' : null);
      return;
    }
    if ((phase === 'connexion' || phase === 'en_cours') && !['sonne', 'en_cours'].includes(suivi.etat)) {
      finDistante(suivi);
    }
    return;
  }
  if (!['repos', 'fin'].includes(etat.phase)) return;
  // Appel entrant : la plus récente ligne qui sonne encore, adressée à ce
  // compte, jamais vue ici. Une ligne échue (rejeu au réveil) ne sonne pas.
  const maintenant = Date.now();
  const entrante = lignes
    .filter((l) => l.appele_id === x.moi && !x.vus.has(l.id) && sonneEncore(l, maintenant))
    .sort((a, b) => String(b.cree_a).localeCompare(String(a.cree_a)))[0];
  if (!entrante) return;
  liberer();
  const jeton = ++x.jeton;
  x.ligne = entrante;
  x.nom = '';
  poser({ ...REPOS, phase: 'entrant', appelId: entrante.id, autreId: entrante.appelant_id, sens: 'recu' });
  sonner();
  x.minuteurs.echeance = setTimeout(() => {
    if (jeton === x.jeton && etat.phase === 'entrant') finir('Appel manqué.');
  }, sonnerieRestante(entrante, maintenant));
}

// Nom de l'autre personne, posé par le bandeau qui le connaît (messages).
export function nommer(nom) { x.nom = nom || ''; }

// Compte de la session : un autre compte (ou la déconnexion) coupe tout.
export function attacher(moi) {
  if (x.moi === moi) return;
  if (x.ligne?.id && x.moi) {
    const id = x.ligne.id;
    if (etat.phase === 'entrant') client()?.rpc('appel_refuser', { p_id: id }).then(() => {}, () => {});
    else client()?.rpc('appel_terminer', { p_id: id }).then(() => {}, () => {});
  }
  finir(null);
  x.vus.clear();
  x.moi = moi || null;
  if (moi) installerDeblocage();
}

// ── Lecture de l'état ──────────────────────────────────────────────────
function abonner(fn) { abonnes.add(fn); return () => abonnes.delete(fn); }
function lire() { return etat; }

export function useMoteurAppel() {
  return React.useSyncExternalStore(abonner, lire, lire);
}

// Un appel occupe-t-il cet appareil ? (« Appeler » attend la fin.)
export function estOccupe(e = etat) {
  return !['repos', 'fin'].includes(e.phase);
}
