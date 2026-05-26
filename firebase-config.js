// Configuración de Firebase
// La API key del cliente es pública por diseño — la seguridad la imponen las Firestore Rules y Firebase Auth.
// INSTRUCCIONES: Reemplazá los valores REEMPLAZAR_CON_* con los de tu proyecto Firebase.
// Los encontrás en: Firebase Console → Project Settings → General → Tu app web

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDMyw0DjFlnq7qyfizBUhblCNyQKt-OPrU",
  authDomain: "maquinas-master.firebaseapp.com",
  projectId: "maquinas-master",
  storageBucket: "maquinas-master.firebasestorage.app",
  messagingSenderId: "912625811269",
  appId: "1:912625811269:web:83b3cf64c15aebb39d882c"
};

// VAPID Key para Web Push (Firebase Console → Project Settings → Cloud Messaging → Web Push certificates)
const VAPID_KEY = "BDoZNwLGIh1JKkVLdDB_ju56cQGh6l08ieZW9MPMT6KEJpjuubSckR5s9KaLxlfWpwPfjA7cSwjeoLlidaCmDPM";

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
