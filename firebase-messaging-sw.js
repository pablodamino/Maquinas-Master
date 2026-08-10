/* ═══════════════════════════════════════════════════════════════
   Service Worker — un solo worker con dos trabajos:
     1. Notificaciones (locales desde la página, y push de FCM).
     2. Caché de la app para que abra al instante y funcione sin señal.

   Va uno solo a propósito: dos Service Workers con el mismo scope se
   pisan entre sí y gana el último registrado.
   ═══════════════════════════════════════════════════════════════ */

const VERSION      = 'pm-v2.6.1';
const CACHE_SHELL  = `${VERSION}-shell`;
const CACHE_FOTOS  = `${VERSION}-fotos`;
const CACHE_SDK    = `${VERSION}-sdk`;
const MAX_FOTOS    = 60;

const SDK = [
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage-compat.js'
];

const SHELL = [
  './', './index.html', './styles.css', './manifest.json',
  './firebase-config.js', './presets.js', './presets-extra.js', './catalog.js', './share.js', './voice.js',
  './ui.js', './notifications.js', './app.js',
  './icon.svg', './icon-192.png', './icon-512.png',
  './icon-maskable-192.png', './icon-maskable-512.png', './apple-touch-icon.png'
];

/* ── Ciclo de vida ──────────────────────────────────────────── */

self.addEventListener('install', (ev) => {
  ev.waitUntil((async () => {
    const shell = await caches.open(CACHE_SHELL);
    // Uno por uno: con addAll, un solo 404 tira abajo toda la instalación.
    await Promise.all(SHELL.map((u) => shell.add(u).catch(() => {})));

    const sdk = await caches.open(CACHE_SDK);
    await Promise.all(SDK.map((u) => sdk.add(u).catch(() => {})));

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil((async () => {
    const nombres = await caches.keys();
    await Promise.all(
      nombres.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (ev) => {
  if (ev.data === 'skip-waiting') self.skipWaiting();
});

/* ── Estrategias de caché ───────────────────────────────────── */

async function podarCache(nombre, max) {
  const c = await caches.open(nombre);
  const claves = await c.keys();
  if (claves.length <= max) return;
  await Promise.all(claves.slice(0, claves.length - max).map((k) => c.delete(k)));
}

/** Devuelve lo cacheado al instante y refresca por detrás. */
async function refrescandoAparte(req, nombre) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req, { ignoreSearch: true });

  const red = fetch(req).then((res) => {
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  }).catch(() => null);

  return guardado || (await red) || Response.error();
}

/** Primero el caché; solo va a la red si no lo tiene. */
async function primeroCache(req, nombre, max) {
  const cache = await caches.open(nombre);
  const guardado = await cache.match(req);
  if (guardado) return guardado;

  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) {
      await cache.put(req, res.clone());
      if (max) podarCache(nombre, max);
    }
    return res;
  } catch (e) {
    return Response.error();
  }
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Firestore, Auth y Storage-API: siempre a la red. El SDK ya tiene su
  // propia caché offline (IndexedDB) y meterse en el medio la rompe.
  if (/firestore\.googleapis\.com|identitytoolkit|securetoken|googleapis\.com\/identity/.test(url.href)) return;

  // Navegación: red primero para tomar la versión nueva, con el shell de respaldo.
  if (req.mode === 'navigate') {
    ev.respondWith((async () => {
      try {
        const res = await fetch(req);
        const c = await caches.open(CACHE_SHELL);
        c.put('./index.html', res.clone());
        return res;
      } catch (e) {
        const c = await caches.open(CACHE_SHELL);
        return (await c.match('./index.html')) || (await c.match('./')) || Response.error();
      }
    })());
    return;
  }

  // SDK de Firebase desde gstatic.
  if (url.hostname === 'www.gstatic.com' && url.pathname.includes('/firebasejs/')) {
    ev.respondWith(primeroCache(req, CACHE_SDK));
    return;
  }

  // Fotos de las máquinas.
  if (/firebasestorage\.googleapis\.com|firebasestorage\.app/.test(url.hostname)) {
    ev.respondWith(primeroCache(req, CACHE_FOTOS, MAX_FOTOS));
    return;
  }

  // Archivos propios de la app.
  if (url.origin === self.location.origin) {
    ev.respondWith(refrescandoAparte(req, CACHE_SHELL));
  }
});

/* ── Notificaciones ─────────────────────────────────────────── */

/* FCM se carga sólo para el push en background. Si falla (por ejemplo, sin
   red durante la instalación), el caché offline sigue funcionando igual. */
try {
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
  importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

  firebase.initializeApp({
    apiKey: "AIzaSyDMyw0DjFlnq7qyfizBUhblCNyQKt-OPrU",
    authDomain: "maquinas-master.firebaseapp.com",
    projectId: "maquinas-master",
    storageBucket: "maquinas-master.firebasestorage.app",
    messagingSenderId: "912625811269",
    appId: "1:912625811269:web:83b3cf64c15aebb39d882c"
  });

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const { title, body } = payload.notification || {};
    const maquinaId = payload.data?.maquina_id || '';

    self.registration.showNotification(title || 'Stock de Máquinas', {
      body: body || 'Hubo un cambio en el stock.',
      icon: new URL('icon-192.png', self.registration.scope).href,
      badge: new URL('icon-192.png', self.registration.scope).href,
      // Mismo tag que usa la notificación local de la página: si llegan las
      // dos por el mismo hecho, se colapsan en una sola en vez de duplicarse.
      tag: 'pm-' + (maquinaId || 'stock'),
      renotify: true,
      data: { maquina_id: maquinaId, url: self.registration.scope },
      vibrate: [140, 70, 140]
    });
  });
} catch (e) {
  console.warn('FCM no disponible en este Service Worker:', e);
}

self.addEventListener('notificationclick', (ev) => {
  ev.notification.close();
  const destino = ev.notification.data?.url || self.registration.scope;
  const maquinaId = ev.notification.data?.maquina_id || '';

  ev.waitUntil((async () => {
    const abiertos = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    for (const c of abiertos) {
      if (c.url.startsWith(self.registration.scope)) {
        await c.focus();
        if (maquinaId) c.postMessage({ type: 'abrir-maquina', id: maquinaId });
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(destino);
  })());
});
