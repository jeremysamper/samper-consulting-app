// ═══════════════════════════════════════════════════════════════════════════
// Notifications push, chargées par le service worker de l'app (vite.config.js,
// workbox.importScripts). Message envoyé par l'Edge Function « notifications » :
//   { titre, corps, url, tag, vibration?, groupe? }
// Un tap ouvre l'app sur la bonne page (ou la remet au premier plan si elle est
// déjà ouverte, et lui demande d'aller sur la page : message 'sc-naviguer').
// vibration : motif porté par les avis « plats prêts » de la caisse. Le son
// n'est jamais coupé d'ici (pas d'option silent) : il suit le téléphone.
// groupe : les avis « plats prêts » partent en rafale (chaque envoi fait
// vibrer). La nouvelle notification s'affiche, puis celles du même groupe déjà
// affichées se ferment : il n'en reste qu'une. Sur iPhone le tag ne remplace
// rien, d'où une clé propre à chaque affichage, gardée dans data.
// ═══════════════════════════════════════════════════════════════════════════
self.addEventListener('push', (event) => {
  let m = {};
  try { m = event.data ? event.data.json() : {}; } catch (e) { m = { corps: event.data ? event.data.text() : '' }; }
  const titre = m.titre || 'Samper Consulting';
  const groupe = typeof m.groupe === 'string' && m.groupe ? m.groupe : null;
  const cle = `${m.tag || ''}:${Date.now()}:${Math.random()}`;
  const options = {
    body: m.corps || '',
    tag: m.tag || undefined,
    renotify: Boolean(m.tag),
    icon: '/icons/icon-192-v4.png',
    badge: '/icons/icon-192-v4.png',
    data: { url: m.url || '/', groupe, cle },
  };
  if (Array.isArray(m.vibration) && m.vibration.length) options.vibrate = m.vibration;
  event.waitUntil((async () => {
    await self.registration.showNotification(titre, options);
    if (!groupe) return;
    try {
      const affichees = await self.registration.getNotifications();
      affichees.forEach((n) => {
        const d = n.data || {};
        if (d.groupe === groupe && d.cle !== cle) n.close();
      });
    } catch (e) { /* liste illisible : les notifications restent, rien de plus */ }
  })());
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
