// ─────────────────────────────────────────────────────────────
// Statuts de chambre hors ligne : mise en file et envoi (lot 23).
//
// Dans une annexe ou un sous-sol, le réseau manque. Le geste (nouveau statut
// d'une chambre) reçoit sa clé et son heure sur l'appareil avant tout essai.
// Il part en ligne si possible, sinon en file IndexedDB, puis il est rejoué
// seul au retour du réseau. Les deux chemins passent par la même RPC
// (chambre_statut_geste) avec la même clé : un essai en ligne parti après un
// délai dépassé puis rejoué rend « déjà reçu », jamais un doublon.
//
// Le plus récent gagne, décidé par la base : un geste rejoué plus ancien que
// le dernier changement connu rend 'ignore', se retire de la file, et l'écran
// relit la chambre. Seuls les gestes de la personne connectée se rejouent.
//
// Déclencheurs de rejeu : événement `online`, démarrage de l'app, nouvelle
// mise en file, reprise toutes les 60 s tant que la file n'est pas vide.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { etagesQueue } from './etagesQueue.js';
import { generateUuid, isNetworkError, withTimeout } from './offlineNet.js';
import { notify } from '../../components/toast/index.js';
import { PHRASE_IGNORE, nouveauGeste, parametresRpc, phraseRefus, rejouerFile } from '../../modules/etages/statutsHorsLigne.js';

const RETRY_DELAY_MS = 60 * 1000;

const listeners = new Set();
let pendingCount = 0;
let syncing = false;
let retryTimer = null;
let started = false;

function emit() {
  listeners.forEach((listener) => {
    try { listener(pendingCount); } catch { /* abonné défaillant : ignoré */ }
  });
}

async function refreshPendingCount() {
  try {
    pendingCount = await etagesQueue.count();
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
      syncPendingGestes();
    }, RETRY_DELAY_MS);
  }
}

function horsLigne() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

async function envoyer(geste, options) {
  const { data, error } = await supabase.rpc('chambre_statut_geste', parametresRpc(geste, options));
  return { data: data ?? null, error: error || null };
}

// Rend { mode: 'online', resultat } ou { mode: 'online', error } (erreur
// métier, telle que la base la rend), ou { mode: 'queued', geste }. Lève si
// IndexedDB refuse : le geste n'est jamais affiché comme gardé alors qu'il
// ne l'est pas.
export async function changerStatutOuGarder({ etablissementId, chambreId, numero, statut, motif = null, userId }) {
  const geste = nouveauGeste({
    cle: generateUuid(), etablissementId, chambreId, numero, statut, motif,
    gesteAt: new Date().toISOString(), userId, maintenantMs: Date.now(),
  });
  if (!horsLigne()) {
    try {
      const res = await withTimeout(envoyer(geste, { enLigne: true }));
      if (!res.error) {
        if (pendingCount > 0) syncPendingGestes();
        return { mode: 'online', resultat: res.data };
      }
      if (!isNetworkError(res.error) || !userId) return { mode: 'online', error: res.error };
    } catch (err) {
      if (!isNetworkError(err) || !userId) return { mode: 'online', error: err };
    }
  } else if (!userId) {
    return { mode: 'online', error: new Error('Session inconnue : changement non gardé') };
  }
  await etagesQueue.put(geste);
  await refreshPendingCount();
  return { mode: 'queued', geste };
}

export async function syncPendingGestes() {
  if (syncing) return;
  if (horsLigne()) return;
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id || null;
    if (!sessionUserId) return;
    const elements = (await etagesQueue.list()).filter((item) => item.userId === sessionUserId);
    if (!elements.length) return;
    const bilan = await rejouerFile({
      elements,
      envoyer: (el) => envoyer(el, { enLigne: false }),
      retirer: (cle) => etagesQueue.remove(cle),
      garder: (el) => etagesQueue.put(el),
      avertir: (el, error) => {
        console.error('[etagesSync] Changement de statut refusé par la base', el, error);
        notify(phraseRefus(el), 'warning', { duration: 0 });
      },
    });
    if (bilan.ignores > 0) notify(PHRASE_IGNORE, 'info');
  } catch (err) {
    console.warn('[etagesSync] Rejeu interrompu', err);
  } finally {
    syncing = false;
    await refreshPendingCount();
  }
}

// Gestes encore en file : l'écran les affiche par-dessus le serveur.
export async function listPendingGestes(etabId) {
  try {
    const items = await etagesQueue.list();
    return etabId ? items.filter((item) => item.etablissementId === etabId) : items;
  } catch {
    return [];
  }
}

// Compatible useSyncExternalStore : rappelé à chaque relecture du compteur.
export function subscribePendingGestes(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingGesteCount() {
  return pendingCount;
}

export function startEtagesSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { syncPendingGestes(); });
  refreshPendingCount().then(() => {
    if (pendingCount > 0) syncPendingGestes();
  });
}
