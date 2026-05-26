// Configuración de Firebase
// La API key del cliente es pública por diseño — la seguridad la imponen las Firestore Rules y Firebase Auth.
// INSTRUCCIONES: Reemplazá los valores REEMPLAZAR_CON_* con los de tu proyecto Firebase.
// Los encontrás en: Firebase Console → Project Settings → General → Tu app web

const FIREBASE_CONFIG = {
  apiKey: "REEMPLAZAR_CON_TU_API_KEY",
  authDomain: "REEMPLAZAR_CON_TU_AUTH_DOMAIN",
  projectId: "REEMPLAZAR_CON_TU_PROJECT_ID",
  storageBucket: "REEMPLAZAR_CON_TU_STORAGE_BUCKET",
  messagingSenderId: "REEMPLAZAR_CON_TU_MESSAGING_SENDER_ID",
  appId: "REEMPLAZAR_CON_TU_APP_ID"
};

// VAPID Key para Web Push — la encontrás en:
// Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Key pair
const VAPID_KEY = "REEMPLAZAR_CON_TU_VAPID_KEY";

// Inicializar Firebase
firebase.initializeApp(FIREBASE_CONFIG);

const db = firebase.firestore();
const auth = firebase.auth();
const messaging = firebase.messaging();

// Registrar Service Worker y obtener token FCM para push notifications
async function inicializarPush() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    console.warn('Este browser no soporta notificaciones push.');
    return null;
  }
  if (Notification.permission === 'denied') return null;

  try {
    const swReg = await navigator.serviceWorker.register('/Maquinas-Master/firebase-messaging-sw.js', {
      scope: '/Maquinas-Master/'
    });
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;

    const token = await firebase.messaging().getToken({
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });
    return token;
  } catch (err) {
    console.error('Error iniciando push:', err);
    return null;
  }
}

// Guardar token FCM del dispositivo en el perfil del vendedor
async function guardarTokenFCM(uid, token) {
  if (!token) return;
  await db.collection('vendors').doc(uid).update({
    fcm_tokens: firebase.firestore.FieldValue.arrayUnion(token)
  });
}
