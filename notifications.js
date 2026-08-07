/* ═══════════════════════════════════════════════════════════════
   notifications.js — tres capas que degradan con elegancia

   Capa 1 · Bandeja de novedades en tiempo real (Firestore).
            Funciona siempre, sin permisos y sin backend.
   Capa 2 · Notificación del sistema disparada por el Service Worker
            cuando la app está abierta pero no en foco.
            No necesita FCM, ni Cloud Functions, ni plan Blaze.
   Capa 3 · Push con la app cerrada, vía FCM + Cloud Function.
            Opcional: si no está desplegada, la app no lo promete.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

let ACTIVIDAD      = [];
let _actUnsub      = null;
let _primeraCarga  = true;
let _ultimaLectura = 0;          // milisegundos
let _noLeidas      = 0;

const ACT_ICONO = {
  alta:            '📦',
  embarcado:       '🚢',
  llegada:         '🏭',
  venta:           '🤝',
  venta_cancelada: '↩️',
  instalada:       '✅',
  baja:            '🗑️',
  editada:         '✏️'
};

/* Agrupación visual del panel: varios tipos comparten color. */
const ACT_GRUPO = {
  alta: 'alta', editada: 'alta',
  embarcado: 'embarcado',
  llegada: 'llegada',
  venta: 'venta', venta_cancelada: 'venta',
  instalada: 'instalada',
  baja: 'baja'
};

/* ── Escritura de actividad ─────────────────────────────────── */

/**
 * Registra un hecho en el feed. Es lo que alimenta la bandeja y las
 * notificaciones locales, sin depender de ninguna Cloud Function.
 * Nunca hace fallar la operación principal: si no puede escribir, avisa por consola.
 */
async function registrarActividad(tipo, { maquinaId, modelo, estado, titulo, cuerpo }) {
  try {
    await db.collection('activity').add({
      tipo,
      titulo: titulo || '',
      cuerpo: cuerpo || '',
      maquina_id: maquinaId || '',
      modelo: modelo || '',
      estado: estado || '',
      actor_uid: currentUser?.uid || '',
      actor_nombre: currentVendor?.nombre || currentUser?.email || '—',
      fecha: firebase.firestore.FieldValue.serverTimestamp()
    });
  } catch (e) {
    console.warn('No se pudo registrar la actividad:', e.code || e);
  }
}

/* ── Capa 1: bandeja en tiempo real ─────────────────────────── */

function escucharActividad() {
  dejarActividad();
  _primeraCarga = true;

  _actUnsub = db.collection('activity')
    .orderBy('fecha', 'desc')
    .limit(80)
    .onSnapshot(
      (snap) => {
        ACTIVIDAD = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (!_primeraCarga) {
          snap.docChanges().forEach((ch) => {
            if (ch.type !== 'added') return;
            const a = { id: ch.doc.id, ...ch.doc.data() };
            if (!a.fecha) return;                       // escritura local aún sin sellar
            if (a.actor_uid === currentUser?.uid) return; // no avisar de lo propio
            notificarLocal(a);
          });
        }
        _primeraCarga = false;

        recalcularNoLeidas();
        if (!$('notif-panel').classList.contains('hidden')) pintarPanel();
      },
      (err) => {
        console.warn('Feed de novedades no disponible:', err.code || err);
        ACTIVIDAD = [];
        _primeraCarga = false;
        if (!$('notif-panel').classList.contains('hidden')) pintarPanel();
      }
    );
}

function dejarActividad() {
  if (_actUnsub) { _actUnsub(); _actUnsub = null; }
  ACTIVIDAD = [];
  _noLeidas = 0;
  _primeraCarga = true;
}

function recalcularNoLeidas() {
  _noLeidas = ACTIVIDAD.filter((a) => {
    if (a.actor_uid === currentUser?.uid) return false;
    const ms = a.fecha?.toMillis?.() || 0;
    return ms > _ultimaLectura;
  }).length;

  const badge = $('notif-badge');
  if (!badge) return;
  if (_noLeidas > 0) {
    badge.textContent = _noLeidas > 99 ? '99+' : _noLeidas;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}

function fijarUltimaLectura(ms) {
  _ultimaLectura = ms || Date.now();
  localStorage.setItem('pm-ultima-lectura', String(_ultimaLectura));
  recalcularNoLeidas();

  // Se guarda también en el perfil, para que valga en todos los dispositivos.
  if (currentUser) {
    db.collection('vendors').doc(currentUser.uid).set({
      ultima_lectura: firebase.firestore.Timestamp.fromMillis(_ultimaLectura)
    }, { merge: true }).catch(() => {});
  }
}

function cargarUltimaLectura(vendor) {
  const local  = parseInt(localStorage.getItem('pm-ultima-lectura') || '0', 10);
  const remoto = vendor?.ultima_lectura?.toMillis?.() || 0;
  _ultimaLectura = Math.max(local, remoto);
}

/* ── Capa 2: notificación del sistema, sin FCM ──────────────── */

/**
 * Muestra una notificación del sistema desde el propio Service Worker.
 * Solo cuando la app no está en foco: si el vendedor la está mirando,
 * ya ve el cambio en pantalla y un aviso sería ruido.
 */
async function notificarLocal(a) {
  if (!document.hidden && document.hasFocus()) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  try {
    const reg = await swListo();
    if (!reg) return;
    await reg.showNotification(a.titulo || 'Stock actualizado', {
      body: a.cuerpo || '',
      icon: new URL('icon-192.png', document.baseURI).href,
      badge: new URL('icon-192.png', document.baseURI).href,
      // El mismo tag que usa el push de FCM: si llegan los dos, se colapsan
      // en una sola notificación en vez de duplicarse.
      tag: 'pm-' + (a.maquina_id || a.id),
      renotify: true,
      data: { maquina_id: a.maquina_id || '', url: document.baseURI },
      vibrate: [140, 70, 140]
    });
  } catch (e) {
    console.warn('No se pudo mostrar la notificación local:', e);
  }
}

/* ── Capa 3: FCM (solo si hay backend) ──────────────────────── */

/**
 * Se llama SIEMPRE desde un gesto del usuario. Ese era el bug original:
 * pedir el permiso desde onAuthStateChanged hacía que iOS lo rechazara
 * siempre y que Chrome lo mandara a la interfaz silenciosa.
 */
async function activarNotificaciones() {
  const antes = estadoPermiso();

  if (antes === 'ios-necesita-instalar') {
    toast('Instalá la app primero',
          'En iPhone las notificaciones solo funcionan con la app agregada a la pantalla de inicio.',
          'info', 6500);
    pintarPermiso();
    return false;
  }
  if (antes === 'unsupported') {
    toast('Este navegador no soporta notificaciones',
          'Probá con Chrome en Android.', 'error', 6000);
    pintarPermiso();
    return false;
  }
  if (antes === 'denied') {
    toast('Notificaciones bloqueadas',
          'Hay que desbloquearlas desde los ajustes del navegador.', 'error', 6000);
    pintarPermiso();
    return false;
  }

  const res = await pedirPermiso();
  pintarPermiso();

  if (res !== 'granted') {
    toast('Sin notificaciones', 'Podés activarlas cuando quieras desde la campana.', 'info');
    return false;
  }

  haptic([12, 60, 12]);
  toast('Notificaciones activadas', 'Vas a recibir los cambios del stock.', 'success');

  // Token FCM para el push con la app cerrada. Si no hay soporte o no hay
  // backend, la capa 2 igual funciona: no se rompe nada.
  sincronizarTokenFCM();
  return true;
}

/** Obtiene y guarda el token FCM. Silencioso: es una mejora, no un requisito. */
async function sincronizarTokenFCM() {
  if (!currentUser) return;
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;

  const token = await obtenerTokenFCM();
  if (!token) return;

  const previo = localStorage.getItem('pm-fcm-token');
  if (previo === token) return;         // ya está guardado, nada que hacer
  await guardarTokenFCM(currentUser.uid, token);
}

/** Mensajes FCM con la app en primer plano. */
async function escucharFCMPrimerPlano() {
  const m = await obtenerMessaging();
  if (!m) return;
  try {
    m.onMessage((payload) => {
      const t = payload.notification?.title || 'Stock actualizado';
      const b = payload.notification?.body || '';
      // La bandeja ya se actualiza sola por Firestore; acá solo avisamos.
      toast(t, b, 'info');
    });
  } catch (e) {
    console.warn('onMessage no disponible:', e);
  }
}

/* ── Panel ──────────────────────────────────────────────────── */

function abrirPanelNotif() {
  const p = $('notif-panel');
  p.classList.remove('hidden', 'is-closing');
  document.body.classList.add('is-locked');
  pintarPermiso();
  pintarPanel();
  sincronizarTokenFCM();          // aprovecha para refrescar el token si venció
}

function cerrarPanelNotif() {
  const p = $('notif-panel');
  if (p.classList.contains('hidden')) return;
  p.classList.add('is-closing');
  setTimeout(() => {
    p.classList.add('hidden');
    p.classList.remove('is-closing');
    document.body.classList.remove('is-locked');
  }, 260);
  fijarUltimaLectura(Date.now());
}

function pintarPermiso() {
  const box = $('perm-box');
  if (!box) return;
  const estado = estadoPermiso();

  const bloques = {
    granted: () => `
      <div class="perm" data-s="granted">
        <div class="perm-top"><span class="perm-ico">🔔</span>
          <span class="perm-title">Notificaciones activadas</span></div>
        <p class="perm-txt">Vas a recibir un aviso cada vez que cambie el stock, incluso con la app en segundo plano.</p>
      </div>`,

    default: () => `
      <div class="perm" data-s="default">
        <div class="perm-top"><span class="perm-ico">🔕</span>
          <span class="perm-title">Activá los avisos</span></div>
        <p class="perm-txt">Enterate al instante cuando llega una máquina, se embarca o alguien registra una venta.</p>
        <button class="btn btn-primary btn-sm btn-full" id="perm-go">Activar notificaciones</button>
      </div>`,

    denied: () => `
      <div class="perm" data-s="denied">
        <div class="perm-top"><span class="perm-ico">🚫</span>
          <span class="perm-title">Notificaciones bloqueadas</span></div>
        <p class="perm-txt">Las bloqueaste en este navegador. Para volver a activarlas:</p>
        <ol class="perm-steps">
          <li>Tocá el candado 🔒 al lado de la dirección.</li>
          <li>Entrá en <b>Permisos</b> o <b>Configuración del sitio</b>.</li>
          <li>Poné <b>Notificaciones</b> en <b>Permitir</b>.</li>
          <li>Recargá la app.</li>
        </ol>
      </div>`,

    'ios-necesita-instalar': () => `
      <div class="perm" data-s="denied">
        <div class="perm-top"><span class="perm-ico">📲</span>
          <span class="perm-title">Instalá la app para recibir avisos</span></div>
        <p class="perm-txt">En iPhone, las notificaciones web solo funcionan con la app agregada a la pantalla de inicio (iOS 16.4 o superior).</p>
        <ol class="perm-steps">
          <li>Tocá <b>Compartir</b> abajo en Safari.</li>
          <li>Elegí <b>Agregar a pantalla de inicio</b>.</li>
          <li>Abrí la app desde el ícono nuevo.</li>
          <li>Volvé acá y activá las notificaciones.</li>
        </ol>
      </div>`,

    unsupported: () => `
      <div class="perm" data-s="unsupported">
        <div class="perm-top"><span class="perm-ico">ℹ️</span>
          <span class="perm-title">Sin notificaciones en este navegador</span></div>
        <p class="perm-txt">Las novedades de abajo se actualizan igual en tiempo real. Para recibir avisos en el celular, abrí la app con <b>Chrome</b> en Android.</p>
      </div>`
  };

  box.innerHTML = (bloques[estado] || bloques.unsupported)();
  $('perm-go')?.addEventListener('click', activarNotificaciones);
}

function etiquetaDia(ms) {
  const d = new Date(ms);
  const hoy = new Date();
  const ayer = new Date(Date.now() - 86400000);
  const mismo = (a, b) => a.toDateString() === b.toDateString();
  if (mismo(d, hoy))  return 'Hoy';
  if (mismo(d, ayer)) return 'Ayer';
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function pintarPanel() {
  const lista = $('np-list');
  if (!lista) return;

  const items = ACTIVIDAD.filter((a) => a.fecha);
  if (!items.length) {
    lista.innerHTML = `
      <div class="empty" style="margin:1rem;border-radius:var(--r-md)">
        <span class="e-glyph">📭</span>
        <span class="e-title">Todo tranquilo</span>
        <span class="e-sub">Acá van a aparecer las altas, los embarques, las llegadas y las ventas en cuanto pasen.</span>
      </div>`;
    return;
  }

  let html = '';
  let diaActual = '';

  for (const a of items) {
    const ms = a.fecha.toMillis();
    const dia = etiquetaDia(ms);
    if (dia !== diaActual) { diaActual = dia; html += `<div class="np-day">${esc(dia)}</div>`; }

    const noLeida = ms > _ultimaLectura && a.actor_uid !== currentUser?.uid;
    const grupo = ACT_GRUPO[a.tipo] || 'alta';

    html += `<button class="np-item${noLeida ? ' is-unread' : ''}" data-t="${esc(grupo)}" data-maq="${esc(a.maquina_id || '')}">
      <span class="np-ico">${ACT_ICONO[a.tipo] || '•'}</span>
      <span class="np-txt">
        <strong>${esc(a.titulo || 'Stock actualizado')}</strong>
        ${a.cuerpo ? `<p>${esc(a.cuerpo)}</p>` : ''}
        <span class="np-when">${esc(haceCuanto(a.fecha))} · ${esc(a.actor_nombre || '—')}</span>
      </span>
    </button>`;
  }

  lista.innerHTML = html;

  lista.querySelectorAll('.np-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.maq;
      cerrarPanelNotif();
      if (!id) return;
      setTimeout(() => {
        if (!resaltarMaquina(id)) {
          toast('Máquina no visible', 'Puede estar filtrada o ya vendida.', 'info');
        }
      }, 300);
    });
  });
}

/* ── Al tocar una notificación del sistema ──────────────────── */

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data?.type === 'abrir-maquina' && ev.data.id) {
      setTimeout(() => resaltarMaquina(ev.data.id), 400);
    }
  });
}

/* Refrescar el token cuando la app vuelve al frente: los tokens FCM vencen
   y antes no se renovaban nunca. */
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && currentUser) sincronizarTokenFCM();
});
