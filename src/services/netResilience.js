// ═══════════════════════════════════════════════════════════════
// netResilience - garde-fou réseau unique de l'app
// ═══════════════════════════════════════════════════════════════
// Bug d'origine : iPad, téléphone ou PC mis en veille, écran rallumé sur l'app
// → chargement infini, obligé de tuer l'app. Deux faits se combinaient :
//
//   1. supabase-js ne pose AUCUN timeout sur ses fetch. Un fetch parti sur un
//      réseau pas encore remonté (socket zombie après veille) peut ne jamais se
//      régler. Quand c'est le refresh du JWT, auth-js garde son verrou interne
//      pour toujours et CHAQUE supabase.from() attend derrière lui : plus rien
//      ne charge jusqu'au redémarrage de l'app.
//   2. Safari iOS 18 : un fetch lancé dans le handler `visibilitychange`, à
//      l'instant où la page redevient visible, n'échoue qu'après 20 à 40 s
//      (« Load failed »). Le même fetch lancé quelques centaines de ms plus
//      tard réussit. Or auth-js et nos refetch de reprise tirent pile là.
//
// Ce module est branché comme `global.fetch` du client Supabase : il couvre
// donc auth, PostgREST, storage et functions d'un seul coup. Il garantit que
// tout fetch SE TERMINE (succès, erreur ou timeout), et il retient les requêtes
// une fraction de seconde au réveil, le temps que le réseau soit rattaché.
//
// Il ne dépend d'aucun autre module de l'app (supabase.js l'importe : pas de
// cycle possible).
// ═══════════════════════════════════════════════════════════════

const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
const nativeFetch = (...args) => globalThis.fetch(...args);

// ─── Budgets ───
// Le budget borne l'attente des EN-TÊTES de réponse. Une fois la réponse
// entamée, le corps dispose de BODY_BUDGET_MS (une grosse liste sur le wifi de
// la cuisine peut être lente sans être morte).
// Attention aux ENVOIS de fichier : fetch() ne se règle qu'après l'émission
// complète du corps, le budget borne donc toute la durée de l'upload. Celui des
// envois storage est dimensionné sur la taille du fichier (voir uploadBudgetMs).
//   refresh   : très court - auth-js réessaie tout seul (backoff, 30 s max) et
//               garde la session sur une erreur réseau. Un refresh pendu est LE
//               cas qui figeait toute l'app : il tient le verrou d'auth, donc
//               chaque seconde de ce budget est une seconde de gel général.
//   auth      : le reste (connexion, mot de passe) n'est pas réessayé d'office.
//   rest GET  : doit rester > networkTimeoutSeconds du service worker (6-10 s)
//               pour que le repli sur le cache hors-ligne ait le temps de répondre.
//   functions : ai-proxy, pos-backfill, uploads photo - longs par nature.
const BUDGET_AUTH_REFRESH_MS = 7000;
const BUDGET_AUTH_MS = 12000;
const BUDGET_REST_READ_MS = 15000;
const BUDGET_REST_WRITE_MS = 25000;
const BUDGET_STORAGE_MS = 120000;
const BUDGET_FUNCTIONS_MS = 150000;
const BUDGET_DEFAULT_MS = 20000;
const BODY_BUDGET_MS = 30000;

// Délai de grâce après un réveil avant de laisser partir une requête. La repro
// du bug iOS 18 réussit dès 400 ms ; 600 ms garde une marge sans être perceptible.
const WAKE_GRACE_MS = 600;
// Battement : un trou dans ce timer = JavaScript gelé (veille de l'appareil,
// PWA suspendue). C'est le seul signal fiable sur un PC dont l'onglet est resté
// « visible » pendant la veille : il n'y a alors aucun visibilitychange.
const HEARTBEAT_MS = 2000;
const FROZEN_GAP_MS = 10000;
// Absence à partir de laquelle on considère les sockets d'avant comme morts.
const AWAY_ABORT_MS = 5000;
// Plusieurs signaux décrivent souvent le même réveil (visibilitychange +
// pageshow + trou de battement) : on n'en émet qu'un.
const WAKE_DEDUPE_MS = 1500;

// Débit montant plancher admis pour un envoi de fichier : Documents accepte
// 50 Mo, soit ~17 min ici. En dessous de ~6 Mo le budget storage de base prime.
const UPLOAD_FLOOR_BYTES_PER_S = 50 * 1024;

function bodyBytes(body) {
  if (!body || typeof body === 'string') return 0;
  if (typeof body.size === 'number') return body.size;             // Blob / File
  if (typeof body.byteLength === 'number') return body.byteLength; // ArrayBuffer / vue
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // storage-js enveloppe le fichier dans un FormData.
    let total = 0;
    for (const value of body.values()) total += (value && typeof value.size === 'number') ? value.size : 0;
    return total;
  }
  return 0;
}

function uploadBudgetMs(url, method, body) {
  if (method === 'GET' || method === 'HEAD' || !url.includes('/storage/v1/')) return 0;
  return Math.ceil(bodyBytes(body) / UPLOAD_FLOOR_BYTES_PER_S) * 1000;
}

const isTokenRefresh = (url) => url.includes('/auth/v1/token') && url.includes('grant_type=refresh_token');

function budgetFor(url, method) {
  if (isTokenRefresh(url)) return BUDGET_AUTH_REFRESH_MS;
  if (url.includes('/auth/v1/')) return BUDGET_AUTH_MS;
  if (url.includes('/functions/v1/')) return BUDGET_FUNCTIONS_MS;
  if (url.includes('/storage/v1/')) return BUDGET_STORAGE_MS;
  if (url.includes('/rest/v1/')) return (method === 'GET' || method === 'HEAD') ? BUDGET_REST_READ_MS : BUDGET_REST_WRITE_MS;
  return BUDGET_DEFAULT_MS;
}

// Rejouable sans risque : une lecture, ou le refresh du jeton (Supabase tolère
// la réutilisation du jeton parent quand la réponse s'est perdue en route).
// Une écriture n'est JAMAIS abandonnée d'office au réveil : elle a pu aboutir
// côté serveur, seul son budget la borne.
function isReplayable(url, method) {
  if (method === 'GET' || method === 'HEAD') return true;
  return isTokenRefresh(url);
}

function makeError(name, message) {
  try { return new globalThis.DOMException(message, name); }
  catch { const err = new Error(message); err.name = name; return err; }
}

function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ─── Réveil ───
let gateUntil = 0;
let hiddenAt = hasWindow && document.visibilityState === 'hidden' ? Date.now() : 0;
let lastBeatAt = Date.now();
let lastWakeAt = 0;
const wakeListeners = new Set();
const inflight = new Set();

function abortStaleRequests(awaySince) {
  for (const entry of [...inflight]) {
    if (!entry.replayable || entry.startedAt > awaySince) continue;
    entry.reason = 'wake';
    entry.controller.abort();
  }
}

function signalWake(reason, awayMs) {
  const now = Date.now();
  // La porte se (ré)arme à CHAQUE signal, même dédoublonné : c'est elle qui
  // protège les requêtes lancées dans la foulée.
  gateUntil = now + WAKE_GRACE_MS;
  if (awayMs >= AWAY_ABORT_MS) abortStaleRequests(now - awayMs);
  if (now - lastWakeAt < WAKE_DEDUPE_MS) return;
  lastWakeAt = now;
  for (const fn of [...wakeListeners]) {
    try { fn({ reason, awayMs }); } catch (err) { console.warn('[net] wake listener', err); }
  }
}

if (hasWindow) {
  // Capture sur window : passe AVANT l'écouteur d'auth-js (posé sur window en
  // phase de bulle). La porte est donc armée quand son refresh part.
  window.addEventListener('visibilitychange', () => {
    const now = Date.now();
    if (document.visibilityState === 'hidden') { hiddenAt = now; return; }
    const awayMs = hiddenAt ? now - hiddenAt : 0;
    hiddenAt = 0;
    lastBeatAt = now;
    signalWake('visible', awayMs);
  }, true);

  // iOS restaure parfois la page depuis le bfcache sans visibilitychange.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    const now = Date.now();
    const awayMs = now - lastBeatAt;
    lastBeatAt = now;
    signalWake('pageshow', awayMs);
  });

  setInterval(() => {
    const now = Date.now();
    const gap = now - lastBeatAt;
    lastBeatAt = now;
    // Onglet caché : Chrome bride les timers (jusqu'à 1/min), un trou n'y prouve
    // rien. Le retour au premier plan est de toute façon couvert ci-dessus.
    if (gap >= FROZEN_GAP_MS && document.visibilityState === 'visible') signalWake('frozen', gap);
  }, HEARTBEAT_MS);
}

/** S'abonne aux réveils de l'appareil. `fn({ reason, awayMs })`. Rend le désabonnement. */
export function onWake(fn) {
  wakeListeners.add(fn);
  return () => wakeListeners.delete(fn);
}

/** Se résout quand le délai de grâce d'après-réveil est écoulé (tout de suite sinon). */
export async function afterWakeGrace() {
  let waitMs = gateUntil - Date.now();
  // La porte ne vaut jamais plus que maintenant + WAKE_GRACE_MS : un reste
  // supérieur veut dire que l'horloge système a reculé (resynchro NTP au réveil).
  // On la recale au lieu de retenir toutes les requêtes de l'app.
  if (waitMs > WAKE_GRACE_MS) {
    waitMs = WAKE_GRACE_MS;
    gateUntil = Date.now() + WAKE_GRACE_MS;
  }
  if (waitMs > 0) await sleep(waitMs);
}

// ─── Santé du réseau ───
// Un échec réseau (timeout, fetch rejeté) lève `degraded`. Le coordinateur de
// reprise s'en sert pour sonder le retour du réseau puis rejouer les lectures :
// un module dont le chargement a échoué se répare ainsi sans que l'utilisateur
// ait à relancer l'app. On ne déduit PAS le retour du réseau d'une réponse
// réussie : un GET peut être servi par le cache du service worker hors-ligne.
const degradedListeners = new Set();

function noteFailure() {
  for (const fn of [...degradedListeners]) {
    try { fn(); } catch (err) { console.warn('[net] degraded listener', err); }
  }
}

/** S'abonne aux échecs réseau. Rend le désabonnement. */
export function onNetworkFailure(fn) {
  degradedListeners.add(fn);
  return () => degradedListeners.delete(fn);
}

let probeConfig = null;

/** Appelé une fois par supabase.js : de quoi sonder le réseau sans dépendre de lui. */
export function configureNetProbe({ url, apikey }) {
  probeConfig = url ? { url: `${String(url).replace(/\/$/, '')}/auth/v1/health`, apikey } : null;
}

/**
 * Le réseau répond-il VRAIMENT ? /auth/ n'est jamais routé par le service
 * worker : une réponse, quelle qu'elle soit, prouve la connectivité réelle.
 */
export async function probeNetwork(timeoutMs = 5000) {
  if (!probeConfig) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  await afterWakeGrace();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await nativeFetch(probeConfig.url, {
      method: 'GET',
      cache: 'no-store',
      headers: probeConfig.apikey ? { apikey: probeConfig.apikey } : {},
      signal: controller.signal,
    });
    // 401 / 403 / 404 prouvent la connectivité. Un 5xx, c'est un incident côté
    // Supabase : rejouer les lectures ou recharger l'app n'y changerait rien.
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch borné. Même signature que fetch, plus une option maison `timeoutMs`
 * (retirée avant l'appel natif) pour les appels dont on connaît la durée.
 *
 * Nom de l'erreur de timeout : postgrest-js réessaie seul les GET sur toute
 * erreur réseau SAUF `AbortError` (3 essais, 1/2/4 s). Le premier essai rend
 * donc `TimeoutError` (→ un réessai transparent pour le module), et le réessai
 * - reconnaissable à son en-tête X-Retry-Count - rend `AbortError` pour
 * arrêter là : pire cas d'une lecture ≈ 2 budgets, pas 4.
 */
export async function resilientFetch(input, init) {
  const { timeoutMs, ...options } = init || {};
  await afterWakeGrace();

  const url = typeof input === 'string' ? input : String(input?.url || input || '');
  const method = String(options.method || input?.method || 'GET').toUpperCase();
  const baseBudget = budgetFor(url, method);
  const budget = Number(timeoutMs) > 0
    ? Number(timeoutMs)
    : Math.max(baseBudget, uploadBudgetMs(url, method, options.body));
  const isRetry = Number(readHeader(options.headers, 'X-Retry-Count')) > 0;

  const controller = new AbortController();
  const entry = { controller, startedAt: Date.now(), replayable: isReplayable(url, method), reason: null };

  // Signal de l'appelant (abortSignal() de postgrest, annulation d'un upload…) :
  // on le relaie, AbortSignal.any n'existant pas avant Safari 17.4.
  const callerSignal = options.signal || null;
  const relayAbort = () => { entry.reason = entry.reason || 'caller'; controller.abort(); };
  if (callerSignal) {
    if (callerSignal.aborted) relayAbort();
    else callerSignal.addEventListener('abort', relayAbort, { once: true });
  }

  let timer = null;
  const release = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    inflight.delete(entry);
    if (callerSignal) callerSignal.removeEventListener('abort', relayAbort);
  };
  const arm = (ms) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      entry.reason = entry.reason || 'timeout';
      controller.abort();
      release();
    }, ms);
  };

  inflight.add(entry);
  arm(budget);

  try {
    const response = await nativeFetch(input, { ...options, signal: controller.signal });
    // La réponse est entamée : on borne encore la lecture du corps, puis on
    // lâche. Abandonner une réponse déjà entièrement lue est sans effet.
    arm(Math.max(BODY_BUDGET_MS, baseBudget));
    return response;
  } catch (err) {
    release();
    if (entry.reason === 'caller') throw err;
    // Un abandon au réveil n'est pas une panne : la requête est rejouée d'office.
    if (entry.reason !== 'wake') noteFailure();
    if (entry.reason === 'timeout' || entry.reason === 'wake') {
      const why = entry.reason === 'wake' ? 'abandonnée au réveil de l\'appareil' : `sans réponse après ${Math.round(budget / 1000)} s`;
      // Abandon au réveil : toujours rejouable. Timeout : un seul réessai.
      const name = entry.reason === 'timeout' && isRetry ? 'AbortError' : 'TimeoutError';
      throw makeError(name, `Requête ${why}`);
    }
    throw err;
  }
}
