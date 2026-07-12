// ─────────────────────────────────────────────────────────────
// Enregistrement du service worker (vite-plugin-pwa, mode 'prompt').
//
// Pas de skipWaiting en pleine session : une nouvelle version détectée
// reste en attente et le bandeau global propose « Mettre à jour », qui
// active le SW puis recharge la page. Sans action, la mise à jour
// s'applique de toute façon au prochain démarrage complet de l'app.
// Un contrôle périodique couvre les tablettes qui ne ferment jamais l'app.
//
// En dev le SW est désactivé (devOptions.enabled = false) : le module
// virtuel existe mais l'enregistrement est sans effet.
// ─────────────────────────────────────────────────────────────

import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_MS = 60 * 60 * 1000; // 1 h

const listeners = new Set();
let updateReady = false;
let applyUpdateFn = null;

function emit() {
  listeners.forEach((listener) => {
    try { listener(updateReady); } catch { /* listener défaillant : ignoré */ }
  });
}

export function initPwa() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        updateReady = true;
        applyUpdateFn = () => updateSW(true);
        emit();
      },
      onRegisteredSW(swUrl, registration) {
        if (!registration) return;
        setInterval(() => {
          registration.update().catch(() => { /* hors-ligne : sans importance */ });
        }, UPDATE_CHECK_MS);
      },
    });
  } catch (err) {
    console.warn('[PWA] Enregistrement du service worker impossible', err);
  }
}

// Abonnement pour l'UI (bandeau global). Compatible useSyncExternalStore.
export function subscribePwaUpdate(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isPwaUpdateReady() {
  return updateReady;
}

// Active le SW en attente puis recharge la page (action utilisateur).
export function applyPwaUpdate() {
  if (applyUpdateFn) applyUpdateFn();
}
