/* ═══════════════════════════════════════════════════════════════
   app.js — orquestador
   Autenticación, listeners de Firestore, mutaciones, filtros y
   cableado de la interfaz. El render vive en ui.js.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── Estado ─────────────────────────────────────────────────── */

const DATA = { camino: [], inmediata: [], vendidas: [] };
let _unsubs      = [];
let _cargado     = { camino: false, inmediata: false, vendidas: false };
let _filtro      = 'todas';
let _busqueda    = '';
let _timerDias   = null;
let _idVenta     = null;
let _idEstado    = null;
let _promptInstall = null;

const FOTO = {
  add:  { blob: null, previa: null, delCatalogo: null, etiqueta: null },
  edit: { blob: null, previa: null, delCatalogo: null, etiqueta: null }
};

const todas = () => [...DATA.camino, ...DATA.inmediata, ...DATA.vendidas];
const buscarMaquina = (id) => todas().find((m) => m.id === id) || null;

function ordenar(arr, campo, desc) {
  return [...arr].sort((a, b) => {
    const va = a[campo]?.toMillis?.() ?? 0;
    const vb = b[campo]?.toMillis?.() ?? 0;
    if (!va && !vb) return norm(a.modelo).localeCompare(norm(b.modelo));
    if (!va) return 1;
    if (!vb) return -1;
    return desc ? vb - va : va - vb;
  });
}

/* ── Autenticación ──────────────────────────────────────────── */

auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    await cargarPerfil(user.uid);
    cargarUltimaLectura(currentVendor);
    mostrarApp();
    arrancarListeners();
    escucharCatalogo();
    escucharActividad();
    escucharFCMPrimerPlano();
    sincronizarTokenFCM();     // si el permiso ya estaba dado, refresca el token
  } else {
    pararListeners();
    dejarCatalogo();
    dejarActividad();
    currentUser = null; currentVendor = null; isAdmin = false;
    mostrarLogin();
  }
  $('boot')?.classList.add('is-gone');
});

async function cargarPerfil(uid) {
  const base = {
    id: uid,
    nombre: (currentUser.email || '').split('@')[0],
    email: currentUser.email || '',
    rol: 'vendedor',
    fcm_tokens: []
  };

  try {
    const snap = await db.collection('vendors').doc(uid).get();
    if (snap.exists) {
      currentVendor = { id: uid, ...snap.data() };
    } else {
      // Alta automática. Antes fallaba siempre porque la regla de creación
      // exigía isAdmin(), que a su vez leía este mismo documento inexistente.
      currentVendor = base;
      try {
        await db.collection('vendors').doc(uid).set({
          nombre: base.nombre, email: base.email, rol: 'vendedor', fcm_tokens: []
        });
      } catch (e) {
        console.warn('No se pudo crear el perfil:', e.code || e);
      }
    }
  } catch (e) {
    console.warn('No se pudo leer el perfil:', e.code || e);
    currentVendor = base;
  }

  isAdmin = String(currentVendor.rol || '').trim().toLowerCase() === 'admin';
}

function mostrarLogin() {
  $('app').classList.add('hidden');
  $('login-screen').classList.remove('hidden');
  if (_timerDias) { clearInterval(_timerDias); _timerDias = null; }
  cargando('login-btn', false);
  $('login-form').reset();
}

function mostrarApp() {
  $('login-screen').classList.add('hidden');
  $('app').classList.remove('hidden');

  const nombre = currentVendor?.nombre || currentUser?.email || '';
  $('btn-avatar').textContent = iniciales(nombre);
  $('um-name').textContent  = nombre;
  $('um-email').textContent = currentUser?.email || '';
  $('um-role').textContent  = isAdmin ? 'admin' : 'vendedor';

  $('fab').classList.toggle('hidden', !isAdmin);

  esqueletos($('grid-camino'), 3);
  esqueletos($('grid-inmediata'), 2);

  if (!_timerDias) _timerDias = setInterval(refrescarDias, 60000);
  actualizarEstadoNotif();
}

$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('login-error');
  const email = $('login-email').value.trim();
  const pass  = $('login-password').value;
  if (!email || !pass) return;

  cargando('login-btn', true);
  try {
    await auth.signInWithEmailAndPassword(email, pass);
  } catch (err) {
    const msgs = {
      'auth/user-not-found':     'No encontramos ese email.',
      'auth/wrong-password':     'Contraseña incorrecta.',
      'auth/invalid-credential': 'Email o contraseña incorrectos.',
      'auth/invalid-email':      'El email no es válido.',
      'auth/too-many-requests':  'Demasiados intentos. Esperá unos minutos.',
      'auth/network-request-failed': 'Sin conexión. Revisá internet e intentá de nuevo.'
    };
    mostrarError('login-error', msgs[err.code] || 'No pudimos ingresar. Probá de nuevo.');
    cargando('login-btn', false);
    haptic([50, 40, 50]);
  }
});

/* ── Listeners de Firestore ─────────────────────────────────── */

function arrancarListeners() {
  pararListeners();
  _cargado = { camino: false, inmediata: false, vendidas: false };

  const manejar = (clave, campo, desc, render) => (snap) => {
    marcarCache(snap.metadata.fromCache);
    DATA[clave] = ordenar(snap.docs.map((d) => ({ id: d.id, ...d.data() })), campo, desc);
    _cargado[clave] = true;
    render();
    actualizarStats();
  };

  const fallo = (clave, render) => (err) => {
    console.error(`Listener ${clave}:`, err);
    DATA[clave] = [];
    _cargado[clave] = true;
    render();
    actualizarStats();
    if (err.code === 'permission-denied') {
      toast('Sin permiso para ver el stock',
            'Pedile al administrador que revise tu perfil de vendedor.', 'error', 8000);
    }
  };

  // includeMetadataChanges permite saber si los datos vienen del caché, que es
  // la señal honesta de "estoy sin conexión con el servidor".
  const OPTS = { includeMetadataChanges: true };

  _unsubs = [
    db.collection('machines').where('estado', 'in', ['pedido', 'embarcado'])
      .onSnapshot(OPTS, manejar('camino', 'fecha_oc', false, render), fallo('camino', render)),

    db.collection('machines').where('estado', '==', 'entrega_inmediata')
      .onSnapshot(OPTS, manejar('inmediata', 'fecha_llegada', false, render), fallo('inmediata', render)),

    db.collection('machines').where('estado', '==', 'vendida_instalada')
      .onSnapshot(OPTS, manejar('vendidas', 'fecha_venta', true, render), fallo('vendidas', render))
  ];
}

function pararListeners() {
  _unsubs.forEach((u) => { try { u(); } catch (e) {} });
  _unsubs = [];
  clearTimeout(_tCache);
  _tCache = null;
  _desdeCache = false;
}

/* ── Filtrado y render ──────────────────────────────────────── */

/* "camino" no es un estado sino la sección: agrupa pedido + embarcado.
   Es lo que representa la estadística de la portada. */
const ESTADOS_DE = {
  camino: ['pedido', 'embarcado'],
  pedido: ['pedido'],
  embarcado: ['embarcado'],
  entrega_inmediata: ['entrega_inmediata'],
  vendida_instalada: ['vendida_instalada']
};

function coincide(m) {
  if (_filtro === 'mias') {
    const yo = norm(currentVendor?.nombre || currentUser?.email || '');
    if (norm(m.vendido_por) !== yo) return false;
  } else if (_filtro !== 'todas') {
    const permitidos = ESTADOS_DE[_filtro];
    if (permitidos && !permitidos.includes(m.estado)) return false;
  }

  if (!_busqueda) return true;
  const heno = norm([m.modelo, m.caracteristicas, m.cliente, m.vendido_por, m.notas].join(' '));
  return _busqueda.split(/\s+/).every((t) => heno.includes(t));
}

function seccionVisible(clave) {
  if (_filtro === 'todas' || _filtro === 'mias') return true;
  if (clave === 'camino')    return ['camino', 'pedido', 'embarcado'].includes(_filtro);
  if (clave === 'inmediata') return _filtro === 'entrega_inmediata';
  if (clave === 'vendidas')  return _filtro === 'vendida_instalada';
  return true;
}

function render() {
  const ctx = { isAdmin };
  const filtrando = _filtro !== 'todas' || !!_busqueda;

  const camino    = DATA.camino.filter(coincide);
  const inmediata = DATA.inmediata.filter(coincide);
  const vendidas  = DATA.vendidas.filter(coincide);

  $('sec-camino').classList.toggle('hidden', !seccionVisible('camino'));
  $('sec-inmediata').classList.toggle('hidden', !seccionVisible('inmediata'));
  $('sec-vendidas').classList.toggle('hidden', !seccionVisible('vendidas'));

  $('count-camino').textContent    = camino.length;
  $('count-inmediata').textContent = inmediata.length;
  $('count-vendidas').textContent  = vendidas.length;

  if (_cargado.camino) {
    pintarGrilla($('grid-camino'), camino, ctx, filtrando
      ? { glifo: '🔍', titulo: 'Nada por acá', sub: 'Ninguna máquina en camino coincide con lo que buscás.' }
      : { glifo: '🚢', titulo: 'No hay máquinas en camino', sub: 'Cuando se confirme una orden de compra va a aparecer acá.' });
  }

  if (_cargado.inmediata) {
    pintarGrilla($('grid-inmediata'), inmediata, ctx, filtrando
      ? { glifo: '🔍', titulo: 'Nada por acá', sub: 'Ninguna máquina disponible coincide con lo que buscás.' }
      : { glifo: '🏭', titulo: 'Sin equipos en planta', sub: 'Acá vas a ver lo que está listo para entregar hoy mismo.' });
  }

  if (_cargado.vendidas) pintarVendidas($('tabla-vendidas'), vendidas, ctx);

  // Al filtrar por vendidas, abrir la tabla sola: si no, el filtro parece vacío.
  if (_filtro === 'vendida_instalada') abrirVendidas(true);

  actualizarMisVentas();
}

function actualizarStats() {
  animarNumero($('stat-camino'), DATA.camino.length);
  animarNumero($('stat-inmediata'), DATA.inmediata.length);
  animarNumero($('stat-vendidas'), DATA.vendidas.length);
}

function actualizarMisVentas() {
  const caja = $('hero-mine');
  const yo = norm(currentVendor?.nombre || currentUser?.email || '');
  if (!yo) { caja.classList.add('hidden'); return; }

  const mias = todas().filter((m) => norm(m.vendido_por) === yo && m.fecha_venta);
  if (!mias.length) { caja.classList.add('hidden'); return; }

  const ahora = new Date();
  const esteMes = mias.filter((m) => {
    const d = toDate(m.fecha_venta);
    return d && d.getMonth() === ahora.getMonth() && d.getFullYear() === ahora.getFullYear();
  }).length;

  // Chispa de los últimos 6 meses.
  const meses = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - (5 - i), 1);
    return mias.filter((m) => {
      const f = toDate(m.fecha_venta);
      return f && f.getMonth() === d.getMonth() && f.getFullYear() === d.getFullYear();
    }).length;
  });
  const tope = Math.max(1, ...meses);

  caja.innerHTML =
    `<span class="hm-n num">${esteMes}</span>` +
    `<span>${esteMes === 1 ? 'venta tuya' : 'ventas tuyas'} este mes · ${mias.length} en total</span>` +
    `<span class="hm-spark">` +
    meses.map((v, i) => `<i style="height:${Math.max(3, Math.round((v / tope) * 20))}px;animation-delay:${i * 40}ms"></i>`).join('') +
    `</span>`;
  caja.classList.remove('hidden');
}

/* ── Acciones sobre las tarjetas ────────────────────────────── */

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  const m = buscarMaquina(id);
  if (!m) return;

  ev.preventDefault();
  ev.stopPropagation();

  switch (btn.dataset.act) {
    case 'compartir':       haptic(); compartirMaquina(m); break;
    case 'vender':          abrirVenta(m, false); break;
    case 'editar-venta':    abrirVenta(m, true); break;
    case 'cancelar-venta':  cancelarVenta(m); break;
    case 'estado':          abrirEstado(m); break;
    case 'editar':          abrirEditar(m); break;
    case 'borrar':          borrarMaquina(m); break;
  }
});

/* ── Alta de máquina ────────────────────────────────────────── */

function estadoElegido(contId) {
  return $(contId).querySelector('.chip.is-on')?.dataset.e || 'pedido';
}

$('add-estado').addEventListener('click', (ev) => {
  const c = ev.target.closest('.chip');
  if (!c) return;
  $('add-estado').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x === c));
  haptic();
});

$('fab').addEventListener('click', () => {
  $('form-add').reset();
  limpiarError('add-error');
  FOTO.add = { blob: null, previa: null, delCatalogo: null, etiqueta: null };
  pintarFoto('add', null);
  $('add-photo-note').textContent = '';
  $('add-suggest').innerHTML = '';
  $('add-progress').classList.add('hidden');
  $('add-progress').querySelector('i').style.width = '0%';
  $('add-estado').querySelectorAll('.chip').forEach((x, i) => x.classList.toggle('is-on', i === 0));
  $('add-fecha').value = new Date().toISOString().slice(0, 10);
  abrirHoja('sheet-add');
  haptic();
});

$('form-add').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('add-error');

  const modelo = $('add-modelo').value.trim();
  const carac  = $('add-caracteristicas').value.trim();
  const fecha  = $('add-fecha').value;
  const notas  = $('add-notas').value.trim();
  const estado = estadoElegido('add-estado');
  if (!modelo || !carac || !fecha) return;

  cargando('add-submit', true);
  try {
    const ahora = firebase.firestore.FieldValue.serverTimestamp();
    const doc = {
      modelo, caracteristicas: carac, notas,
      estado,
      imagen_url: FOTO.add.delCatalogo || null,
      fecha_oc: firebase.firestore.Timestamp.fromDate(new Date(fecha + 'T12:00:00')),
      fecha_embarque: estado === 'embarcado' ? ahora : null,
      fecha_llegada:  estado === 'entrega_inmediata' ? ahora : null,
      fecha_venta: null,
      cliente: null, vendido_por: null,
      creado_por: currentVendor?.nombre || currentUser.email,
      actualizado_en: ahora
    };

    const ref = await db.collection('machines').add(doc);

    let urlFinal = FOTO.add.delCatalogo || null;
    if (FOTO.add.blob) {
      const barra = $('add-progress');
      barra.classList.remove('hidden');
      urlFinal = await subirImagen(FOTO.add.blob, ref.id, (p) => {
        barra.querySelector('i').style.width = p + '%';
      });
      await ref.update({ imagen_url: urlFinal });
    }

    recordarModelo(modelo, urlFinal, carac);
    registrarActividad('alta', {
      maquinaId: ref.id, modelo, estado,
      titulo: estado === 'entrega_inmediata' ? 'Nueva máquina disponible' : 'Nueva máquina cargada',
      cuerpo: `${modelo} — ${ESTADO_LABEL[estado]}`
    });

    cerrarHoja('sheet-add');
    toast('Máquina agregada', modelo, 'success');
    haptic([12, 50, 12]);
  } catch (err) {
    console.error(err);
    mostrarError('add-error', mensajeError(err));
  }
  cargando('add-submit', false);
});

/* ── Edición ────────────────────────────────────────────────── */

function abrirEditar(m) {
  if (!isAdmin) return;
  limpiarError('edit-error');
  FOTO.edit = { blob: null, previa: null, delCatalogo: null, etiqueta: null };

  $('edit-id').value = m.id;
  $('edit-modelo').value = m.modelo || '';
  $('edit-caracteristicas').value = m.caracteristicas || '';
  $('edit-notas').value = m.notas || '';
  pintarFoto('edit', m.imagen_url || null);
  $('edit-progress').classList.add('hidden');
  $('edit-progress').querySelector('i').style.width = '0%';

  const vendida = m.estado === 'vendida_instalada';
  $('edit-sold-fields').classList.toggle('hidden', !vendida);
  if (vendida) {
    $('edit-cliente').value  = m.cliente || '';
    $('edit-vendedor').value = m.vendido_por || '';
  }

  abrirHoja('sheet-edit');
}

$('form-edit').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('edit-error');

  const id = $('edit-id').value;
  const m = buscarMaquina(id);
  if (!m) return;

  const modelo = $('edit-modelo').value.trim();
  const carac  = $('edit-caracteristicas').value.trim();
  const notas  = $('edit-notas').value.trim();
  if (!modelo || !carac) return;

  cargando('edit-submit', true);
  try {
    const cambios = {
      modelo, caracteristicas: carac, notas,
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (m.estado === 'vendida_instalada') {
      cambios.cliente     = $('edit-cliente').value.trim() || null;
      cambios.vendido_por = $('edit-vendedor').value.trim() || null;
    }

    if (FOTO.edit.blob) {
      const barra = $('edit-progress');
      barra.classList.remove('hidden');
      cambios.imagen_url = await subirImagen(FOTO.edit.blob, id, (p) => {
        barra.querySelector('i').style.width = p + '%';
      });
    } else if (FOTO.edit.delCatalogo) {
      cambios.imagen_url = FOTO.edit.delCatalogo;
    }

    await db.collection('machines').doc(id).update(cambios);
    recordarModelo(modelo, cambios.imagen_url || m.imagen_url, carac);

    cerrarHoja('sheet-edit');
    toast('Cambios guardados', modelo, 'success');
    haptic();
  } catch (err) {
    console.error(err);
    mostrarError('edit-error', mensajeError(err));
  }
  cargando('edit-submit', false);
});

/* ── Estado logístico ───────────────────────────────────────── */

const TRANSICIONES = {
  pedido:            [{ a: 'embarcado',         ico: '🚢', t: 'Marcar como embarcada', d: 'La máquina salió y está en tránsito' }],
  embarcado:         [{ a: 'entrega_inmediata', ico: '🏭', t: 'Llegó a planta',        d: 'Queda disponible para entrega inmediata' }],
  entrega_inmediata: [{ a: 'vendida_instalada', ico: '✅', t: 'Instalada y entregada', d: 'Pasa al histórico de vendidas' }]
};

function abrirEstado(m) {
  if (!isAdmin) return;
  _idEstado = m.id;
  limpiarError('state-error');
  $('state-sum').innerHTML = resumenHtml(m);

  const opts = TRANSICIONES[m.estado] || [];
  const cont = $('state-list');

  if (!opts.length) {
    cont.innerHTML = `<p style="font-size:.85rem;color:var(--text-3);text-align:center;padding:1.5rem 0">
      No hay transiciones disponibles desde este estado.</p>`;
  } else {
    cont.innerHTML = opts.map((o) => {
      const desc = (o.a === 'vendida_instalada' && m.cliente) ? `Entregada a ${m.cliente}` : o.d;
      return `<button class="state-opt" data-to="${o.a}">
        <span class="so-ico">${o.ico}</span>
        <span style="flex:1"><strong>${esc(o.t)}</strong><span>${esc(desc)}</span></span>
        <svg class="so-arrow" style="width:16px;height:16px"><use href="#i-right"/></svg>
      </button>`;
    }).join('');

    cont.querySelectorAll('.state-opt').forEach((b) => {
      b.addEventListener('click', () => cambiarEstado(m, b.dataset.to));
    });
  }
  abrirHoja('sheet-state');
}

async function cambiarEstado(m, nuevo) {
  if (m.estado === 'entrega_inmediata' && nuevo === 'vendida_instalada' && !m.cliente) {
    limpiarError('state-error');
    mostrarError('state-error', 'Registrá primero la venta: falta el cliente.');
    return;
  }

  const ahora = firebase.firestore.FieldValue.serverTimestamp();
  const cambios = { estado: nuevo, actualizado_en: ahora };
  if (nuevo === 'embarcado')         cambios.fecha_embarque = ahora;
  if (nuevo === 'entrega_inmediata') cambios.fecha_llegada  = ahora;
  if (nuevo === 'vendida_instalada' && !m.fecha_venta) cambios.fecha_venta = ahora;

  try {
    await db.collection('machines').doc(m.id).update(cambios);

    const avisos = {
      embarcado:         { tipo: 'embarcado', titulo: 'Máquina embarcada',      cuerpo: `${m.modelo} está en tránsito` },
      entrega_inmediata: { tipo: 'llegada',   titulo: 'Disponible para vender', cuerpo: `${m.modelo} llegó a planta — entrega inmediata` },
      vendida_instalada: { tipo: 'instalada', titulo: 'Máquina entregada',      cuerpo: `${m.modelo} fue instalada${m.cliente ? ' en ' + m.cliente : ''}` }
    };
    const av = avisos[nuevo];
    if (av) registrarActividad(av.tipo, { maquinaId: m.id, modelo: m.modelo, estado: nuevo, titulo: av.titulo, cuerpo: av.cuerpo });

    cerrarHoja('sheet-state');
    toast('Estado actualizado', `${m.modelo} → ${ESTADO_LABEL[nuevo]}`, 'success');
    haptic([12, 50, 12]);
  } catch (err) {
    console.error(err);
    mostrarError('state-error', mensajeError(err));
  }
}

/* ── Venta ──────────────────────────────────────────────────── */

function abrirVenta(m, editando) {
  _idVenta = m.id;
  $('form-sell').reset();
  limpiarError('sell-error');
  $('sell-title').textContent = editando ? 'Editar venta' : 'Registrar venta';
  $('sell-sum').innerHTML = resumenHtml(m);
  if (editando) {
    $('sell-cliente').value = m.cliente || '';
    $('sell-notas').value   = m.notas || '';
  }
  abrirHoja('sheet-sell');
}

$('form-sell').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!_idVenta) return;
  limpiarError('sell-error');

  const m = buscarMaquina(_idVenta);
  const cliente = $('sell-cliente').value.trim();
  const notas   = $('sell-notas').value.trim();
  if (!cliente || !m) return;

  const yaEstaba = !!m.cliente;
  cargando('sell-submit', true);
  try {
    await db.collection('machines').doc(_idVenta).update({
      cliente, notas,
      vendido_por: currentVendor?.nombre || currentUser.email,
      fecha_venta: firebase.firestore.FieldValue.serverTimestamp(),
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });

    if (!yaEstaba) {
      registrarActividad('venta', {
        maquinaId: m.id, modelo: m.modelo, estado: m.estado,
        titulo: 'Venta registrada',
        cuerpo: `${m.modelo} — ${cliente}`
      });
    }

    cerrarHoja('sheet-sell');
    toast(yaEstaba ? 'Venta actualizada' : 'Venta registrada',
          yaEstaba ? m.modelo : `${m.modelo} para ${cliente}`, 'success');
    haptic([14, 60, 14]);
    _idVenta = null;
  } catch (err) {
    console.error(err);
    mostrarError('sell-error', mensajeError(err));
  }
  cargando('sell-submit', false);
});

async function cancelarVenta(m) {
  const ok = await confirmar({
    titulo: '¿Cancelar la venta?',
    texto: `"${m.modelo}" figura vendida a ${m.cliente}. Al cancelar vuelve a quedar disponible para todos.`,
    ok: 'Sí, cancelar venta',
    glifo: '↩️'
  });
  if (!ok) return;

  try {
    await db.collection('machines').doc(m.id).update({
      cliente: null, vendido_por: null, fecha_venta: null,
      actualizado_en: firebase.firestore.FieldValue.serverTimestamp()
    });
    registrarActividad('venta_cancelada', {
      maquinaId: m.id, modelo: m.modelo, estado: m.estado,
      titulo: 'Venta cancelada',
      cuerpo: `${m.modelo} vuelve a estar disponible`
    });
    toast('Venta cancelada', `${m.modelo} vuelve a estar disponible`, 'success');
  } catch (err) {
    toast('No se pudo cancelar', mensajeError(err), 'error');
  }
}

/* ── Baja ───────────────────────────────────────────────────── */

async function borrarMaquina(m) {
  if (!isAdmin) return;
  const ok = await confirmar({
    titulo: `¿Eliminar "${m.modelo}"?`,
    texto: 'Se borra del stock junto con su foto. Esta acción no se puede deshacer.',
    ok: 'Eliminar',
    glifo: '🗑️'
  });
  if (!ok) return;

  try {
    await db.collection('machines').doc(m.id).delete();
    if (m.imagen_url) borrarImagen(m.id);
    registrarActividad('baja', {
      maquinaId: m.id, modelo: m.modelo, estado: m.estado,
      titulo: 'Máquina eliminada', cuerpo: m.modelo
    });
    toast('Máquina eliminada', m.modelo, 'success');
  } catch (err) {
    toast('No se pudo eliminar', mensajeError(err), 'error');
  }
}

function mensajeError(err) {
  if (err?.code === 'permission-denied') return 'No tenés permiso para hacer esto.';
  if (err?.code === 'unavailable')       return 'Sin conexión. Se va a sincronizar cuando vuelva internet.';
  return err?.message || 'Ocurrió un error inesperado.';
}

/* ── Fotos ──────────────────────────────────────────────────── */

function pintarFoto(cual, url) {
  const cont = $(cual + '-photo');
  if (url) {
    const etiqueta = FOTO[cual].delCatalogo === url ? (FOTO[cual].etiqueta || 'Del catálogo') : '';
    cont.innerHTML = `<img src="${esc(url)}" alt="Vista previa" />` +
      (etiqueta ? `<span class="photo-badge">✨ ${esc(etiqueta)}</span>` : '');
  } else {
    cont.innerHTML = `<div class="photo-empty"><span class="pe-glyph">📷</span><span>Sin foto</span></div>`;
  }
}

async function tomarFoto(cual, file) {
  if (!file) return;
  const nota = $(cual === 'add' ? 'add-photo-note' : 'edit-photo-note');
  if (nota) { nota.textContent = 'Optimizando…'; nota.className = 'hint'; }

  try {
    const r = await comprimirImagen(file);
    FOTO[cual].blob = r.blob;
    FOTO[cual].delCatalogo = null;
    FOTO[cual].etiqueta = null;

    if (FOTO[cual].previa) URL.revokeObjectURL(FOTO[cual].previa);
    FOTO[cual].previa = URL.createObjectURL(r.blob);
    pintarFoto(cual, FOTO[cual].previa);

    if (nota) {
      const kb = (n) => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
      if (r.final < r.original * 0.9) {
        nota.textContent = `${kb(r.original)} → ${kb(r.final)}`;
        nota.className = 'hint is-good';
      } else {
        nota.textContent = kb(r.final);
      }
    }
  } catch (err) {
    console.error('Compresión:', err);
    FOTO[cual].blob = file;
    if (nota) nota.textContent = '';
  }
}

['add', 'edit'].forEach((cual) => {
  $(`${cual}-photo-cam`).addEventListener('click', () => $(`${cual}-file-cam`).click());
  $(`${cual}-photo-lib`).addEventListener('click', () => $(`${cual}-file-lib`).click());
  $(`${cual}-photo`).addEventListener('click', () => $(`${cual}-file-lib`).click());
  $(`${cual}-file-cam`).addEventListener('change', (e) => tomarFoto(cual, e.target.files[0]));
  $(`${cual}-file-lib`).addEventListener('change', (e) => tomarFoto(cual, e.target.files[0]));
});

/* ── Catálogo: sugerencias en vivo ──────────────────────────── */

let _tSug = null;
$('add-modelo').addEventListener('input', (e) => {
  clearTimeout(_tSug);
  const v = e.target.value;
  _tSug = setTimeout(() => {
    pintarSugerencias('add-suggest', v, aplicarDelCatalogo);
  }, 220);
});

function aplicarDelCatalogo(entrada) {
  if (!entrada) return;
  $('add-modelo').value = entrada.modelo;
  if (entrada.caracteristicas && !$('add-caracteristicas').value.trim()) {
    $('add-caracteristicas').value = entrada.caracteristicas;
  }
  if (entrada.imagen_url && !FOTO.add.blob) {
    FOTO.add.delCatalogo = entrada.imagen_url;
    FOTO.add.etiqueta = 'Ya cargada antes';
    pintarFoto('add', entrada.imagen_url);
    $('add-photo-note').textContent = 'Foto reutilizada';
    $('add-photo-note').className = 'hint is-good';
  }
  $('add-suggest').innerHTML = '';
  haptic();
  toast('Completado desde el catálogo', entrada.modelo, 'success', 2600);
}

/* ── Dictado ────────────────────────────────────────────────── */

$('add-voice').addEventListener('click', async () => {
  const texto = await dictar();
  if (!texto) return;

  const r = parsearDictado(texto);
  if (!r.modelo) {
    toast('No te entendí', 'Probá de nuevo diciendo el modelo primero.', 'error');
    return;
  }

  $('add-modelo').value = r.modelo;
  if (r.caracteristicas) $('add-caracteristicas').value = r.caracteristicas;

  if (r.estado) {
    $('add-estado').querySelectorAll('.chip')
      .forEach((c) => c.classList.toggle('is-on', c.dataset.e === r.estado));
  }

  // Si el modelo ya existe en el catálogo, completar foto y características solo.
  const exacto = modeloExacto(r.modelo);
  const cercano = exacto || buscarModelo(r.modelo, 1)[0];
  if (cercano) {
    aplicarDelCatalogo(cercano);
    if (r.caracteristicas) $('add-caracteristicas').value = r.caracteristicas;
    if (r.modelo) $('add-modelo').value = r.modelo;
  } else {
    pintarSugerencias('add-suggest', r.modelo, aplicarDelCatalogo);
  }

  haptic([12, 40, 12]);
  const partes = [];
  if (r.estado) partes.push(ESTADO_LABEL[r.estado]);
  if (cercano) partes.push('foto del catálogo');
  toast('Listo', partes.length ? `Cargué: ${partes.join(' · ')}` : 'Revisá los datos y confirmá.', 'success');
});

if (!soportaVoz()) $('add-voice').classList.add('hidden');

/* ── Búsqueda y filtros ─────────────────────────────────────── */

let _tBusca = null;
$('search').addEventListener('input', (e) => {
  const v = e.target.value;
  $('search-clear').classList.toggle('hidden', !v);
  clearTimeout(_tBusca);
  _tBusca = setTimeout(() => { _busqueda = norm(v).trim(); render(); }, 160);
});

$('search-clear').addEventListener('click', () => {
  $('search').value = '';
  $('search-clear').classList.add('hidden');
  _busqueda = '';
  render();
  $('search').focus();
});

$('btn-search').addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: menosMovimiento() ? 'auto' : 'smooth' });
  setTimeout(() => $('search').focus(), 260);
});

$('chips').addEventListener('click', (ev) => {
  const c = ev.target.closest('.chip');
  if (!c) return;
  aplicarFiltro(c.dataset.f);
});

/* Cada estadística de la portada es también un filtro. */
const STAT_FILTRO = { camino: 'camino', inmediata: 'entrega_inmediata', vendidas: 'vendida_instalada' };

function aplicarFiltro(f) {
  _filtro = f;
  $('chips').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x.dataset.f === f));
  document.querySelectorAll('.stat').forEach((s) => {
    s.classList.toggle('is-on', STAT_FILTRO[s.dataset.k] === f);
  });
  haptic();
  render();
}

document.querySelectorAll('.stat').forEach((s) => {
  s.addEventListener('click', () => {
    const destino = STAT_FILTRO[s.dataset.k];
    aplicarFiltro(_filtro === destino ? 'todas' : destino);
    if (_filtro !== 'todas') {
      $('main').scrollIntoView({ behavior: menosMovimiento() ? 'auto' : 'smooth', block: 'start' });
    }
  });
});

/* ── Tabla de vendidas ──────────────────────────────────────── */

function abrirVendidas(forzar) {
  const w = $('vendidas-wrap');
  const b = $('toggle-vendidas');
  const abierta = !w.classList.contains('hidden');
  const nueva = forzar === undefined ? !abierta : forzar;
  if (nueva === abierta) return;

  w.classList.toggle('hidden', !nueva);
  w.classList.toggle('is-open', nueva);
  b.setAttribute('aria-expanded', String(nueva));
}

$('toggle-vendidas').addEventListener('click', () => { abrirVendidas(); haptic(); });

/* ── Cabecera pegajosa ──────────────────────────────────────── */

/* Un IntersectionObserver no sirve acá: el toolbar es sticky y sigue
   completamente visible aunque esté pegado. Comparamos su posición real. */
let _tickScroll = false;
window.addEventListener('scroll', () => {
  if (_tickScroll) return;
  _tickScroll = true;
  requestAnimationFrame(() => {
    const tb = $('toolbar');
    const alto = $('app-header').getBoundingClientRect().height;
    tb.classList.toggle('is-stuck', tb.getBoundingClientRect().top <= alto + 1);
    _tickScroll = false;
  });
}, { passive: true });

/* ── Menú de usuario ────────────────────────────────────────── */

function alternarMenu(forzar) {
  const m = $('user-menu');
  const abierto = !m.classList.contains('hidden');
  const nuevo = forzar === undefined ? !abierto : forzar;
  m.classList.toggle('hidden', !nuevo);
  if (nuevo) actualizarEstadoNotif();
}

$('btn-avatar').addEventListener('click', (e) => { e.stopPropagation(); alternarMenu(); haptic(); });

document.addEventListener('click', (e) => {
  if (!$('user-menu').classList.contains('hidden') &&
      !e.target.closest('#user-menu') && !e.target.closest('#btn-avatar')) {
    alternarMenu(false);
  }
});

$('um-logout').addEventListener('click', async () => {
  alternarMenu(false);
  const ok = await confirmar({
    titulo: '¿Cerrar sesión?',
    texto: 'Vas a tener que ingresar de nuevo con tu email y contraseña.',
    ok: 'Cerrar sesión', glifo: '👋'
  });
  if (!ok) return;
  if (currentUser) await borrarTokenFCM(currentUser.uid);
  auth.signOut();
});

$('um-notif').addEventListener('click', () => { alternarMenu(false); abrirPanelNotif(); });

function actualizarEstadoNotif() {
  const etiquetas = {
    granted: 'Activadas',
    default: 'Desactivadas',
    denied: 'Bloqueadas',
    'ios-necesita-instalar': 'Instalá la app',
    unsupported: 'No disponibles'
  };
  const el = $('um-notif-val');
  if (el) el.textContent = etiquetas[estadoPermiso()] || '—';
}

/* ── Tema ───────────────────────────────────────────────────── */

const TEMAS = ['sistema', 'claro', 'oscuro'];
const TEMA_ATTR = { sistema: null, claro: 'light', oscuro: 'dark' };

function aplicarTema(t) {
  const attr = TEMA_ATTR[t];
  if (attr) document.documentElement.setAttribute('data-theme', attr);
  else      document.documentElement.removeAttribute('data-theme');

  localStorage.setItem('pm-theme', attr || '');

  const oscuro = attr === 'dark' ||
    (!attr && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.style.background = oscuro ? '#08080a' : '#f2f2f4';
  $('meta-theme')?.setAttribute('content', oscuro ? '#08080a' : '#f2f2f4');

  $('um-theme-val').textContent = t.charAt(0).toUpperCase() + t.slice(1);
  $('um-theme-icon')?.setAttribute('href', oscuro ? '#i-moon' : '#i-sun');
}

(function temaInicial() {
  const g = localStorage.getItem('pm-theme');
  aplicarTema(g === 'dark' ? 'oscuro' : g === 'light' ? 'claro' : 'sistema');
})();

$('um-theme').addEventListener('click', (e) => {
  e.stopPropagation();
  const actual = $('um-theme-val').textContent.toLowerCase();
  const i = TEMAS.indexOf(actual);
  aplicarTema(TEMAS[(i + 1) % TEMAS.length]);
  haptic();
});

/* ── Notificaciones: campana ────────────────────────────────── */

$('btn-bell').addEventListener('click', () => { abrirPanelNotif(); haptic(); });
$('np-close').addEventListener('click', cerrarPanelNotif);
$('np-mark').addEventListener('click', () => {
  fijarUltimaLectura(Date.now());
  pintarPanel();
  toast('Todo al día', '', 'success', 1800);
});

/* ── Instalación ────────────────────────────────────────────── */

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _promptInstall = e;
  if (localStorage.getItem('pm-install-no') !== '1' && !estaInstalada()) {
    // Solo con sesión iniciada: encima del login sería una invitación a
    // instalar algo que el vendedor todavía no vio.
    setTimeout(() => {
      if (currentUser) $('install-cta').classList.remove('hidden');
    }, 9000);
  }
});

$('install-go').addEventListener('click', () => lanzarInstalacion());
$('install-no').addEventListener('click', () => {
  localStorage.setItem('pm-install-no', '1');
  $('install-cta').classList.add('hidden');
});
$('um-install').addEventListener('click', () => { alternarMenu(false); lanzarInstalacion(); });

async function lanzarInstalacion() {
  $('install-cta').classList.add('hidden');
  if (estaInstalada()) { toast('Ya está instalada', 'Estás usando la app instalada.', 'info'); return; }

  if (_promptInstall) {
    _promptInstall.prompt();
    const { outcome } = await _promptInstall.userChoice;
    _promptInstall = null;
    if (outcome === 'accepted') toast('¡Instalada!', 'Ya la tenés en la pantalla de inicio.', 'success');
    return;
  }

  if (esIOS) {
    toast('Cómo instalarla en iPhone',
          'Tocá Compartir abajo en Safari y elegí "Agregar a pantalla de inicio".', 'info', 8000);
  } else {
    toast('Instalación manual',
          'Abrí el menú del navegador (⋮) y elegí "Instalar app" o "Agregar a pantalla de inicio".', 'info', 8000);
  }
}

window.addEventListener('appinstalled', () => {
  $('install-cta').classList.add('hidden');
  localStorage.setItem('pm-install-no', '1');
});

/* ── Conexión ───────────────────────────────────────────────── */

let _desdeCache = false;
let _tCache = null;

/**
 * `navigator.onLine` solo dice si hay una interfaz de red: en la planta, con
 * wifi pero sin salida a internet, sigue en true. Que los datos vengan del
 * caché de Firestore es la señal real. Se espera unos segundos antes de
 * declararlo, porque el primer snapshot siempre llega del caché.
 */
function marcarCache(fromCache) {
  if (!fromCache) {
    clearTimeout(_tCache); _tCache = null;
    if (_desdeCache) { _desdeCache = false; pintarConexion(); }
    return;
  }
  if (_desdeCache || _tCache) return;
  _tCache = setTimeout(() => {
    _tCache = null; _desdeCache = true; pintarConexion();
  }, 4000);
}

function pintarConexion() {
  const conectado = navigator.onLine && !_desdeCache;
  $('live-dot').classList.toggle('is-off', !conectado);
  $('live-label').textContent = conectado ? 'En vivo' : 'Sin conexión';
}

window.addEventListener('online', () => {
  pintarConexion();
  toast('Conexión restablecida', 'Sincronizando…', 'success', 2200);
});
window.addEventListener('offline', () => {
  clearTimeout(_tCache); _tCache = null; _desdeCache = true;
  pintarConexion();
  toast('Sin conexión', 'Podés seguir viendo el stock guardado.', 'info', 3200);
});
pintarConexion();

/* ── Cierre de hojas ────────────────────────────────────────── */

document.querySelectorAll('[data-close]').forEach((b) => {
  b.addEventListener('click', () => cerrarHoja(b.dataset.close));
});

document.querySelectorAll('.overlay').forEach((ov) => {
  ov.addEventListener('click', (e) => {
    if (e.target !== ov) return;
    if (ov.id === 'sheet-confirm') _resolverConfirm(false);
    else cerrarHoja(ov.id);
  });
});

$('confirm-ok').addEventListener('click', () => _resolverConfirm(true));

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('user-menu').classList.contains('hidden')) { alternarMenu(false); return; }
  if (!$('notif-panel').classList.contains('hidden')) { cerrarPanelNotif(); return; }
  if (!$('sheet-confirm').classList.contains('hidden')) { _resolverConfirm(false); return; }
  cerrarHojaArriba();
});

/* ── Accesos directos del ícono de la app ───────────────────── */

/* Los shortcuts del manifest abren la app ya filtrada o en las novedades. */
function aplicarAtajoDeUrl() {
  const p = new URLSearchParams(location.search);
  const f = p.get('f');
  const panel = p.get('panel');
  if (!f && !panel) return;

  if (f && $('chips').querySelector(`.chip[data-f="${CSS.escape(f)}"]`)) aplicarFiltro(f);
  if (panel === 'novedades') setTimeout(abrirPanelNotif, 500);

  history.replaceState(null, '', location.pathname);
}

/* Se corre una sola vez, cuando ya hay sesión y datos en pantalla. */
let _atajoHecho = false;
const _obsAtajo = setInterval(() => {
  if (_atajoHecho || $('app').classList.contains('hidden')) return;
  _atajoHecho = true;
  clearInterval(_obsAtajo);
  aplicarAtajoDeUrl();
}, 300);
setTimeout(() => clearInterval(_obsAtajo), 15000);

/* Si el splash queda colgado por un error de red, sacarlo igual. */
setTimeout(() => $('boot')?.classList.add('is-gone'), 6000);
