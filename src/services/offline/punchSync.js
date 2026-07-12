// ─────────────────────────────────────────────────────────────
// Pointage hors-ligne : mise en file et rejeu.
//
// Règle métier dure : un punch ne doit JAMAIS être bloqué. Hors-ligne
// (ou réseau défaillant), le punch est horodaté au moment du geste (UTC),
// stocké dans IndexedDB, puis rejoué DANS L'ORDRE au retour du réseau via
// la RPC pointer_offline, idempotente par client_uuid : zéro doublon,
// même si un punch online a abouti côté serveur après un timeout client
// (le rejeu n'écrit que si la colonne de pointage est encore NULL).
//
// Déclencheurs de rejeu : événement `online`, démarrage de l'app
// (startPunchSync), nouvelle mise en file, retry périodique tant que la
// file n'est pas vide. Le rejeu ne traite que les punches de l'utilisateur
// de la session courante (la RPC re-vérifie l'appartenance côté serveur) ;
// ceux d'un autre utilisateur restent en file jusqu'à sa prochaine session
// sur cet appareil.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { punchQueue } from './punchQueue.js';
import { zurichClock } from '../../utils/zurichTime.js';

const RETRY_DELAY_MS = 60 * 1000;
// Un punch refusé par une erreur métier répétée (élément malformé) finit par
// être abandonné pour ne pas bloquer la tête de file. Les erreurs RÉSEAU ne
// comptent jamais comme tentative : un punch en attente de réseau est éternel.
const MAX_BUSINESS_ATTEMPTS = 10;

const listeners = new Set();
let pendingCount = 0;
let syncing = false;
let retryTimer = null;
let started = false;

function emit() {
  listeners.forEach((listener) => {
    try { listener(pendingCount); } catch { /* listener défaillant : ignoré */ }
  });
}

async function refreshPendingCount() {
  try {
    pendingCount = await punchQueue.count();
  } catch {
    pendingCount = 0;
  }
  emit();
  scheduleRetry();
}

function scheduleRetry() {
  if (pendingCount > 0 && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      syncPendingPunches();
    }, RETRY_DELAY_MS);
  }
}

function generateUuid() {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  // Fallback v4 (vieux WebView) : aléa suffisant pour une clé d'idempotence.
  const bytes = new Uint8Array(16);
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Erreur réseau (fetch échoué, timeout) : pas de code PostgREST. Une erreur
// métier ou d'infrastructure porte toujours un code (P0001, PGRST..., 22...).
export function isNetworkPunchError(error) {
  return !error?.code;
}

// Course en cas de réseau lent : au-delà de `ms`, le punch part en file.
// Si l'appel online aboutit malgré tout côté serveur, le rejeu du punch mis
// en file est sans effet (anti-double SQL) : zéro doublon possible.
export function withPunchTimeout(promise, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('réseau trop lent, pointage mis en file')), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Met un punch en file, horodaté MAINTENANT (heure du geste, jamais regénérée
// à la synchronisation). Retourne l'élément stocké + l'heure optimiste Zurich
// à afficher immédiatement (feedback identique au pointage online).
export async function queuePunch({ shiftId, type, userId, etablissementId }) {
  const item = {
    clientUuid: generateUuid(),
    shiftId,
    type,
    userId: userId || null,
    etablissementId: etablissementId || null,
    eventAt: new Date().toISOString(),
    createdAt: Date.now(),
    attempts: 0,
  };
  await punchQueue.put(item);
  await refreshPendingCount();
  return { ...item, optimisticTime: zurichClock() };
}

// Rejoue la file en FIFO. S'arrête au premier échec réseau (l'ordre est
// préservé, on retentera). Retire l'élément sur tout statut renvoyé par la
// RPC ('applied', 'duplicate', 'not_applied') : l'événement est journalisé
// côté base quoi qu'il arrive.
export async function syncPendingPunches() {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id || null;
    if (!sessionUserId) return;

    const items = (await punchQueue.list())
      .filter((item) => !item.userId || item.userId === sessionUserId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const item of items) {
      const { error } = await supabase.rpc('pointer_offline', {
        p_shift_id: item.shiftId,
        p_type: item.type,
        p_event_at: item.eventAt,
        p_client_uuid: item.clientUuid,
        p_etablissement_id: item.etablissementId,
      });

      if (!error) {
        await punchQueue.remove(item.clientUuid);
        continue;
      }

      // Réseau tombé en cours de rejeu, RPC pas encore déployée (PGRST202)
      // ou JWT en cours de rafraîchissement (PGRST301) : file intacte, retry.
      if (isNetworkPunchError(error) || error.code === 'PGRST202' || error.code === 'PGRST301') {
        break;
      }

      const attempts = (item.attempts || 0) + 1;
      if (attempts >= MAX_BUSINESS_ATTEMPTS) {
        console.error('[punchSync] Punch abandonné après erreurs métier répétées', item, error);
        await punchQueue.remove(item.clientUuid);
      } else {
        await punchQueue.put({ ...item, attempts });
      }
    }
  } catch (err) {
    console.warn('[punchSync] Rejeu interrompu', err);
  } finally {
    syncing = false;
    await refreshPendingCount();
  }
}

// Compteur d'attente : abonnement pour l'UI (bandeau hors-ligne).
// Compatible useSyncExternalStore (le listener est rappelé à chaque variation).
export function subscribePendingPunches(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingPunchCount() {
  return pendingCount;
}

// Démarre les déclencheurs de rejeu. Appelé une fois au boot de l'app,
// sans effet aux appels suivants.
export function startPunchSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { syncPendingPunches(); });
  refreshPendingCount().then(() => {
    if (pendingCount > 0) syncPendingPunches();
  });
}
