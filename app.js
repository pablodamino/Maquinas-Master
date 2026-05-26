// ══════════════════════════════════════════════════════════════
//  MAQUINAS MASTER — App principal
//  Secciones: A) Auth  B) Firestore listeners  C) Render
//             D) Admin actions  E) Sell modal  F) FCM tokens
// ══════════════════════════════════════════════════════════════

'use strict';

// ── Estado global ─────────────────────────────────────────────
let currentUser = null;
let currentVendor = null;
let isAdmin = false;
let activeSellMachineId = null;
let activeStateMachineId = null;
let unsubscribers = [];
let notifCount = 0;
let counterInterval = null;
let allCaminoMachines = [];
let allInmediataMachines = [];

// ── Helpers DOM ───────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const hide = (id) => $( id )?.classList.add('hidden');
const show = (id) => $( id )?.classList.remove('hidden');

function showToast(title, body = '', type = '') {
  const container = $('toast-container');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-title">${title}</div>${body ? `<div class="toast-body">${body}</div>` : ''}`;
  container.appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

function setLoading(btnId, loading) {
  const btn = $(btnId);
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.origText || btn.innerHTML;
  }
}

function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function clearError(id) { $(id)?.classList.add('hidden'); }

// Formatear fecha para mostrar
function formatFecha(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Calcular días desde una fecha Firestore
function diasDesde(timestamp) {
  if (!timestamp) return 0;
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// ── A) AUTENTICACIÓN ──────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await cargarPerfilVendedor(user.uid);
    mostrarApp();
    iniciarListeners();
    await registrarPushNotifications();
  } else {
    currentUser = null;
    currentVendor = null;
    isAdmin = false;
    detenerListeners();
    mostrarLogin();
  }
});

async function cargarPerfilVendedor(uid) {
  try {
    const snap = await db.collection('vendors').doc(uid).get();
    if (snap.exists) {
      currentVendor = { id: uid, ...snap.data() };
      isAdmin = currentVendor.rol === 'admin';
    } else {
      // Perfil no existe — crear uno básico
      currentVendor = {
        id: uid,
        nombre: currentUser.email.split('@')[0],
        email: currentUser.email,
        rol: 'vendedor',
        fcm_tokens: []
      };
      await db.collection('vendors').doc(uid).set(currentVendor);
      isAdmin = false;
    }
  } catch (e) {
    console.error('Error cargando perfil:', e);
  }
}

function mostrarLogin() {
  show('login-screen');
  hide('app');
  if (counterInterval) { clearInterval(counterInterval); counterInterval = null; }
}

function mostrarApp() {
  hide('login-screen');
  show('app');
  $('header-user-name').textContent = currentVendor?.nombre || currentUser?.email || '';
  // El FAB solo es visible para admin
  if (isAdmin) show('fab-add'); else hide('fab-add');
  // Iniciar contador de días (actualiza cada minuto)
  counterInterval = setInterval(actualizarContadores, 60000);
}

// Login form
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('login-error');
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  setLoading('login-btn', true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    const msgs = {
      'auth/user-not-found': 'Email no encontrado.',
      'auth/wrong-password': 'Contraseña incorrecta.',
      'auth/invalid-email': 'Email inválido.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.'
    };
    showError('login-error', msgs[err.code] || 'Error al ingresar. Revisá tus datos.');
    setLoading('login-btn', false);
  }
});

// Logout
$('logout-btn').addEventListener('click', () => auth.signOut());

// ── B) LISTENERS FIRESTORE EN TIEMPO REAL ─────────────────────
function iniciarListeners() {
  detenerListeners();

  // Máquinas en camino: pedido + embarcado
  const unsubCamino = db.collection('machines')
    .where('estado', 'in', ['pedido', 'embarcado'])
    .orderBy('fecha_oc', 'asc')
    .onSnapshot((snap) => {
      allCaminoMachines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderCamino();
    }, (err) => console.error('Error listener camino:', err));

  // Máquinas en entrega inmediata
  const unsubInm = db.collection('machines')
    .where('estado', '==', 'entrega_inmediata')
    .orderBy('fecha_llegada', 'asc')
    .onSnapshot((snap) => {
      allInmediataMachines = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderInmediata();
    }, (err) => console.error('Error listener inmediata:', err));

  // Máquinas vendidas
  const unsubVend = db.collection('machines')
    .where('estado', '==', 'vendida_instalada')
    .orderBy('fecha_venta', 'desc')
    .onSnapshot((snap) => {
      renderVendidas(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, (err) => console.error('Error listener vendidas:', err));

  unsubscribers = [unsubCamino, unsubInm, unsubVend];

  // Escuchar mensajes FCM en foreground
  messaging.onMessage((payload) => {
    const title = payload.notification?.title || 'Stock actualizado';
    const body = payload.notification?.body || '';
    showToast(title, body, 'success');
    notifCount++;
    const badge = $('notif-badge');
    badge.textContent = notifCount;
    show('notif-badge');
  });
}

function detenerListeners() {
  unsubscribers.forEach(u => u && u());
  unsubscribers = [];
}

// ── C) RENDER ─────────────────────────────────────────────────
function badgeHtml(estado) {
  const map = {
    pedido:             `<span class="badge badge-pedido">🟠 Pedido</span>`,
    embarcado:          `<span class="badge badge-embarcado">🔵 Embarcado</span>`,
    entrega_inmediata:  `<span class="badge badge-inmediata">🟢 Disponible</span>`,
    vendida_instalada:  `<span class="badge badge-vendida">✓ Vendida</span>`
  };
  return map[estado] || `<span class="badge">${estado}</span>`;
}

function cardCaminoHtml(m) {
  const dias = diasDesde(m.fecha_oc);
  const adminBtns = isAdmin ? `
    <button class="btn btn-warning btn-sm" onclick="abrirModalEstado('${m.id}')">
      Cambiar estado
    </button>` : '';

  return `
    <div class="machine-card" id="card-${m.id}">
      <div class="card-top">
        <div class="card-modelo">${escapeHtml(m.modelo)}</div>
        ${badgeHtml(m.estado)}
      </div>
      <div class="card-counter">
        <span class="counter-num" data-desde="${m.fecha_oc?.toMillis?.() || ''}">${dias}</span>
        <span class="counter-label">días pedida</span>
      </div>
      <div class="card-fecha">
        OC confirmada: <strong>${formatFecha(m.fecha_oc)}</strong>
      </div>
      ${m.fecha_embarque ? `<div class="card-fecha">Embarcada: <strong>${formatFecha(m.fecha_embarque)}</strong></div>` : ''}
      ${m.notas ? `<div class="card-fecha text-muted">${escapeHtml(m.notas)}</div>` : ''}
      <div class="card-actions">
        ${adminBtns}
        <button class="btn btn-success btn-sm" onclick="abrirModalVenta('${m.id}')">
          Registrar venta
        </button>
      </div>
    </div>`;
}

function cardInmediataHtml(m) {
  const adminBtns = isAdmin ? `
    <button class="btn btn-ghost btn-sm" onclick="abrirModalEstado('${m.id}')">
      Estado
    </button>` : '';

  return `
    <div class="machine-card inmediata" id="card-${m.id}">
      <div class="card-top">
        <div class="card-modelo">${escapeHtml(m.modelo)}</div>
        ${badgeHtml(m.estado)}
      </div>
      ${m.fecha_llegada ? `<div class="card-fecha">Llegó: <strong>${formatFecha(m.fecha_llegada)}</strong></div>` : ''}
      ${m.notas ? `<div class="card-fecha text-muted">${escapeHtml(m.notas)}</div>` : ''}
      <div class="card-actions">
        ${adminBtns}
        <button class="btn btn-success" onclick="abrirModalVenta('${m.id}')">
          Registrar venta
        </button>
      </div>
    </div>`;
}

function renderCamino() {
  const grid = $('grid-camino');
  $('count-camino').textContent = allCaminoMachines.length;
  if (allCaminoMachines.length === 0) {
    grid.innerHTML = '<div class="empty-state">No hay maquinas en camino</div>';
    return;
  }
  grid.innerHTML = allCaminoMachines.map(cardCaminoHtml).join('');
}

function renderInmediata() {
  const grid = $('grid-inmediata');
  $('count-inmediata').textContent = allInmediataMachines.length;
  if (allInmediataMachines.length === 0) {
    grid.innerHTML = '<div class="empty-state">Sin equipos disponibles para entrega inmediata</div>';
    return;
  }
  grid.innerHTML = allInmediataMachines.map(cardInmediataHtml).join('');
}

function renderVendidas(maquinas) {
  const tbody = $('tabla-vendidas-body');
  $('count-vendidas').textContent = maquinas.length;
  if (maquinas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted" style="padding:2rem">Sin maquinas vendidas aún</td></tr>';
    return;
  }
  tbody.innerHTML = maquinas.map(m => `
    <tr>
      <td><strong>${escapeHtml(m.modelo)}</strong></td>
      <td>${escapeHtml(m.cliente || '—')}</td>
      <td>${escapeHtml(m.vendido_por || '—')}</td>
      <td style="white-space:nowrap">${formatFecha(m.fecha_venta)}</td>
      <td class="notas-cell">${escapeHtml(m.caracteristicas || '')}${m.notas ? '<br><em>' + escapeHtml(m.notas) + '</em>' : ''}</td>
    </tr>`).join('');
}

// Actualiza solo los contadores de días sin re-renderizar todo
function actualizarContadores() {
  document.querySelectorAll('[data-desde]').forEach(el => {
    const ms = parseInt(el.dataset.desde, 10);
    if (ms) el.textContent = Math.floor((Date.now() - ms) / 86400000);
  });
}

// ── D) ACCIONES ADMIN ─────────────────────────────────────────

// Agregar nueva máquina
$('fab-add').addEventListener('click', () => {
  clearError('add-error');
  $('form-add-machine').reset();
  // Setear fecha de hoy como default
  const today = new Date().toISOString().split('T')[0];
  $('add-fecha-oc').value = today;
  show('modal-add');
});

$('form-add-machine').addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError('add-error');
  const modelo = $('add-modelo').value.trim();
  const fechaStr = $('add-fecha-oc').value;
  const notas = $('add-notas').value.trim();
  if (!modelo || !fechaStr) return;

  setLoading('add-submit-btn', true);
  try {
    const fechaOC = firebase.firestore.Timestamp.fromDate(new Date(fechaStr + 'T00:00:00'));
    await db.collection('machines').add({
      modelo,
      estado: 'pedido',
      fecha_oc: fechaOC,
      fecha_embarque: null,
      fecha_llegada: null,
      fecha_venta: null,
      notas,
      cliente: null,
      caracteristicas: null,
      vendido_por: null,
      creado_por: currentVendor?.nombre || currentUser.email,
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });
    hide('modal-add');
    showToast('Maquina agregada', `${modelo} agregada en estado Pedido`, 'success');
  } catch (err) {
    showError('add-error', 'Error al agregar: ' + err.message);
  }
  setLoading('add-submit-btn', false);
});

// Modal cambio de estado
function abrirModalEstado(machineId) {
  if (!isAdmin) return;
  activeStateMachineId = machineId;
  const machine = [...allCaminoMachines, ...allInmediataMachines].find(m => m.id === machineId);
  if (!machine) return;

  $('modal-state-info').textContent = `Máquina: ${machine.modelo} — Estado actual: ${estadoLabel(machine.estado)}`;

  const container = $('state-options');
  container.innerHTML = '';

  // Definir transiciones permitidas
  const transiciones = {
    pedido: [
      { estado: 'embarcado', label: '🔵 Marcar como Embarcada', clase: 'btn btn-warning btn-full' }
    ],
    embarcado: [
      { estado: 'entrega_inmediata', label: '🟢 Marcar Llegada a Planta (Entrega Inmediata)', clase: 'btn btn-success btn-full' }
    ],
    entrega_inmediata: []
  };

  const opciones = transiciones[machine.estado] || [];
  if (opciones.length === 0) {
    container.innerHTML = '<p class="text-muted">No hay transiciones disponibles para este estado.</p>';
  } else {
    opciones.forEach(op => {
      const btn = document.createElement('button');
      btn.className = op.clase;
      btn.textContent = op.label;
      btn.addEventListener('click', () => cambiarEstado(machineId, op.estado, machine));
      container.appendChild(btn);
    });
  }

  clearError('state-error');
  show('modal-state');
}
window.abrirModalEstado = abrirModalEstado;

async function cambiarEstado(machineId, nuevoEstado, machine) {
  const updates = {
    estado: nuevoEstado,
    actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (nuevoEstado === 'embarcado') {
    updates.fecha_embarque = firebase.firestore.FieldValue.serverTimestamp();
  }
  if (nuevoEstado === 'entrega_inmediata') {
    updates.fecha_llegada = firebase.firestore.FieldValue.serverTimestamp();
  }

  try {
    await db.collection('machines').doc(machineId).update(updates);
    hide('modal-state');
    showToast('Estado actualizado', `${machine.modelo} → ${estadoLabel(nuevoEstado)}`, 'success');
  } catch (err) {
    showError('state-error', 'Error al cambiar estado: ' + err.message);
  }
}

// ── E) MODAL VENTA ────────────────────────────────────────────
function abrirModalVenta(machineId) {
  activeSellMachineId = machineId;
  const machine = [...allCaminoMachines, ...allInmediataMachines].find(m => m.id === machineId);
  $('modal-sell-title').textContent = `Registrar Venta — ${machine?.modelo || ''}`;
  $('modal-sell-info').textContent = `Estado actual: ${estadoLabel(machine?.estado)}`;
  $('form-sell').reset();
  clearError('sell-error');
  show('modal-sell');
}
window.abrirModalVenta = abrirModalVenta;

$('form-sell').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeSellMachineId) return;
  clearError('sell-error');

  const cliente = $('sell-cliente').value.trim();
  const caracteristicas = $('sell-caracteristicas').value.trim();
  const notas = $('sell-notas').value.trim();

  if (!cliente || !caracteristicas) return;

  setLoading('sell-submit-btn', true);
  try {
    await db.collection('machines').doc(activeSellMachineId).update({
      estado: 'vendida_instalada',
      cliente,
      caracteristicas,
      notas,
      vendido_por: currentVendor?.nombre || currentUser.email,
      fecha_venta: firebase.firestore.FieldValue.serverTimestamp(),
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });
    hide('modal-sell');
    showToast('Venta registrada', `Vendida a ${cliente}`, 'success');
    activeSellMachineId = null;
  } catch (err) {
    showError('sell-error', 'Error al registrar venta: ' + err.message);
  }
  setLoading('sell-submit-btn', false);
});

// ── F) FCM PUSH TOKENS ────────────────────────────────────────
async function registrarPushNotifications() {
  if (!currentUser) return;
  const token = await inicializarPush();
  if (token) {
    await guardarTokenFCM(currentUser.uid, token);
  }
}

// Botón de la campana: solicitar permiso manualmente si fue denegado antes
$('bell-btn').addEventListener('click', async () => {
  notifCount = 0;
  hide('notif-badge');
  if (Notification.permission !== 'granted') {
    await registrarPushNotifications();
    if (Notification.permission === 'granted') {
      showToast('Notificaciones activadas', 'Recibirás alertas de cambios en el stock', 'success');
    }
  }
});

// ── Vendidas toggle ───────────────────────────────────────────
$('toggle-vendidas-header').addEventListener('click', () => {
  const wrapper = $('tabla-vendidas-wrapper');
  const icon = $('toggle-vendidas-icon');
  const isHidden = wrapper.classList.contains('hidden');
  if (isHidden) {
    show('tabla-vendidas-wrapper');
    icon.textContent = '▲';
  } else {
    hide('tabla-vendidas-wrapper');
    icon.textContent = '▼';
  }
});

// ── Cerrar modales ────────────────────────────────────────────
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => hide(btn.dataset.closeModal));
});

// Cerrar modal al tocar el overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.add('hidden');
  });
});

// ── Helpers ───────────────────────────────────────────────────
function estadoLabel(estado) {
  const map = {
    pedido: 'Pedido',
    embarcado: 'Embarcado',
    entrega_inmediata: 'Entrega Inmediata',
    vendida_instalada: 'Vendida e Instalada'
  };
  return map[estado] || estado;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
