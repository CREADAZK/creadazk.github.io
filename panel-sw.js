/* DKAS · panel: al tocar una notificación abre (o enfoca) el panel en ese pedido. No guarda nada en caché. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || 'taller.html', ir = url.split('#')[1];
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    const w = l.find(c => /taller\.html/.test(c.url));
    if (w) { w.postMessage({ ir: ir ? '#' + ir : '' }); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
