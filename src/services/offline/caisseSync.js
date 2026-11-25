// ─────────────────────────────────────────────────────────────
// Ventes en espèces gardées sans réseau : mise en file et rejeu
// (lot 07 du panel, 25.11.2026).
//
// Sans réseau, une maison qui l'a choisi encaisse en espèces un ticket déjà
// ouvert : la vente est gardée dans IndexedDB avec l'heure du geste, puis
// rejouée DANS L'ORDRE au retour du réseau par la RPC
// caisse_encaisser_hors_ligne, idempotente par client_uuid. La base seule
// numérote et scelle, au moment du rejeu.
//
// Déclencheurs de rejeu : événement `online`, démarrage de l'app
// (startCaisseSync), nouvelle mise en file, nouvel essai toutes les 60
// secondes tant qu'une vente attend, et le bouton « Envoyer maintenant ».
//
// Différences voulues avec le pointage :
//   - une vente n'est jamais abandonnée après N essais : l'argent est dans le
//     tiroir. Refusée ou déjà encaissée, elle reste sur l'appareil avec son
//     état et son motif, n'est plus renvoyée, et seul un responsable l'écarte ;
//   - le rejeu n'est fait que par la personne qui a encaissé, dans sa session
//     (la base écrit encaisse_par = auth.uid()). Les ventes d'une autre
//     personne restent en file, comptées et bloquantes pour la clôture ;
//   - pas de bascule sous délai : un encaissement en ligne qui traîne n'est
//     jamais mis en file tout seul.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../supabase.js';
import { caisseQueue } from './caisseQueue.js';
import { encaisserHorsLigne } from '../caisseService.js';
import { classerRejeu } from '../../modules/caisse/horsLigne.js';
import { numeroTicket } from '../../modules/caisse/tva.js';
import { notify } from '../../components/toast/index.js';

const RETRY_DELAY_MS = 60 * 1000;
const VIDE = Object.freeze([]);

const listeners = new Set();
// Image de la file de l'appareil, tous utilisateurs et tous états. Remplacée
// à chaque lecture : la référence ne change que si la file a été relue
// (compatible useSyncExternalStore).
let items = VIDE;
let pendingCount = 0;
let syncing = false;
let retryTimer = null;
let started = false;

function emit() {
  listeners.forEach((listener) => {
    try { listener(pendingCount); } catch { /* listener défaillant : ignoré */ }
  });
}

async function refresh() {
  try {
    const lus = await caisseQueue.list();
    items = lus.length
      ? Object.freeze([...lus].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))
      : VIDE;
  } catch {
    // Lecture en échec : on garde l'image connue, une vente ne disparaît pas
    // de l'écran parce que le stockage a hésité.
  }
  pendingCount = items.filter((e) => e.etat === 'attente').length;
  emit();
  scheduleRetry();
}

function scheduleRetry() {
  if (pendingCount > 0 && !retryTimer) {
    retryTimer = setTimeout(() => {
      retryTimer = null;
      syncPendingEncaissements();
    }, RETRY_DELAY_MS);
  }
}

// Garde une vente sur l'appareil. L'élément vient de elementDeFile
// (horsLigne.js). Lève si l'écriture IndexedDB échoue : l'appelant dit alors
// que rien n'est encaissé.
export async function queueEncaissement(element) {
  if (!element?.clientUuid || !element.ticketId || !element.etablissementId) {
    throw new Error('Vente hors ligne incomplète');
  }
  await caisseQueue.put({ ...element, etat: 'attente', motif: null, numero: null });
  await refresh();
  // Réseau présent mais muet un instant plus tôt : on tente tout de suite.
  syncPendingEncaissements();
  return element;
}

// Rejoue la file en FIFO. S'arrête au premier échec passager (l'ordre est
// préservé, on retentera). Un seul rejeu à la fois : un double toucher sur
// « Envoyer maintenant » n'envoie qu'une fois, et la clé clientUuid couvre
// le reste.
export async function syncPendingEncaissements() {
  if (syncing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  syncing = true;
  try {
    const { data } = await supabase.auth.getSession();
    const sessionUserId = data?.session?.user?.id || null;
    if (!sessionUserId) return;

    const aRejouer = (await caisseQueue.list())
      .filter((e) => e.etat === 'attente' && e.userId === sessionUserId)
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

    for (const element of aRejouer) {
      const { data: reponse, error } = await encaisserHorsLigne(element);
      const issue = classerRejeu(reponse, error);
      if (issue === 'reessayer') break;
      if (issue === 'rejoue') {
        await caisseQueue.remove(element.clientUuid);
        notify(`Vente hors ligne encaissée, ticket n° ${numeroTicket(reponse) || ''}`.trim(), 'success');
        continue;
      }
      if (issue === 'deja_encaisse') {
        await caisseQueue.put({ ...element, etat: 'deja_encaisse', motif: null, numero: numeroTicket(reponse) });
        notify('Une vente gardée hors ligne était déjà encaissée. Vérifiez-la dans la Caisse, Tickets ouverts.', 'warning');
        continue;
      }
      // Refus de la caisse : la vente reste sur l'appareil, plus jamais renvoyée.
      await caisseQueue.put({ ...element, etat: 'refuse', motif: String(reponse?.motif || error?.message || ''), numero: null });
      notify('Une vente gardée hors ligne a été refusée. Reprenez-la dans la Caisse, Tickets ouverts.', 'error');
    }
  } catch (err) {
    console.warn('[caisseSync] Rejeu interrompu', err);
  } finally {
    syncing = false;
    await refresh();
  }
}

// Retire une vente de l'appareil, et rien d'autre (geste d'un responsable,
// après confirmation). Le ticket, resté ouvert en base, se reprend en ligne.
export async function ecarterEncaissement(clientUuid) {
  await caisseQueue.remove(clientUuid);
  await refresh();
}

// Compteur des ventes en attente d'envoi, tous utilisateurs de l'appareil
// (bandeau global). Compatible useSyncExternalStore.
export function subscribePendingEncaissements(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPendingEncaissementCount() {
  return pendingCount;
}

// La file de l'appareil, tous états (carte « Ventes en attente d'envoi »,
// garde de clôture). Même abonnement que le compteur.
export function listEncaissementsAppareil() {
  return items;
}

// Démarre les déclencheurs de rejeu. Appelé une fois au boot de l'app.
export function startCaisseSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('online', () => { syncPendingEncaissements(); });
  refresh().then(() => {
    if (pendingCount > 0) syncPendingEncaissements();
  });
}
