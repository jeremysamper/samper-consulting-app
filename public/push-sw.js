// ═══════════════════════════════════════════════════════════════════════════
// Notifications push, chargées par le service worker de l'app (vite.config.js,
// workbox.importScripts). Message envoyé par l'Edge Function « notifications » :
//   { titre, corps, url, tag }
// Un tap ouvre l'app sur la bonne page (ou la remet au premier plan si elle est
// déjà ouverte, et lui demande d'aller sur la page : message 'sc-naviguer').
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch (e) { m = { corps: event.data ? event.data.text() : '' }; }
  const titre = m.titre || 'Samper Consulting';
  event.waitUntil(self.registration.showNotification(titre, {
    body: m.corps || '',
    tag: m.tag || undefined,
    renotify: Boolean(m.tag),
    icon: '/icons/icon-192-v2.png',
    badge: '/icons/icon-192-v2.png',
    data: { url: m.url || '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const cible = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
  event.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = fenetres.find((c) => new URL(c.url).origin === self.location.origin);
    if (app) {
      app.postMessage({ type: 'sc-naviguer', page: cible.searchParams.get('page'), etab: cible.searchParams.get('etab') });
      return app.focus();
    }
    return self.clients.openWindow(cible.href);
  })());
});
