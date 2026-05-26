// Service Worker para Firebase Cloud Messaging (FCM)
// Debe estar en la raíz del sitio para tener el scope correcto
// Usa el SDK compat porque los SW no soportan ES modules en todos los browsers

importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

// IMPORTANTE: Esta config debe coincidir con la de firebase-config.js
// Se duplica aquí porque el SW no puede hacer import de otros módulos
firebase.initializeApp({
  apiKey: "AIzaSyDMyw0DjFlnq7qyfizBUhblCNyQKt-OPrU",
  authDomain: "maquinas-master.firebaseapp.com",
  projectId: "maquinas-master",
  storageBucket: "maquinas-master.firebasestorage.app",
  messagingSenderId: "912625811269",
  appId: "1:912625811269:web:83b3cf64c15aebb39d882c"
});

const messaging = firebase.messaging();

// Manejo de mensajes en background (app cerrada o en segundo plano)
messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const notificationTitle = title || 'Stock de Maquinas';
  const notificationOptions = {
    body: body || 'Hubo un cambio en el stock.',
    icon: '/Maquinas-Master/icon-192.png',
    badge: '/Maquinas-Master/icon-192.png',
    tag: payload.data?.maquina_id || 'stock-update',
    data: payload.data || {},
    vibrate: [200, 100, 200],
    requireInteraction: false
  };
  self.registration.showNotification(notificationTitle, notificationOptions);
});

// Al tocar la notificación, abre o enfoca la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const appUrl = '/Maquinas-Master/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes('/Maquinas-Master/') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(appUrl);
      }
    })
  );
});
