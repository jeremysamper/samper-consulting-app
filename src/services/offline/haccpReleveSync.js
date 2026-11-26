// ─────────────────────────────────────────────────────────────
// Relevés de température HACCP hors ligne : mise en file et rejeu (lot 08).
//
// Le relevé se prend là où le réseau manque (sous-sol, chambre froide). Il
// n'est donc jamais perdu : son `id` est posé sur l'appareil avant tout
// essai, il part en ligne si possible, sinon en file IndexedDB avec la date
// et l'heure du geste, puis il est rejoué seul au retour du réseau.
//
// Le rejeu insère « si absent » (insertHaccpReleveSiAbsent) : un relevé parti
// en ligne après un délai dépassé puis rejoué ne s'écrit pas deux fois, et
// aucune ligne déjà en base n'est réécrite. Seuls les relevés de la personne
// connectée se rejouent (filtre strict, sans tolérance d'un `userId` absent).
//
// Déclencheurs de rejeu : événement `online`, démarrage de l'app, nouvelle
// mise en file, reprise toutes les 60 s tant que la file n'est pas vide.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { dbService } from '../dbService.js';
import { haccpReleveQueue } from './haccpReleveQueue.js';
import { generateUuid, isNetworkError, withTimeout } from './offlineNet.js';
import { notify } from '../../components/toast/index.js';
import { elementDeFile, nouvelIdReleve, phraseRefus, rejouerFile } from '../../modules/haccp/relevesHorsLigne.js';

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
    pendingCount = await haccpReleveQueue.count();
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
      syncPendingReleves();
    }, RETRY_DELAY_MS);
  }
}

function horsLigne() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// Met le relevé en file. Lève si IndexedDB refuse : le relevé n'est jamais
// affiché comme gardé alors qu'il ne l'est pas.
async function mettreEnFile(releve, userId, zoneNom) {
  const element = elementDeFile(releve, { userId, maintenantMs: Date.now(), zoneNom });
  await haccpReleveQueue.put(element);
  await refreshPendingCount();
  return element;
}

// Rend { mode: 'online' | 'queued', releve }. Une erreur métier remonte telle
// quelle ; une erreur réseau met en file sous le même `id`. `sansEssai` : la
// ligne précédente du même lot est déjà partie en file, on n'attend pas huit
// secondes de plus pour celle-ci.
export async function releverOnlineOrQueue({ releve, userId, zoneNom = '', sansEssai = false }) {
  const bridge = dbService.getBridge();
  const avecId = { ...releve, id: releve.id || nouvelIdReleve(generateUuid()) };
  if (!sansEssai && !horsLigne()) {
    try {
      const saved = await withTimeout(bridge.db.upsertHaccpReleve(avecId));
      if (pendingCount > 0) syncPendingReleves();
      return { mode: 'online', releve: saved || avecId };
    } catch (err) {
      if (!isNetworkError(err)) throw err;
      if (!userId) throw err;
    }
  } else if (!userId) {
    throw new Error('Session inconnue : relevé non gardé');
  }
  await mettreEnFile(avecId, userId, zoneNom);
  return { mode: 'queued', releve: { ...avecId, enAttente: true } };
}

export async function syncPendingReleves() {
  if (syncing) return;
  if (horsLigne()) return;
  const bridge = dbService.getBridge();
  if (!bridge?.db?.insertHaccpReleveSiAbsent) return;
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id || null;
    if (!sessionUserId) return;
    const elements = (await haccpReleveQueue.list()).filter((item) => item.userId === sessionUserId);
    if (!elements.length) return;
    await rejouerFile({
      elements,
      envoyer: (el) => bridge.db.insertHaccpReleveSiAbsent(el),
      retirer: (id) => haccpReleveQueue.remove(id),
      garder: (el) => haccpReleveQueue.put(el),
      avertir: (el, error) => {
        console.error('[haccpReleveSync] Relevé refusé par la base', el, error);
        notify(phraseRefus(el), 'warning', { duration: 0 });
      },
    });
  } catch (err) {
    console.warn('[haccpReleveSync] Rejeu interrompu', err);
  } finally {
    syncing = false;
    await refreshPendingCount();
  }
}

// Relevés encore en file : le module les affiche par-dessus le serveur.
// Sans argument : toute la file ; avec : un seul établissement.
export async function listPendingReleves(etabId) {
  try {
    const items = await haccpReleveQueue.list();
    return etabId ? items.filter((item) => item.etablissementId === etabId) : items;
  } catch {
    return [];
  }
}

// Compatible useSyncExternalStore : rappelé à chaque relecture du compteur.
export function subscribePendingReleves(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingReleveCount() {
  return pendingCount;
}

export function startHaccpReleveSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { syncPendingReleves(); });
  refreshPendingCount().then(() => {
    if (pendingCount > 0) syncPendingReleves();
  });
}
