// ─────────────────────────────────────────────────────────────
// Récupération automatique quand un chunk lazy ne charge pas.
//
// Après un déploiement, les anciens fichiers hashés n'existent plus sur
// le serveur : un onglet resté ouvert sur l'ancienne version qui ouvre un
// module pas encore visité reçoit la réécriture SPA (du HTML) à la place
// du chunk JS et le module plante. Les clients avec service worker actif
// sont protégés (précache complet du bundle courant) ; ce filet couvre
// les autres (première visite, navigation privée, SW non installé).
//
// Vite émet 'vite:preloadError' précisément dans ce cas : on recharge la
// page une seule fois (garde anti-boucle en sessionStorage) pour récupérer
// le nouveau bundle, de façon transparente pour l'utilisateur. Si l'échec
// persiste (vraie panne réseau), on laisse l'erreur remonter : SafeModule
// affiche alors son écran d'erreur au lieu de recharger en boucle.
// ─────────────────────────────────────────────────────────────

const RELOAD_GUARD_KEY = 'sc_chunk_reload_at';
const RELOAD_GUARD_MS = 2 * 60 * 1000;

export function installPreloadErrorRecovery() {
  if (typeof window === 'undefined') return;

  window.addEventListener('vite:preloadError', (event) => {
    let lastReloadAt = 0;
    try {
      lastReloadAt = Number(sessionStorage.getItem(RELOAD_GUARD_KEY)) || 0;
    } catch { /* sessionStorage indisponible : on tentera quand même un reload */ }

    if (Date.now() - lastReloadAt < RELOAD_GUARD_MS) return;

    try {
      sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    } catch { /* sans garde persistée, le reload reste tenté une fois par chargement */ }

    event.preventDefault();
    window.location.reload();
  });
}
