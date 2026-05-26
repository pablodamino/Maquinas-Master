'use strict';

// ── Estado global ─────────────────────────────────
let currentUser   = null;
let currentVendor = null;
let isAdmin       = false;
let activeSellId  = null;
let activeEditId  = null;
let activeStateId = null;
let unsubscribers = [];
let notifCount    = 0;
let counterTimer  = null;
let caminoData    = [];
let inmediataData = [];
let vendidasData  = [];

// ── Helpers DOM ───────────────────────────────────
const $  = (id) => document.getElementById(id);
const show = (id) => $(id)?.classList.remove('hidden');
const hide = (id) => $(id)?.classList.add('hidden');

function showToast(title, body = '', type = '') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<div class="toast-title">${escHtml(title)}</div>${body ? `<div class="toast-body">${escHtml(body)}</div>` : ''}`;
  $('toast-container').prepend(t);
  setTimeout(() => t.remove(), 4500);
}

function setBtn(id, loading, origText) {
  const b = $(id); if (!b) return;
  if (loading) { b.disabled = true; b.dataset.orig = b.innerHTML; b.innerHTML = '<span class="spinner"></span>'; }
  else         { b.disabled = false; b.innerHTML = b.dataset.orig || origText || b.innerHTML; }
}

function showErr(id, msg) { const el=$(id); if(el){ el.textContent=msg; el.classList.remove('hidden'); } }
function clearErr(id)     { $(id)?.classList.add('hidden'); }

function formatFecha(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function diasDesde(ts) {
  if (!ts) return 0;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function escHtml(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase();
}

// ── A) AUTH ───────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await loadVendorProfile(user.uid);
    showApp();
    startListeners();
    registerPush();
  } else {
    currentUser = null; currentVendor = null; isAdmin = false;
    stopListeners();
    showLogin();
  }
});

async function loadVendorProfile(uid) {
  try {
    const snap = await db.collection('vendors').doc(uid).get();
    if (snap.exists) {
      currentVendor = { id: uid, ...snap.data() };
      // Aceptar "admin" o "Admin" (tolerante a mayúsculas)
      isAdmin = (currentVendor.rol || '').toLowerCase() === 'admin';
      console.log('Perfil cargado:', currentVendor.nombre, '| rol:', currentVendor.rol, '| isAdmin:', isAdmin);
    } else {
      console.warn('No existe documento en vendors/', uid, '— creando con rol vendedor');
      currentVendor = { id: uid, nombre: currentUser.email.split('@')[0], email: currentUser.email, rol: 'vendedor', fcm_tokens: [] };
      await db.collection('vendors').doc(uid).set(currentVendor);
      isAdmin = false;
    }
  } catch (e) {
    console.error('Error cargando perfil de vendor:', e);
    // Si falla la lectura del perfil, intentar continuar con rol básico
    currentVendor = { id: uid, nombre: currentUser.email.split('@')[0], email: currentUser.email, rol: 'vendedor', fcm_tokens: [] };
    isAdmin = false;
  }
}

function showLogin() {
  show('login-screen'); hide('app');
  if (counterTimer) { clearInterval(counterTimer); counterTimer = null; }
}

function showApp() {
  hide('login-screen'); show('app');
  const nombre = currentVendor?.nombre || currentUser?.email || '';
  $('header-user-name').textContent = nombre;
  $('header-avatar').textContent = initials(nombre);
  if (isAdmin) {
    show('fab-add');
    hide('debug-bar');
  } else {
    hide('fab-add');
    // Mostrar barra de debug para ayudar a diagnosticar
    $('debug-uid').textContent  = `UID: ${currentUser?.uid}`;
    $('debug-rol').textContent  = `rol detectado: "${currentVendor?.rol || 'ninguno'}"`;
    $('debug-admin').textContent = `isAdmin: ${isAdmin}`;
    show('debug-bar');
  }
  counterTimer = setInterval(refreshCounters, 60000);
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault(); clearErr('login-error');
  const email    = $('login-email').value.trim();
  const password = $('login-password').value;
  setBtn('login-btn', true);
  try {
    await auth.signInWithEmailAndPassword(email, password);
  } catch (err) {
    const msgs = {
      'auth/user-not-found':    'Email no encontrado.',
      'auth/wrong-password':    'Contraseña incorrecta.',
      'auth/invalid-credential':'Email o contraseña incorrectos.',
      'auth/invalid-email':     'Email inválido.',
      'auth/too-many-requests': 'Demasiados intentos. Esperá unos minutos.'
    };
    showErr('login-error', msgs[err.code] || 'Error al ingresar.');
    setBtn('login-btn', false);
  }
});

$('logout-btn').addEventListener('click', () => auth.signOut());

// ── B) FIRESTORE LISTENERS ────────────────────────
// Ordenamos del lado del cliente para evitar índices compuestos en Firestore
function sortBy(arr, field, desc = false) {
  return [...arr].sort((a, b) => {
    const va = a[field]?.toMillis?.() ?? a[field] ?? 0;
    const vb = b[field]?.toMillis?.() ?? b[field] ?? 0;
    return desc ? vb - va : va - vb;
  });
}

function startListeners() {
  stopListeners();

  // Máquinas en camino — sin orderBy para no requerir índice compuesto
  const u1 = db.collection('machines')
    .where('estado', 'in', ['pedido', 'embarcado'])
    .onSnapshot(
      snap => {
        caminoData = sortBy(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'fecha_oc');
        renderCamino();
      },
      err => {
        console.error('Error listener camino:', err);
        $('grid-camino').innerHTML = '<div class="empty-state">No hay máquinas en camino</div>';
        $('count-camino').textContent = '0';
        $('stat-camino').textContent = '0';
      }
    );

  const u2 = db.collection('machines')
    .where('estado', '==', 'entrega_inmediata')
    .onSnapshot(
      snap => {
        inmediataData = sortBy(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'fecha_llegada');
        renderInmediata();
      },
      err => {
        console.error('Error listener inmediata:', err);
        $('grid-inmediata').innerHTML = '<div class="empty-state">Sin equipos disponibles</div>';
        $('count-inmediata').textContent = '0';
        $('stat-inmediata').textContent = '0';
      }
    );

  const u3 = db.collection('machines')
    .where('estado', '==', 'vendida_instalada')
    .onSnapshot(
      snap => {
        renderVendidas(sortBy(snap.docs.map(d => ({ id: d.id, ...d.data() })), 'fecha_venta', true));
      },
      err => {
        console.error('Error listener vendidas:', err);
      }
    );

  unsubscribers = [u1, u2, u3];

  messaging.onMessage(payload => {
    const title = payload.notification?.title || 'Stock actualizado';
    const body  = payload.notification?.body  || '';
    showToast(title, body, 'success');
    notifCount++;
    $('notif-badge').textContent = notifCount;
    show('notif-badge');
  });
}

function stopListeners() { unsubscribers.forEach(u => u && u()); unsubscribers = []; }

// ── C) RENDER ─────────────────────────────────────
function badgeHtml(estado) {
  const map = {
    pedido:            `<span class="badge badge-pedido">● Pedido</span>`,
    embarcado:         `<span class="badge badge-embarcado">▶ Embarcado</span>`,
    entrega_inmediata: `<span class="badge badge-inmediata">✓ Disponible</span>`,
    vendida_instalada: `<span class="badge badge-vendida">✔ Vendida</span>`
  };
  return map[estado] || `<span class="badge">${escHtml(estado)}</span>`;
}

function imageHtml(m, cls = 'card-image') {
  if (m.imagen_url) {
    return `<img class="${cls}" src="${escHtml(m.imagen_url)}" alt="${escHtml(m.modelo)}" loading="lazy" />`;
  }
  return `<div class="card-image-placeholder"><span class="icon">🔧</span><span>${escHtml(m.modelo)}</span></div>`;
}

function cardCaminoHtml(m) {
  const dias = diasDesde(m.fecha_oc);
  const adminBtns = isAdmin ? `
    <button class="btn btn-outline btn-sm" onclick="openStateModal('${m.id}')">Estado logístico</button>
    <button class="btn btn-ghost btn-sm" onclick="openEditModal('${m.id}')" title="Editar">✏</button>
    <button class="btn-icon danger" onclick="confirmDelete('${m.id}')" title="Eliminar">🗑</button>` : '';
  return `
    <div class="machine-card" id="card-${m.id}">
      ${imageHtml(m)}
      <div class="card-body">
        <div class="card-top">
          <div class="card-modelo">${escHtml(m.modelo)}</div>
          ${badgeHtml(m.estado)}
        </div>
        ${m.caracteristicas ? `<div class="card-caracteristicas">${escHtml(m.caracteristicas)}</div>` : ''}
        <div class="card-counter">
          <span class="counter-num" data-desde="${m.fecha_oc?.toMillis?.() || ''}">${dias}</span>
          <span class="counter-label">&nbsp;días desde la OC</span>
        </div>
        <div class="card-meta">
          OC confirmada: <strong>${formatFecha(m.fecha_oc)}</strong>
          ${m.fecha_embarque ? `<br>Embarcada: <strong>${formatFecha(m.fecha_embarque)}</strong>` : ''}
          ${m.notas ? `<br><em>${escHtml(m.notas)}</em>` : ''}
        </div>
        <div class="card-actions">
          ${adminBtns}
          ${m.cliente
            ? `<div class="venta-info">📋 Vendida a <strong>${escHtml(m.cliente)}</strong></div>`
            : `<button class="btn btn-success btn-sm" onclick="openSellModal('${m.id}')">Registrar venta</button>`}
        </div>
      </div>
    </div>`;
}

function cardInmediataHtml(m) {
  const adminBtns = isAdmin ? `
    <button class="btn btn-outline btn-sm" onclick="openStateModal('${m.id}')">Estado</button>
    <button class="btn btn-ghost btn-sm" onclick="openEditModal('${m.id}')" title="Editar">✏</button>
    <button class="btn-icon danger" onclick="confirmDelete('${m.id}')" title="Eliminar">🗑</button>` : '';
  return `
    <div class="machine-card inmediata" id="card-${m.id}">
      ${imageHtml(m)}
      <div class="card-body">
        <div class="card-top">
          <div class="card-modelo">${escHtml(m.modelo)}</div>
          ${badgeHtml(m.estado)}
        </div>
        ${m.caracteristicas ? `<div class="card-caracteristicas">${escHtml(m.caracteristicas)}</div>` : ''}
        <div class="card-meta">
          ${m.fecha_llegada ? `Llegada: <strong>${formatFecha(m.fecha_llegada)}</strong>` : ''}
          ${m.notas ? `<br><em>${escHtml(m.notas)}</em>` : ''}
        </div>
        <div class="card-actions">
          ${adminBtns}
          ${m.cliente
            ? `<div class="venta-info">📋 Vendida a <strong>${escHtml(m.cliente)}</strong></div>`
            : `<button class="btn btn-success" onclick="openSellModal('${m.id}')">Registrar venta</button>`}
        </div>
      </div>
    </div>`;
}

function renderCamino() {
  const n = caminoData.length;
  $('count-camino').textContent = n;
  $('stat-camino').textContent  = n;
  $('grid-camino').innerHTML    = n
    ? caminoData.map(cardCaminoHtml).join('')
    : '<div class="empty-state">No hay máquinas en camino</div>';
}

function renderInmediata() {
  const n = inmediataData.length;
  $('count-inmediata').textContent = n;
  $('stat-inmediata').textContent  = n;
  $('grid-inmediata').innerHTML    = n
    ? inmediataData.map(cardInmediataHtml).join('')
    : '<div class="empty-state">Sin equipos disponibles para entrega inmediata</div>';
}

function renderVendidas(maquinas) {
  vendidasData = maquinas;
  const n = maquinas.length;
  $('count-vendidas').textContent = n;
  $('stat-vendidas').textContent  = n;
  const actionsTd = (m) => isAdmin
    ? `<td class="td-actions">
        <button class="btn-icon" onclick="openEditModal('${m.id}')" title="Editar">✏</button>
        <button class="btn-icon danger" onclick="confirmDelete('${m.id}')" title="Eliminar">🗑</button>
      </td>`
    : '<td></td>';
  $('tabla-vendidas-body').innerHTML = n
    ? maquinas.map(m => `
        <tr>
          <td>${m.imagen_url ? `<img class="td-thumb" src="${escHtml(m.imagen_url)}" alt="" loading="lazy">` : ''}</td>
          <td class="td-modelo">${escHtml(m.modelo)}</td>
          <td>${escHtml(m.cliente || '—')}</td>
          <td>${escHtml(m.vendido_por || '—')}</td>
          <td style="white-space:nowrap">${formatFecha(m.fecha_venta)}</td>
          <td class="notas-cell">${escHtml(m.caracteristicas || '')}${m.notas ? '<br><em>'+escHtml(m.notas)+'</em>' : ''}</td>
          ${actionsTd(m)}
        </tr>`).join('')
    : `<tr><td colspan="7" class="text-center text-muted" style="padding:2rem">Sin máquinas vendidas aún</td></tr>`;
}

function refreshCounters() {
  document.querySelectorAll('[data-desde]').forEach(el => {
    const ms = parseInt(el.dataset.desde, 10);
    if (ms) el.textContent = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
  });
}

// ── D) IMAGEN PREVIEW ─────────────────────────────
function bindImagePreview(inputId, previewWrapId) {
  $(inputId).addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wrap = $(previewWrapId);
      wrap.innerHTML = `<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:cover" />`;
    };
    reader.readAsDataURL(file);
  });
}

bindImagePreview('add-imagen', 'add-img-preview-wrap');
bindImagePreview('edit-imagen', 'edit-img-preview-wrap');

// ── E) AGREGAR MÁQUINA ────────────────────────────
$('fab-add').addEventListener('click', () => {
  $('form-add-machine').reset();
  clearErr('add-error');
  $('add-img-preview-wrap').innerHTML = `<div class="img-preview-placeholder"><span class="icon">📷</span><span>Sin imagen seleccionada</span></div>`;
  hide('add-upload-progress-wrap');
  $('add-fecha-oc').value = new Date().toISOString().split('T')[0];
  show('modal-add');
});

$('form-add-machine').addEventListener('submit', async (e) => {
  e.preventDefault(); clearErr('add-error');
  const modelo          = $('add-modelo').value.trim();
  const caracteristicas = $('add-caracteristicas').value.trim();
  const fechaStr        = $('add-fecha-oc').value;
  const notas           = $('add-notas').value.trim();
  const file            = $('add-imagen').files[0];
  if (!modelo || !caracteristicas || !fechaStr) return;

  setBtn('add-submit-btn', true);
  try {
    // Crear el documento primero para tener el ID
    const docRef = await db.collection('machines').add({
      modelo, caracteristicas, notas,
      estado: 'pedido',
      imagen_url: null,
      fecha_oc: firebase.firestore.Timestamp.fromDate(new Date(fechaStr + 'T00:00:00')),
      fecha_embarque: null, fecha_llegada: null, fecha_venta: null,
      cliente: null, vendido_por: null,
      creado_por: currentVendor?.nombre || currentUser.email,
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Subir imagen si se seleccionó
    if (file) {
      show('add-upload-progress-wrap');
      const url = await subirImagen(file, docRef.id, (pct) => {
        $('add-upload-progress').style.width = pct + '%';
      });
      await docRef.update({ imagen_url: url });
    }

    hide('modal-add');
    showToast('Máquina agregada', modelo, 'success');
  } catch (err) {
    showErr('add-error', 'Error: ' + err.message);
  }
  setBtn('add-submit-btn', false);
});

// ── F) EDITAR MÁQUINA ─────────────────────────────
function openEditModal(id) {
  if (!isAdmin) return;
  activeEditId = id;
  const m = [...caminoData, ...inmediataData, ...vendidasData].find(x => x.id === id);
  if (!m) return;
  const isVendida = m.estado === 'vendida_instalada';
  clearErr('edit-error');
  $('edit-machine-id').value = id;
  $('edit-modelo').value = m.modelo || '';
  $('edit-caracteristicas').value = m.caracteristicas || '';
  $('edit-notas').value = m.notas || '';
  if (isVendida) {
    $('edit-cliente').value = m.cliente || '';
    $('edit-vendido-por').value = m.vendido_por || '';
    show('edit-vendida-fields');
  } else {
    hide('edit-vendida-fields');
  }
  hide('edit-upload-progress-wrap');
  $('edit-img-preview-wrap').innerHTML = m.imagen_url
    ? `<img src="${escHtml(m.imagen_url)}" style="width:100%;height:100%;object-fit:cover" />`
    : `<div class="img-preview-placeholder"><span class="icon">📷</span><span>Sin imagen</span></div>`;
  show('modal-edit');
}
window.openEditModal = openEditModal;

$('form-edit-machine').addEventListener('submit', async (e) => {
  e.preventDefault(); clearErr('edit-error');
  const id              = $('edit-machine-id').value;
  const modelo          = $('edit-modelo').value.trim();
  const caracteristicas = $('edit-caracteristicas').value.trim();
  const notas           = $('edit-notas').value.trim();
  const file            = $('edit-imagen').files[0];
  if (!modelo || !caracteristicas) return;

  const isVendida = vendidasData.some(x => x.id === id);
  setBtn('edit-submit-btn', true);
  try {
    const updates = {
      modelo, caracteristicas, notas,
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (isVendida) {
      updates.cliente     = $('edit-cliente').value.trim();
      updates.vendido_por = $('edit-vendido-por').value.trim();
    }
    if (file) {
      show('edit-upload-progress-wrap');
      const url = await subirImagen(file, id, (pct) => {
        $('edit-upload-progress').style.width = pct + '%';
      });
      updates.imagen_url = url;
    }
    await db.collection('machines').doc(id).update(updates);
    hide('modal-edit');
    showToast('Cambios guardados', modelo, 'success');
  } catch (err) {
    showErr('edit-error', 'Error: ' + err.message);
  }
  setBtn('edit-submit-btn', false);
});

// ── G) CAMBIAR ESTADO LOGÍSTICO ───────────────────
function openStateModal(id) {
  if (!isAdmin) return;
  activeStateId = id;
  const m = [...caminoData, ...inmediataData].find(x => x.id === id);
  if (!m) return;
  $('modal-state-info').textContent = `${m.modelo} — Estado actual: ${estadoLabel(m.estado)}`;
  clearErr('state-error');

  const transitions = {
    pedido:            [{ estado:'embarcado',         icon:'🚢', title:'Marcar como Embarcada',       desc:'La máquina está en tránsito' }],
    embarcado:         [{ estado:'entrega_inmediata',  icon:'🏭', title:'Llegó a Planta',               desc:'Disponible para entrega inmediata' }],
    entrega_inmediata: [{ estado:'vendida_instalada', icon:'✅',
      title:'Instalar y Entregar',
      desc: m.cliente ? `Entregada a ${m.cliente}` : 'Marcar como vendida e instalada' }],
  };

  const opts = transitions[m.estado] || [];
  const container = $('state-options');
  container.innerHTML = '';

  if (!opts.length) {
    container.innerHTML = '<p class="text-muted" style="font-size:.875rem">No hay transiciones disponibles.</p>';
  } else {
    opts.forEach(op => {
      const btn = document.createElement('button');
      btn.className = 'state-option-btn';
      btn.innerHTML = `<span class="icon">${op.icon}</span><div><strong>${op.title}</strong><span>${op.desc}</span></div>`;
      btn.addEventListener('click', () => changeState(id, op.estado, m));
      container.appendChild(btn);
    });
  }
  show('modal-state');
}
window.openStateModal = openStateModal;

async function changeState(id, newState, m) {
  const updates = {
    estado: newState,
    actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
  };
  if (newState === 'embarcado')        updates.fecha_embarque = firebase.firestore.FieldValue.serverTimestamp();
  if (newState === 'entrega_inmediata') updates.fecha_llegada  = firebase.firestore.FieldValue.serverTimestamp();
  try {
    await db.collection('machines').doc(id).update(updates);
    hide('modal-state');
    showToast('Estado actualizado', `${m.modelo} → ${estadoLabel(newState)}`, 'success');
  } catch (err) {
    showErr('state-error', 'Error: ' + err.message);
  }
}

// ── H) REGISTRAR VENTA ────────────────────────────
function openSellModal(id) {
  activeSellId = id;
  const m = [...caminoData, ...inmediataData].find(x => x.id === id);
  $('modal-sell-title').textContent = `Registrar Venta — ${m?.modelo || ''}`;
  $('modal-sell-info').textContent  = `Estado actual: ${estadoLabel(m?.estado)}`;
  $('form-sell').reset(); clearErr('sell-error');
  show('modal-sell');
}
window.openSellModal = openSellModal;

$('form-sell').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!activeSellId) return; clearErr('sell-error');
  const cliente = $('sell-cliente').value.trim();
  const notas   = $('sell-notas').value.trim();
  if (!cliente) return;
  setBtn('sell-submit-btn', true);
  try {
    await db.collection('machines').doc(activeSellId).update({
      cliente, notas,
      vendido_por: currentVendor?.nombre || currentUser.email,
      fecha_venta: firebase.firestore.FieldValue.serverTimestamp(),
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });
    hide('modal-sell');
    showToast('Venta registrada', `Vendida a ${cliente} — se instalará cuando el admin cierre la logística`, 'success');
    activeSellId = null;
  } catch (err) {
    showErr('sell-error', 'Error: ' + err.message);
  }
  setBtn('sell-submit-btn', false);
});

// ── I) PUSH NOTIFICATIONS ─────────────────────────
async function registerPush() {
  if (!currentUser) return;
  const token = await inicializarPush();
  if (token) await guardarTokenFCM(currentUser.uid, token);
}

$('bell-btn').addEventListener('click', async () => {
  notifCount = 0; hide('notif-badge');
  if (Notification.permission !== 'granted') {
    await registerPush();
    if (Notification.permission === 'granted')
      showToast('Notificaciones activadas', 'Recibirás alertas de cambios en el stock', 'success');
  }
});

// ── J) TOGGLE VENDIDAS ────────────────────────────
$('toggle-vendidas-header').addEventListener('click', () => {
  const w = $('tabla-vendidas-wrapper');
  const i = $('toggle-vendidas-icon');
  const open = w.classList.contains('hidden');
  if (open) { show('tabla-vendidas-wrapper'); i.textContent = '▲'; i.classList.add('open'); }
  else      { hide('tabla-vendidas-wrapper'); i.textContent = '▼'; i.classList.remove('open'); }
});

// ── K) CERRAR MODALES ─────────────────────────────
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => hide(btn.dataset.closeModal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

// ── Helper: label legible del estado ─────────────
function estadoLabel(e) {
  return { pedido:'Pedido', embarcado:'Embarcado', entrega_inmediata:'Entrega Inmediata', vendida_instalada:'Vendida e Instalada' }[e] || e;
}

// ── L) ELIMINAR MÁQUINA (admin) ───────────────────
function confirmDelete(id) {
  if (!isAdmin) return;
  const m = [...caminoData, ...inmediataData, ...vendidasData].find(x => x.id === id);
  if (!m) return;
  if (!window.confirm(`¿Eliminar "${m.modelo}"? Esta acción no se puede deshacer.`)) return;
  deleteMachine(id, m.imagen_url);
}
window.confirmDelete = confirmDelete;

async function deleteMachine(id, imagenUrl) {
  try {
    await db.collection('machines').doc(id).delete();
    if (imagenUrl) {
      try { await storage.ref('machines/' + id + '/main').delete(); } catch (e) { /* imagen ya eliminada */ }
    }
    showToast('Máquina eliminada', '', 'success');
  } catch (err) {
    showToast('Error al eliminar', err.message, 'error');
  }
}
