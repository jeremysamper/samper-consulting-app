// ─────────────────────────────────────────────────────────────
// Saisie d'inventaire hors-ligne : mise en file et rejeu.
//
// On compte les marchandises là où elles sont (chambre froide, cave, réserve
// au sous-sol), c'est-à-dire précisément là où il n'y a pas de réseau. Une
// quantité comptée ne doit donc jamais être perdue ni bloquée : elle est
// horodatée au moment du geste, stockée dans IndexedDB, puis rejouée au retour
// du réseau via la RPC inventaire_saisir_stock, idempotente par client_uuid.
//
// Le MÊME chemin sert en ligne et hors-ligne. La RPC fusionne une seule ligne
// dans l'état serveur au lieu de réécrire l'inventaire entier : deux personnes
// qui comptent le même inventaire chacune de leur côté ne s'écrasent plus, et
// une tablette restée deux heures hors-ligne ne supprime pas au réveil les
// produits ajoutés entre-temps.
//
// Conflit : le comptage le plus RÉCENT gagne, jamais le dernier synchronisé
// (arbitrage serveur sur `compteLe`, l'heure du geste). Une saisie périmée
// ressort en statut 'stale' et quitte la file sans rien écraser.
//
// Déclencheurs de rejeu : événement `online`, démarrage de l'app, nouvelle
// mise en file, retry périodique tant que la file n'est pas vide.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { cleSaisie, inventaireQueue } from './inventaireQueue.js';
import { generateUuid, isNetworkError, withTimeout } from './offlineNet.js';

const RETRY_DELAY_MS = 60 * 1000;
// Une saisie refusée par une erreur métier répétée finit par être abandonnée
// pour ne pas bloquer la file. Les erreurs RÉSEAU ne comptent jamais comme
// tentative : une quantité en attente de réseau est éternelle.
const MAX_BUSINESS_ATTEMPTS = 10;

// La RPC n'est pas encore déployée sur cette base, ou le JWT est en cours de
// rafraîchissement : la file reste intacte et on retentera.
const CODES_RETENTABLES = new Set(['PGRST202', 'PGRST301']);

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
    pendingCount = await inventaireQueue.count();
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
      syncPendingSaisies();
    }, RETRY_DELAY_MS);
  }
}

function appelRpc({ inventaireId, ligneId, stockReel, compteLe, clientUuid }) {
  return supabase.rpc('inventaire_saisir_stock', {
    p_inventaire_id: inventaireId,
    p_ligne_id: ligneId,
    p_stock_reel: stockReel,
    p_compte_le: compteLe,
    p_client_uuid: clientUuid,
  });
}

// Met une quantité en file, horodatée MAINTENANT. Recompter le même produit
// avant la synchronisation remplace la saisie en attente (clé = inventaire +
// ligne) : seule la dernière quantité comptée a un sens.
export async function queueSaisie({ inventaireId, ligneId, stockReel, produit, unite, userId, etablissementId }) {
  const item = {
    cle: cleSaisie(inventaireId, ligneId),
    clientUuid: generateUuid(),
    inventaireId,
    ligneId,
    produit: produit || '',
    unite: unite || '',
    stockReel,
    compteLe: new Date().toISOString(),
    userId: userId || null,
    etablissementId: etablissementId || null,
    createdAt: Date.now(),
    attempts: 0,
  };
  await inventaireQueue.put(item);
  await refreshPendingCount();
  return item;
}

// Rejoue la file en FIFO. S'arrête au premier échec réseau (on retentera).
// Retire l'élément sur tout statut renvoyé par la RPC ('applied', 'duplicate',
// 'stale', 'not_applied') : la saisie est journalisée côté base quoi qu'il
// arrive, la garder en file ne ferait que la rejouer sans fin.
export async function syncPendingSaisies() {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id || null;
    if (!sessionUserId) return;

    const items = (await inventaireQueue.list())
      .filter((item) => !item.userId || item.userId === sessionUserId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const item of items) {
      const { error } = await appelRpc(item);

      if (!error) {
        // removeIfUnchanged : si le produit a été recompté pendant l'envoi, la
        // nouvelle quantité reste en file au lieu d'être perdue.
        await inventaireQueue.removeIfUnchanged(item.cle, item.clientUuid);
        continue;
      }

      if (isNetworkError(error) || CODES_RETENTABLES.has(error.code)) break;

      const attempts = (item.attempts || 0) + 1;
      if (attempts >= MAX_BUSINESS_ATTEMPTS) {
        console.error('[inventaireSync] Saisie abandonnée après erreurs métier répétées', item, error);
        await inventaireQueue.removeIfUnchanged(item.cle, item.clientUuid);
      } else {
        await inventaireQueue.put({ ...item, attempts });
      }
    }
  } catch (err) {
    console.warn('[inventaireSync] Rejeu interrompu', err);
  } finally {
    syncing = false;
    await refreshPendingCount();
  }
}

// Flux de saisie partagé. Tente l'écriture online via la RPC sous timeout ;
// en cas de défaillance RÉSEAU uniquement, bascule en file hors-ligne.
//
// `sauvegardeHistorique` est le repli utilisé tant que la migration
// 20260810_inventaire_saisie_offline n'est pas appliquée (RPC absente,
// PGRST202) : on réécrit l'inventaire entier comme avant. Le front reste donc
// déployable avant la migration, sans que la brigade perde la saisie.
//
// Retourne { mode: 'online' | 'repli' | 'queued', statut? }. En ligne, statut
// est celui de la RPC ('applied', 'duplicate', 'stale', 'not_applied') :
// l'appelant doit réafficher la valeur serveur sur 'stale' et 'not_applied'.
export async function saisirStockOnlineOrQueue({
  inventaireId, ligneId, stockReel, produit, unite, userId, etablissementId, sauvegardeHistorique,
}) {
  if (typeof navigator === 'undefined' || navigator.onLine !== false) {
    const clientUuid = generateUuid();
    try {
      const { data, error } = await withTimeout(appelRpc({
        inventaireId, ligneId, stockReel, compteLe: new Date().toISOString(), clientUuid,
      }));
      if (!error) {
        if (getPendingSaisieCount() > 0) syncPendingSaisies();
        return { mode: 'online', statut: data?.status || 'applied' };
      }
      if (error.code === 'PGRST202' && typeof sauvegardeHistorique === 'function') {
        await sauvegardeHistorique();
        return { mode: 'repli' };
      }
      // Erreur métier : remontée à l'appelant, qui garde son affichage d'erreur.
      if (!isNetworkError(error)) throw error;
    } catch (err) {
      if (!isNetworkError(err)) throw err;
    }
  }
  const queued = await queueSaisie({ inventaireId, ligneId, stockReel, produit, unite, userId, etablissementId });
  return { mode: 'queued', queued };
}

// Compteur d'attente : abonnement pour l'UI (bandeau + module Inventaire).
// Compatible useSyncExternalStore (le listener est rappelé à chaque variation).
export function subscribePendingSaisies(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingSaisieCount() {
  return pendingCount;
}

// Quantités encore en file : le module les réapplique par-dessus les données
// serveur (ou celles du cache hors-ligne), sinon la ligne réaffiche l'ancienne
// valeur au rechargement et le comptage semble perdu.
// Sans argument : toute la file. Avec : un seul inventaire.
export async function listPendingSaisies(inventaireId) {
  try {
    const items = await inventaireQueue.list();
    return inventaireId ? items.filter((item) => item.inventaireId === inventaireId) : items;
  } catch {
    return [];
  }
}

// Démarre les déclencheurs de rejeu. Appelé une fois au boot de l'app,
// sans effet aux appels suivants.
export function startInventaireSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { syncPendingSaisies(); });
  refreshPendingCount().then(() => {
    if (pendingCount > 0) syncPendingSaisies();
  });
}
