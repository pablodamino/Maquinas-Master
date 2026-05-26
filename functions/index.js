// Cloud Function: notifica a todos los vendedores cuando cambia el stock
// Se ejecuta en Firebase (no en GitHub Pages) — requiere plan Blaze

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

exports.notificarCambioMaquina = onDocumentWritten(
  { document: 'machines/{machineId}', region: 'us-central1' },
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    // Determinar el mensaje según la transición
    let titulo = '';
    let cuerpo = '';

    if (!before && after) {
      // Documento nuevo
      titulo = 'Nueva máquina ordenada';
      cuerpo = `${after.modelo} — en espera de llegada`;
    } else if (before && after) {
      const estadoAntes = before.estado;
      const estadoDespues = after.estado;

      if (estadoAntes === estadoDespues) return null; // sin cambio de estado

      if (estadoDespues === 'embarcado') {
        titulo = 'Máquina embarcada';
        cuerpo = `${after.modelo} está en tránsito`;
      } else if (estadoDespues === 'entrega_inmediata') {
        titulo = 'Disponible para venta';
        cuerpo = `${after.modelo} llegó a planta — entrega inmediata`;
      } else if (estadoDespues === 'vendida_instalada') {
        titulo = 'Máquina vendida';
        cuerpo = `${after.modelo} fue vendida a ${after.cliente || 'cliente'} por ${after.vendido_por || '—'}`;
      } else {
        return null;
      }
    } else {
      return null;
    }

    // Obtener todos los tokens FCM de todos los vendedores
    const vendorsSnap = await db.collection('vendors').get();
    const allTokens = [];

    vendorsSnap.forEach(doc => {
      const tokens = doc.data().fcm_tokens || [];
      allTokens.push(...tokens);
    });

    if (allTokens.length === 0) {
      console.log('No hay tokens FCM registrados.');
      return null;
    }

    // FCM admite máximo 500 tokens por llamada — dividir en chunks
    const chunks = [];
    for (let i = 0; i < allTokens.length; i += 500) {
      chunks.push(allTokens.slice(i, i + 500));
    }

    const tokensInvalidos = [];

    for (const chunk of chunks) {
      try {
        const response = await messaging.sendEachForMulticast({
          tokens: chunk,
          notification: { title: titulo, body: cuerpo },
          data: {
            maquina_id: event.params.machineId,
            estado: after?.estado || ''
          },
          android: {
            priority: 'high',
            notification: {
              channelId: 'stock_updates',
              sound: 'default',
              clickAction: 'FLUTTER_NOTIFICATION_CLICK'
            }
          },
          webpush: {
            notification: {
              icon: '/Maquinas-Master/icon-192.png',
              badge: '/Maquinas-Master/icon-192.png',
              requireInteraction: false
            },
            fcmOptions: { link: '/Maquinas-Master/' }
          }
        });

        // Recolectar tokens inválidos para limpiar
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code;
            if (
              code === 'messaging/invalid-registration-token' ||
              code === 'messaging/registration-token-not-registered'
            ) {
              tokensInvalidos.push(chunk[idx]);
            }
          }
        });

        console.log(`Enviadas ${response.successCount}/${chunk.length} notificaciones`);
      } catch (err) {
        console.error('Error enviando notificaciones:', err);
      }
    }

    // Limpiar tokens inválidos de Firestore
    if (tokensInvalidos.length > 0) {
      console.log(`Limpiando ${tokensInvalidos.length} tokens inválidos`);
      const batch = db.batch();
      vendorsSnap.forEach(doc => {
        const tokens = doc.data().fcm_tokens || [];
        const hayInvalidos = tokens.some(t => tokensInvalidos.includes(t));
        if (hayInvalidos) {
          batch.update(doc.ref, {
            fcm_tokens: FieldValue.arrayRemove(...tokensInvalidos)
          });
        }
      });
      await batch.commit();
    }

    // Guardar en colección de notificaciones para historial
    await db.collection('notifications').add({
      titulo,
      cuerpo,
      maquina_id: event.params.machineId,
      estado_nuevo: after?.estado || '',
      fecha: FieldValue.serverTimestamp()
    });

    return null;
  }
);
