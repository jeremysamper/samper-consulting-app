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
import { forgetAuthRefreshFailure, hasAuthRefreshFailure, readPersistedAuthUser, supabase } from './supabase.js';

const MIN_INTERVAL_MS = 10000;
// Attente légitime d'un getSession() au réveil avec un JWT expiré : tous les
// appels concurrents partagent UN refresh, qu'auth-js réessaie tant qu'un
// nouvel essai peut partir avant 30 s, chaque essai étant borné par
// netResilience. Mesuré : ~26 s réseau coupé, ~30 s refresh pendu. Si le
// dernier essai reçoit ses en-têtes puis bloque sur le corps, le budget corps
// (30 s) s'ajoute : jusqu'à ~68 s. Cette échéance ne déclenche donc rien à
// elle seule, voir checkSession.
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
// Droit d'oublier l'échec de refresh gardé en cache par auth-js (voir
// retryCachedRefreshFailure). Réarmé par un réveil, par l'event `online` et par
// toute sonde en échec : un seul refresh forcé par vrai retour du réseau. Si
// /token échoue alors que la sonde répond (incident côté Supabase), on ne
// relance donc pas un cycle complet à chaque réessai, sur chaque tablette de la
// cuisine : le garde-fou de 60 s d'auth-js reprend la main.
let forgetArmed = true;

// Sonde réseau qui réarme ce droit quand elle échoue.
async function probe() {
  const reachable = await probeNetwork();
  if (!reachable) forgetArmed = true;
  return reachable;
}

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

// Un getSession() attendu en plusieurs temps : rend la fonction qui l'attend au
// plus `ms`, ou DEADLINE. getSession peut aussi LEVER sur une erreur qui n'est
// pas une AuthError (localStorage plein au moment d'enregistrer le jeton,
// abonné onAuthStateChange qui lève pendant TOKEN_REFRESHED) : même traitement
// qu'une absence de session.
function startGetSession() {
  const pending = supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  return (ms) => {
    let timer = null;
    const deadline = new Promise((resolve) => { timer = setTimeout(() => resolve(DEADLINE), ms); });
    return Promise.race([pending, deadline]).finally(() => clearTimeout(timer));
  };
}

async function checkSession() {
  if (!readPersistedAuthUser()) return 'signed-out';
  const startedAt = Date.now();
  const settleWithin = startGetSession();

  let result = await settleWithin(SESSION_DEADLINE_MS);
  if (result === DEADLINE) {
    // L'appareil s'est rendormi pendant l'attente : le délai ne prouve rien.
    if (lastWakeAt > startedAt) return 'unreachable';
    if (!(await probe())) return 'unreachable';
    // Le réseau répond, mais un refresh dont le dernier essai a reçu ses
    // en-têtes puis bloque sur son corps tient légitimement jusqu'à ~68 s : on
    // laisse un sursis (90 s au total) avant de conclure. Un rechargement à
    // tort en plein service coûterait plus cher que l'attente. Seul celui qui
    // ne se règle TOUJOURS pas est réellement figé.
    result = await settleWithin(SESSION_DEADLINE_MS);
    if (result === DEADLINE) return lastWakeAt > startedAt ? 'unreachable' : 'wedged';
  }
  if (result?.data?.session) {
    // JWT encore valide, mais son refresh vient d'échouer (typiquement : refresh
    // en vol pendant la veille, abandonné au réveil) : il expirerait pendant le
    // cache d'échec d'auth-js. On relance en arrière-plan, sans retarder les
    // refetch : ce jeton suffit pour eux.
    if (hasAuthRefreshFailure()) void retryCachedRefreshFailure();
    return 'ok';
  }
  if (!readPersistedAuthUser()) return 'signed-out';
  // Refresh jeté par auth-js parce qu'un autre onglet a tourné le jeton pendant
  // ce temps : la session fraîche est déjà en stockage, une relecture suffit.
  if (result?.error?.name === 'AuthRefreshDiscardedError') {
    const reread = await startGetSession()(SESSION_DEADLINE_MS);
    if (reread !== DEADLINE && reread?.data?.session) return 'ok';
  }
  if (await retryCachedRefreshFailure()) return 'ok';
  return readPersistedAuthUser() ? 'unreachable' : 'signed-out';
}

// auth-js garde l'échec d'un refresh en cache 60 s et le rend à tout
// getSession() de la fenêtre sans rien retenter, même réseau revenu. Si on en a
// le droit (forgetArmed) et que la sonde prouve que le réseau répond, on
// l'oublie et on retente une fois tout de suite (voir forgetAuthRefreshFailure).
// Rend la session obtenue, ou null.
async function retryCachedRefreshFailure() {
  if (!forgetArmed || !hasAuthRefreshFailure() || !(await probe())) return null;
  if (!forgetArmed || !forgetAuthRefreshFailure()) return null;
  forgetArmed = false;
  const retried = await startGetSession()(SESSION_DEADLINE_MS);
  return retried === DEADLINE ? null : retried?.data?.session || null;
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
    try { reachable = await probe(); } finally { probing = false; }
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
    forgetArmed = true;
    cancelProbe();
    requestResume();
  });

  window.addEventListener('online', () => {
    recoveryStreak = 0;
    forgetArmed = true;
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
