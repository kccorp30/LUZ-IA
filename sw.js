// LUZ IA - Service Worker v1
var CACHE_NAME = 'luz-ia-v1';

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(clients.claim());
});

// Recibir notificaciones push del servidor
self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data.json(); } catch(err) { data = { title: 'La Curva Street Food', body: e.data ? e.data.text() : 'Actualización de tu pedido' }; }
  e.waitUntil(
    self.registration.showNotification(data.title || 'La Curva Street Food', {
      body: data.body || 'Tienes una actualización en tu pedido',
      icon: data.icon || '/favicon.ico',
      badge: '/favicon.ico',
      vibrate: [200, 100, 200],
      data: data,
      actions: [
        { action: 'ver', title: '👀 Ver pedido' }
      ]
    })
  );
});

// Click en notificación
self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = e.notification.data && e.notification.data.url ? e.notification.data.url : '/';
  if (e.action === 'ver' || !e.action) {
    e.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
        for (var i = 0; i < clientList.length; i++) {
          var client = clientList[i];
          if (client.url.indexOf('/menu') !== -1 && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(url);
      })
    );
  }
});
