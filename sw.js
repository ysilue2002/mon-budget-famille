// Service worker de nettoyage : désinstalle l'ancienne application
// et supprime ses caches, puis recharge la page.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try { await self.registration.unregister(); } catch (e) {}
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch (e) {}
    try {
      const list = await self.clients.matchAll({ type: 'window' });
      list.forEach((c) => c.navigate(c.url));
    } catch (e) {}
  })());
});
