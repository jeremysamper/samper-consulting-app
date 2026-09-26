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
import { generateUuid, isNetworkError, withTimeout } from './offlineNet.js';
import { zurichClock } from '../../utils/zurichTime.js';

// Noms historiques conservés : ces primitives sont désormais partagées avec la
// file de saisie d'inventaire (offlineNet.js), le comportement est inchangé.
export { isNetworkError as isNetworkPunchError, withTimeout as withPunchTimeout };

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
      if (isNetworkError(error) || error.code === 'PGRST202' || error.code === 'PGRST301') {
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

// Flux de pointage partagé (Planning, Dashboard, DashboardMobile) : tente le
// pointage online (RPC inchangée, `call` est une fabrique de promesse) sous
// timeout ; en cas de défaillance RÉSEAU uniquement, bascule en file hors-ligne.
// Retourne { mode: 'online', row } ou { mode: 'queued', queued } ; relance
// l'erreur telle quelle pour une erreur MÉTIER (déjà pointé, non autorisé...)
// afin que l'appelant garde son affichage d'erreur habituel.
export async function punchOnlineOrQueue({ call, shiftId, type, userId, etablissementId }) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    try {
      const row = await withTimeout(call());
      if (getPendingPunchCount() > 0) syncPendingPunches();
      return { mode: 'online', row };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const queued = await queuePunch({ shiftId, type, userId, etablissementId });
  return { mode: 'queued', queued };
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
