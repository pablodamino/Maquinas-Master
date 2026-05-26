// Configuración de Firebase — Pantógrafos Master Stock App
// La API key del cliente es pública por diseño. Seguridad = Firestore Rules + Firebase Auth.

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDMyw0DjFlnq7qyfizBUhblCNyQKt-OPrU",
  authDomain: "maquinas-master.firebaseapp.com",
  projectId: "maquinas-master",
  storageBucket: "maquinas-master.firebasestorage.app",
  messagingSenderId: "912625811269",
  appId: "1:912625811269:web:83b3cf64c15aebb39d882c"
};

const VAPID_KEY = "BDoZNwLGIh1JKkVLdDB_ju56cQGh6l08ieZW9MPMT6KEJpjuubSckR5s9KaLxlfWpwPfjA7cSwjeoLlidaCmDPM";

firebase.initializeApp(FIREBASE_CONFIG);

const db        = firebase.firestore();
const auth      = firebase.auth();
const messaging = firebase.messaging();
const storage   = firebase.storage();

// Registrar Service Worker y obtener token FCM
async function inicializarPush() {
  if (!('serviceWorker' in navigator) || !('Notification' in window)) return null;
  if (Notification.permission === 'denied') return null;
  try {
    const swReg = await navigator.serviceWorker.register(
      '/Maquinas-Master/firebase-messaging-sw.js',
      { scope: '/Maquinas-Master/' }
    );
    await navigator.serviceWorker.ready;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return null;
    return await firebase.messaging().getToken({ vapidKey: VAPID_KEY, serviceWorkerRegistration: swReg });
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

// Subir imagen a Firebase Storage y devolver la URL de descarga
async function subirImagen(file, machineId, onProgress) {
  const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
  const ref = storage.ref(`machines/${machineId}/cover.${ext}`);
  const task = ref.put(file);

  return new Promise((resolve, reject) => {
    task.on('state_changed',
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        if (onProgress) onProgress(pct);
      },
      reject,
      async () => {
        const url = await task.snapshot.ref.getDownloadURL();
        resolve(url);
      }
    );
  });
}
