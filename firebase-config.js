/* ═══════════════════════════════════════════════════════════════
   Firebase — inicialización, Service Worker, push e imágenes
   La API key del cliente es pública por diseño.
   La seguridad real vive en firestore.rules + Firebase Auth.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDMyw0DjFlnq7qyfizBUhblCNyQKt-OPrU",
  authDomain: "maquinas-master.firebaseapp.com",
  projectId: "maquinas-master",
  storageBucket: "maquinas-master.firebasestorage.app",
  messagingSenderId: "912625811269",
  appId: "1:912625811269:web:83b3cf64c15aebb39d882c"
};

const VAPID_KEY = "BDoZNwLGIh1JKkVLdDB_ju56cQGh6l08ieZW9MPMT6KEJpjuubSckR5s9KaLxlfWpwPfjA7cSwjeoLlidaCmDPM";

/* Estado de sesión compartido por todos los scripts.
   Se declara acá, en el primero que carga, y con `var` a propósito: así no
   hay zona muerta temporal si otro archivo lo lee antes de que corra app.js. */
var currentUser   = null;
var currentVendor = null;
var isAdmin       = false;

firebase.initializeApp(FIREBASE_CONFIG);

/* Estos tres SIEMPRE se inicializan y nunca lanzan excepción.
   Antes `firebase.messaging()` se llamaba acá arriba sin protección: en cualquier
   navegador sin soporte FCM (Safari iOS sin instalar, navegador interno de
   WhatsApp) reventaba el archivo entero y se llevaba puesto `storage`. */
const db      = firebase.firestore();
const auth    = firebase.auth();
const storage = firebase.storage();

/* Caché offline. Debe pedirse antes de cualquier otra operación de Firestore. */
db.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  if (err.code === 'failed-precondition')      console.info('Persistencia offline: otra pestaña la tiene tomada.');
  else if (err.code === 'unimplemented')       console.info('Persistencia offline: no soportada por este navegador.');
  else                                         console.warn('Persistencia offline:', err);
});

/* ── Service Worker ─────────────────────────────────────────── */

let _swReg = null;
let _swPromise = null;

/**
 * Registra el Service Worker con ruta RELATIVA al documento.
 * Antes estaba fijo en '/Maquinas-Master/', lo que impedía probar en local
 * y rompía si el sitio cambiaba de subcarpeta.
 */
function registrarSW() {
  if (_swPromise) return _swPromise;
  if (!('serviceWorker' in navigator)) return Promise.resolve(null);

  _swPromise = navigator.serviceWorker
    .register(new URL('firebase-messaging-sw.js', document.baseURI).href, {
      scope: new URL('./', document.baseURI).pathname
    })
    .then((reg) => { _swReg = reg; return reg; })
    .catch((err) => { console.warn('No se pudo registrar el Service Worker:', err); return null; });

  return _swPromise;
}

function swListo() {
  return _swReg ? Promise.resolve(_swReg) : registrarSW();
}

/* ── Soporte de notificaciones ──────────────────────────────── */

const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const estaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

/** ¿El navegador puede mostrar notificaciones del sistema? (no requiere FCM) */
function soportaNotificaciones() {
  return typeof Notification !== 'undefined' && 'serviceWorker' in navigator;
}

/** ¿El navegador soporta FCM? Devuelve promesa; tolera API sync y async. */
async function soportaFCM() {
  try {
    if (!firebase.messaging || typeof firebase.messaging.isSupported !== 'function') return false;
    const r = firebase.messaging.isSupported();
    return (r && typeof r.then === 'function') ? await r : !!r;
  } catch (e) {
    return false;
  }
}

let _messaging = null;
/** Devuelve la instancia de messaging, o null. Nunca lanza. */
async function obtenerMessaging() {
  if (_messaging) return _messaging;
  if (!(await soportaFCM())) return null;
  try {
    _messaging = firebase.messaging();
    return _messaging;
  } catch (e) {
    console.warn('FCM no disponible:', e);
    return null;
  }
}

/**
 * Estado honesto del permiso, para mostrarlo tal cual en la interfaz.
 * → 'granted' | 'default' | 'denied' | 'unsupported' | 'ios-necesita-instalar'
 */
function estadoPermiso() {
  if (esIOS && !estaInstalada()) return 'ios-necesita-instalar';
  if (!soportaNotificaciones())  return 'unsupported';
  return Notification.permission;
}

/**
 * Pide el permiso de notificaciones. DEBE llamarse desde un gesto del usuario
 * (click/tap): iOS lo exige y Chrome degrada el pedido a la UI silenciosa si no.
 * Antes se llamaba solo desde onAuthStateChanged, por eso nunca se concedía.
 */
async function pedirPermiso() {
  const estado = estadoPermiso();
  if (estado !== 'default') return estado;
  try {
    const res = await Notification.requestPermission();
    return res;
  } catch (e) {
    console.warn('Error pidiendo permiso:', e);
    return 'denied';
  }
}

/* ── Token FCM ──────────────────────────────────────────────── */

/**
 * Obtiene el token FCM del dispositivo. Devuelve null si no se puede,
 * sin lanzar excepción nunca.
 */
async function obtenerTokenFCM() {
  if (Notification.permission !== 'granted') return null;
  const m = await obtenerMessaging();
  if (!m) return null;
  try {
    const reg = await swListo();
    if (!reg) return null;
    await navigator.serviceWorker.ready;
    return await m.getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  } catch (err) {
    console.warn('No se pudo obtener el token FCM:', err);
    return null;
  }
}

/**
 * Guarda el token en el perfil del vendedor.
 * Usa set({merge:true}) en lugar de update(): update() falla si el documento
 * no existe, y ese era el motivo real de que ningún token se llegara a guardar.
 */
async function guardarTokenFCM(uid, token) {
  if (!uid || !token) return false;
  try {
    await db.collection('vendors').doc(uid).set({
      fcm_tokens: firebase.firestore.FieldValue.arrayUnion(token),
      token_actualizado: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    localStorage.setItem('pm-fcm-token', token);
    return true;
  } catch (err) {
    console.warn('No se pudo guardar el token FCM:', err);
    return false;
  }
}

/** Limpia el token de este dispositivo al cerrar sesión. */
async function borrarTokenFCM(uid) {
  const token = localStorage.getItem('pm-fcm-token');
  if (!uid || !token) return;
  try {
    await db.collection('vendors').doc(uid).set({
      fcm_tokens: firebase.firestore.FieldValue.arrayRemove(token)
    }, { merge: true });
  } catch (e) { /* no es crítico */ }
  localStorage.removeItem('pm-fcm-token');
}

/* ── Imágenes: compresión y subida ──────────────────────────── */

/**
 * Comprime una foto en el propio celular antes de subirla.
 * Una foto de cámara de 4 MB queda típicamente en 200–400 KB.
 */
async function comprimirImagen(file, maxLado = 1600, calidad = 0.82) {
  if (!file || !file.type.startsWith('image/')) return { blob: file, original: file.size, final: file.size };

  let bitmap;
  try {
    // imageOrientation resuelve solo la rotación EXIF de las fotos de celular.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch (e) {
    try { bitmap = await createImageBitmap(file); }
    catch (e2) { return { blob: file, original: file.size, final: file.size }; }
  }

  const { width: w0, height: h0 } = bitmap;
  const escala = Math.min(1, maxLado / Math.max(w0, h0));
  const w = Math.round(w0 * escala);
  const h = Math.round(h0 * escala);

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  if (bitmap.close) bitmap.close();

  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', calidad));
  if (!blob) return { blob: file, original: file.size, final: file.size };

  // Si comprimir no ayudó (imagen ya optimizada y chica), conservar la original.
  if (blob.size >= file.size && escala === 1) {
    return { blob: file, original: file.size, final: file.size };
  }
  return { blob, original: file.size, final: blob.size, ancho: w, alto: h };
}

/** Sube la foto de una máquina y devuelve la URL de descarga. */
function subirImagen(blob, machineId, onProgress) {
  const ref = storage.ref(`machines/${machineId}/cover.jpg`);
  const task = ref.put(blob, { contentType: 'image/jpeg', cacheControl: 'public,max-age=31536000' });

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => {
        if (onProgress && snap.totalBytes) {
          onProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100));
        }
      },
      reject,
      async () => {
        try { resolve(await task.snapshot.ref.getDownloadURL()); }
        catch (err) { reject(err); }
      }
    );
  });
}

/** Borra la foto de una máquina. Silencioso si ya no existe. */
async function borrarImagen(machineId) {
  const rutas = [`machines/${machineId}/cover.jpg`, `machines/${machineId}/main`];
  for (const r of rutas) {
    try { await storage.ref(r).delete(); } catch (e) { /* ya no estaba */ }
  }
}

/* Registrar el SW cuanto antes: el caché offline no depende del permiso
   de notificaciones, así que no hay razón para esperar. */
if (document.readyState === 'complete') registrarSW();
else window.addEventListener('load', registrarSW, { once: true });
