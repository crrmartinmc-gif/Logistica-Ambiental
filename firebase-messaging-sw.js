/* Firebase Cloud Messaging - Service Worker para App Choferes */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyC5-FVVGfNBCaIG2CYCW56534S-iVBZ7oI',
  authDomain: 'panel-de-control-ac0d8.firebaseapp.com',
  projectId: 'panel-de-control-ac0d8',
  storageBucket: 'panel-de-control-ac0d8.firebasestorage.app',
  messagingSenderId: '477303833717',
  appId: '1:477303833717:web:436eda13e40968b6c7a43c',
  measurementId: 'G-035YETY4B2'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || '🔔 App Choferes';
  const body = notification.body || 'Tenés una nueva novedad.';
  const link = data.appUrl || payload.fcmOptions?.link || notification.click_action || self.location.origin + '/';

  self.registration.showNotification(title, {
    body,
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: data.idAsignacion ? 'asignacion-' + data.idAsignacion : 'app-choferes',
    renotify: true,
    data: { link }
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification?.data?.link || self.location.origin + '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          try {
            if (link && 'navigate' in client) client.navigate(link);
          } catch (e) {}
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(link);
    })
  );
});
