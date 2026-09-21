// ═══════════════════════════════════════════════════════════════
// resumeCoordinator - rejouer les lectures quand l'appareil « revient »
// ═══════════════════════════════════════════════════════════════
// Une tablette mise en veille perd son canal realtime et peut voir son JWT
// expirer : au réveil plus aucun event Postgres n'arrive, et les modules
// gardés montés restent sur les données d'avant la veille. On rejoue donc leurs
// refetch. Ce module est le SEUL endroit qui décide quand : avant lui, le bridge
// (subscribeReload) et le hook useResumeRefresh avaient chacun leurs écouteurs,
// avec trois défauts qui laissaient un écran figé jusqu'au redémarrage de l'app :
//
//   - les refetch partaient à l'instant exact du réveil, réseau pas encore
//     remonté et JWT pas encore rafraîchi : ils échouaient, ou repartaient avec
//     la clé anonyme et vidaient des listes pourtant pleines en base ;
//   - la limite « un tir par 10 s » JETAIT l'événement suivant. Or `online`
//     arrive justement quelques secondes après le réveil : le seul signal qui
//     aurait relancé des lectures parties trop tôt était perdu ;
//   - une lecture en échec n'était jamais retentée tant que l'utilisateur ne
//     reverrouillait pas l'appareil.
//
// Ici : on attend que la session soit saine avant de tirer, un événement arrivé
// dans la fenêtre de 10 s est REPORTÉ à la fin de la fenêtre au lieu d'être
// perdu, et un échec réseau déclenche un sondage du réseau puis une relance.
//
// Contrat des handlers : un refetch complet et idempotent (celui de
// subscribeReload). Ils ne reçoivent aucun argument.
// ═══════════════════════════════════════════════════════════════

import { notifyLegacy } from '../legacy/legacyApi.js';
import { afterWakeGrace, onNetworkFailure, onWake, probeNetwork } from './netResilience.js';
import { readPersistedAuthUser, supabase } from './supabase.js';

const MIN_INTERVAL_MS = 10000;
// auth-js réessaie un refresh en échec pendant ~30 s (verrou tenu), et au réveil
// notre getSession passe DERRIÈRE le sien : l'attente légitime atteint 50 à 60 s.
// Cette échéance ne déclenche donc rien à elle seule, voir checkSession.
const SESSION_DEADLINE_MS = 45000;
const RETRY_DELAYS_MS = [3000, 6000, 12000, 24000, 30000];
const PROBE_DELAYS_MS = [4000, 8000, 15000, 30000];
// Relances sur « réseau revenu » : espacées de plus en plus si elles s'enchaînent
// (une requête qui expire à chaque fois ne doit pas faire recharger tous les
// modules en boucle), remises à zéro par un vrai réveil ou un retour en ligne.
const RECOVERY_COOLDOWN_MAX_MS = 5 * 60 * 1000;
const RECOVERY_RESET_MS = 10 * 60 * 1000;
const RELOAD_GUARD_KEY = 'sc_wedge_reload_at';
const RELOAD_GUARD_MS = 10 * 60 * 1000;

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const handlers = new Set();

let running = false;
let lastFiredAt = 0;
let lastWakeAt = 0;
let trailingTimer = null;
let retryTimer = null;
let retryStep = 0;
let probeTimer = null;
let probing = false;
let probeStep = 0;
let recoveryStreak = 0;
let lastRecoveryAt = 0;

const isHidden = () => hasWindow && document.visibilityState === 'hidden';
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Enregistre un refetch à rejouer à la reprise. Rend le désabonnement. */
export function subscribeResume(fn) {
  handlers.add(fn);
  return () => handlers.delete(fn);
}

// ─── Session saine ? ───
// 'ok'          : jeton valide (rafraîchi au besoin) → on peut rejouer.
// 'signed-out'  : personne de connecté → rien à rejouer.
// 'unreachable' : session persistée mais refresh impossible pour l'instant
//                 (réseau) → surtout ne PAS rejouer : les lectures partiraient
//                 avec la clé anonyme et la RLS rendrait des listes vides.
// 'wedged'      : getSession() ne se règle pas alors que le réseau répond.
const DEADLINE = Symbol('deadline');

async function checkSession() {
  if (!readPersistedAuthUser()) return 'signed-out';
  const startedAt = Date.now();
  // UNE seule promesse, attendue en deux temps. getSession peut aussi LEVER
  // (verrou volé par une autre requête).
  const pending = supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  const settleWithin = (ms) => {
    let timer = null;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(DEADLINE), ms); });
    return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
  };

  let result = await settleWithin(SESSION_DEADLINE_MS);
  if (result === DEADLINE) {
    // L'appareil s'est rendormi pendant l'attente : le délai ne prouve rien.
    if (lastWakeAt > startedAt) return 'unreachable';
    if (!(await probeNetwork())) return 'unreachable';
    // Le réseau répond, mais ça ne suffit pas à conclure : au réveil avec un JWT
    // expiré, auth-js a pris son verrou AVANT nous et exécute les getSession en
    // SÉRIE, chacun avec son propre cycle de refresh. Deux cycles en échec font
    // déjà 50 à 60 s. Réseau revenu, un client vivant se règle à son prochain
    // essai (au pire ~13 s de backoff + 7 s de budget) : on lui laisse un sursis.
    // Seul celui qui ne se règle TOUJOURS pas est réellement figé.
    result = await settleWithin(SESSION_DEADLINE_MS);
    if (result === DEADLINE) return lastWakeAt > startedAt ? 'unreachable' : 'wedged';
  }
  if (result?.data?.session) return 'ok';
  return readPersistedAuthUser() ? 'unreachable' : 'signed-out';
}

// Dernier recours : le réseau répond mais le client Supabase ne rend plus la
// main. Rien ne peut le débloquer de l'extérieur, et plus aucune écriture ne
// passe : l'utilisateur tuerait l'app de toute façon. On recharge une fois, à sa
// place (même principe que preloadErrorRecovery). Les files hors-ligne
// (pointages, comptages) vivent en IndexedDB et survivent au rechargement.
function recoverWedgedClient() {
  let lastReloadAt = 0;
  try { lastReloadAt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0; } catch { /* sessionStorage indisponible */ }
  if (Date.now() - lastReloadAt < RELOAD_GUARD_MS) {
    console.warn('[resume] client Supabase toujours figé après un rechargement récent');
    notifyLegacy('Connexion bloquée. Fermez puis rouvrez l\'application.', 'error');
    // Pas de second rechargement, mais on ne renonce pas : si le client se
    // débloque après coup, les lectures doivent quand même être rejouées.
    scheduleRetry();
    return;
  }
  try { sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now())); } catch { /* sans garde persistée, un seul essai par chargement */ }
  console.warn('[resume] client Supabase figé alors que le réseau répond : rechargement');
  window.location.reload();
}

function clearRetry() {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
}

function scheduleRetry() {
  clearRetry();
  const delay = RETRY_DELAYS_MS[Math.min(retryStep, RETRY_DELAYS_MS.length - 1)];
  retryStep += 1;
  retryTimer = setTimeout(() => { retryTimer = null; run(); }, delay);
}

async function run() {
  if (running) return;
  running = true;
  clearRetry();
  try {
    // Caché ou hors-ligne : le prochain réveil / l'event `online` relancera.
    if (isHidden() || isOffline()) return;
    await afterWakeGrace();
    const state = await checkSession();
    if (state === 'signed-out') return;
    if (state === 'wedged') { recoverWedgedClient(); return; }
    if (state === 'unreachable') { scheduleRetry(); return; }
    retryStep = 0;
    lastFiredAt = Date.now();
    // Copie : un handler peut se désabonner pendant la boucle (module démonté).
    for (const fn of [...handlers]) {
      try { fn(); } catch (err) { console.warn('[resume reload]', err); }
    }
  } finally {
    running = false;
  }
}

/** Demande une reprise. Bridée à une par 10 s, sans perdre la demande. */
export function requestResume() {
  // Plafonné : si l'horloge système recule (resynchro au réveil), le reste à
  // attendre ne doit jamais dépasser la fenêtre elle-même.
  const waitMs = Math.min(MIN_INTERVAL_MS, lastFiredAt + MIN_INTERVAL_MS - Date.now());
  if (waitMs > 0) {
    if (!trailingTimer) trailingTimer = setTimeout(() => { trailingTimer = null; run(); }, waitMs);
    return;
  }
  run();
}

// ─── Réseau revenu après un échec ───
function cancelProbe() {
  if (probeTimer) { clearTimeout(probeTimer); probeTimer = null; }
  probeStep = 0;
}

function scheduleProbe(delay) {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    if (isHidden() || isOffline()) { probeStep = 0; return; }
    // `probing` ferme la fenêtre pendant laquelle le timer est déjà retombé mais
    // la sonde encore en vol : sans lui, un échec réseau arrivé là lançait une
    // seconde chaîne de sondage en parallèle.
    probing = true;
    let reachable = false;
    try { reachable = await probeNetwork(); } finally { probing = false; }
    if (reachable) {
      probeStep = 0;
      recoveryStreak += 1;
      lastRecoveryAt = Date.now();
      requestResume();
      return;
    }
    probeStep = Math.min(probeStep + 1, PROBE_DELAYS_MS.length - 1);
    scheduleProbe(PROBE_DELAYS_MS[probeStep]);
  }, delay);
}

if (hasWindow) {
  // Réveil et retour en ligne rejouent déjà tout : une sonde en attente n'a plus
  // lieu d'être (si le refetch échoue, l'échec en reprogramme une).
  onWake(() => {
    lastWakeAt = Date.now();
    recoveryStreak = 0;
    cancelProbe();
    requestResume();
  });

  window.addEventListener('online', () => {
    recoveryStreak = 0;
    cancelProbe();
    requestResume();
  });

  onNetworkFailure(() => {
    if (probeTimer || probing || isHidden() || isOffline()) return;
    const now = Date.now();
    if (now - lastRecoveryAt > RECOVERY_RESET_MS) recoveryStreak = 0;
    const cooldown = Math.min(RECOVERY_COOLDOWN_MAX_MS, MIN_INTERVAL_MS * 2 ** recoveryStreak);
    const earliest = lastRecoveryAt ? lastRecoveryAt + cooldown - now : 0;
    scheduleProbe(Math.max(PROBE_DELAYS_MS[0], earliest));
  });
}
