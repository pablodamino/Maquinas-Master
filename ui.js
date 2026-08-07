/* ═══════════════════════════════════════════════════════════════
   ui.js — motor de render, animaciones y componentes
   El reconciliador keyed reemplaza el `innerHTML = …` completo que
   antes destruía el DOM en cada snapshot (y con él el scroll, el
   foco y toda animación en curso).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

/* ── Utilidades ─────────────────────────────────────────────── */

const $ = (id) => document.getElementById(id);

/** Escapa HTML. Ojo: `0` y `false` son valores válidos, no vacíos. */
function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Normaliza para búsqueda: sin acentos, minúsculas. */
const RE_TILDES = /[\u0300-\u036f]/g;
function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(RE_TILDES, '');
}

const toDate = (ts) => !ts ? null : (ts.toDate ? ts.toDate() : new Date(ts));

function fmtFecha(ts, opts) {
  const d = toDate(ts);
  if (!d || isNaN(d)) return '—';
  return d.toLocaleDateString('es-AR', opts || { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function fmtCorta(ts) {
  const d = toDate(ts);
  if (!d || isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
}

function diasDesde(ts) {
  const d = toDate(ts);
  if (!d || isNaN(d)) return 0;
  return Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
}

function haceCuanto(ts) {
  const d = toDate(ts);
  if (!d || isNaN(d)) return '';
  const seg = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seg < 60)    return 'recién';
  if (seg < 3600)  return `hace ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.floor(seg / 3600)} h`;
  const dias = Math.floor(seg / 86400);
  if (dias === 1)  return 'ayer';
  if (dias < 7)    return `hace ${dias} días`;
  return fmtFecha(ts, { day: '2-digit', month: 'short' });
}

function iniciales(nombre) {
  if (!nombre) return '?';
  return String(nombre).trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

const ESTADO_LABEL = {
  pedido: 'Pedido',
  embarcado: 'Embarcada',
  entrega_inmediata: 'Disponible',
  vendida_instalada: 'Vendida'
};
const ESTADO_ORDEN = { pedido: 0, embarcado: 1, entrega_inmediata: 2, vendida_instalada: 3 };

const menosMovimiento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Vibración corta de confirmación. Silenciosa donde no exista. */
function haptic(patron) {
  try { if (navigator.vibrate && !menosMovimiento()) navigator.vibrate(patron || 12); } catch (e) {}
}

/* ── Toasts ─────────────────────────────────────────────────── */

const TOAST_ICO = { success: '✓', error: '✕', info: 'ℹ', '': '•' };

function toast(titulo, cuerpo, tipo, ms) {
  const cont = $('toasts');
  if (!cont) return;

  const el = document.createElement('div');
  el.className = 'toast' + (tipo ? ` is-${tipo}` : '');
  el.innerHTML =
    `<span class="toast-ico">${TOAST_ICO[tipo] || TOAST_ICO['']}</span>` +
    `<div class="toast-txt"><strong>${esc(titulo)}</strong>` +
    (cuerpo ? `<p>${esc(cuerpo)}</p>` : '') + `</div>` +
    `<button class="toast-x" aria-label="Cerrar">✕</button>`;

  const cerrar = () => {
    if (el.classList.contains('is-out')) return;
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 280);
  };
  el.querySelector('.toast-x').addEventListener('click', cerrar);
  cont.appendChild(el);
  setTimeout(cerrar, ms || 4200);

  // Nunca dejar más de 4 apilados.
  while (cont.children.length > 4) cont.firstElementChild.remove();
  return el;
}

/* ── Hojas / modales ────────────────────────────────────────── */

const _pilaHojas = [];

function abrirHoja(id) {
  const el = $(id);
  if (!el || !el.classList.contains('hidden')) return;
  el.classList.remove('hidden', 'is-closing');
  document.body.classList.add('is-locked');
  _pilaHojas.push(id);

  // Enfocar el primer campo, pero no en celular: abrir el teclado de golpe molesta.
  if (window.innerWidth >= 640) {
    const primero = el.querySelector('input:not([type=hidden]):not([type=file]), textarea');
    if (primero) setTimeout(() => primero.focus(), 260);
  }
}

function cerrarHoja(id) {
  const el = $(id);
  if (!el || el.classList.contains('hidden')) return;
  el.classList.add('is-closing');
  const fin = () => {
    el.classList.add('hidden');
    el.classList.remove('is-closing');
    const i = _pilaHojas.lastIndexOf(id);
    if (i >= 0) _pilaHojas.splice(i, 1);
    if (!_pilaHojas.length) document.body.classList.remove('is-locked');
  };
  if (menosMovimiento()) fin();
  else setTimeout(fin, 260);
}

function cerrarHojaArriba() {
  if (_pilaHojas.length) cerrarHoja(_pilaHojas[_pilaHojas.length - 1]);
}

/** Confirmación con estilo propio, en vez del window.confirm del sistema. */
let _confirmResolver = null;
function confirmar({ titulo, texto, ok = 'Confirmar', glifo = '⚠', peligro = true }) {
  $('confirm-title').textContent = titulo;
  $('confirm-text').textContent = texto || '';
  $('confirm-glyph').textContent = glifo;
  const btn = $('confirm-ok');
  btn.textContent = ok;
  btn.className = 'btn ' + (peligro ? 'btn-primary' : 'btn-success');
  abrirHoja('sheet-confirm');
  return new Promise((res) => { _confirmResolver = res; });
}

function _resolverConfirm(v) {
  cerrarHoja('sheet-confirm');
  if (_confirmResolver) { _confirmResolver(v); _confirmResolver = null; }
}

/* ── Botones con estado de carga ────────────────────────────── */

function cargando(id, on) {
  const b = $(id);
  if (!b) return;
  if (on) {
    b.disabled = true;
    if (!b.dataset.orig) b.dataset.orig = b.innerHTML;
    b.innerHTML = '<span class="spinner"></span>';
  } else {
    b.disabled = false;
    if (b.dataset.orig) b.innerHTML = b.dataset.orig;
  }
}

function mostrarError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function limpiarError(id) { $(id)?.classList.add('hidden'); }

/* ── Contadores animados ────────────────────────────────────── */

function animarNumero(el, hasta) {
  if (!el) return;
  const desde = parseInt(el.textContent, 10) || 0;
  if (desde === hasta) return;
  if (menosMovimiento()) { el.textContent = hasta; return; }

  const t0 = performance.now();
  const dur = Math.min(700, 220 + Math.abs(hasta - desde) * 45);
  const paso = (t) => {
    const p = Math.min(1, (t - t0) / dur);
    const e = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(desde + (hasta - desde) * e);
    if (p < 1) requestAnimationFrame(paso);
    else el.textContent = hasta;
  };
  requestAnimationFrame(paso);
}

/* ── Reconciliador keyed + FLIP ─────────────────────────────── */

/**
 * Sincroniza los hijos de `cont` con `items` sin reconstruir el DOM.
 * Solo se crean, mueven o quitan los elementos que realmente cambiaron.
 */
function reconciliar(cont, items, { clave, crear, actualizar }) {
  const previos = new Map();
  for (const el of Array.from(cont.children)) {
    if (el.dataset.k) previos.set(el.dataset.k, el);
  }

  const vistos = new Set();
  let anterior = null;

  for (const item of items) {
    const k = clave(item);
    vistos.add(k);
    let el = previos.get(k);

    if (el) {
      actualizar(el, item);
    } else {
      el = crear(item);
      el.dataset.k = k;
      if (!menosMovimiento()) el.classList.add('is-new');
    }

    const destino = anterior ? anterior.nextSibling : cont.firstChild;
    if (el !== destino) cont.insertBefore(el, destino);
    anterior = el;
  }

  previos.forEach((el, k) => {
    if (vistos.has(k)) return;
    delete el.dataset.k;          // deja de ser candidato en la próxima pasada
    if (menosMovimiento()) { el.remove(); return; }
    el.classList.add('is-gone');
    setTimeout(() => el.remove(), 300);
  });
}

/** Igual que reconciliar, pero animando el desplazamiento de lo que se movió. */
function reconciliarFlip(cont, items, opts) {
  if (menosMovimiento()) return reconciliar(cont, items, opts);

  const antes = new Map();
  for (const el of cont.children) {
    if (el.dataset.k) antes.set(el.dataset.k, el.getBoundingClientRect());
  }

  reconciliar(cont, items, opts);

  for (const el of cont.children) {
    const k = el.dataset.k;
    if (!k) continue;
    const a = antes.get(k);
    if (!a) continue;
    const b = el.getBoundingClientRect();
    const dx = a.left - b.left, dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }],
      { duration: 340, easing: 'cubic-bezier(.22,1,.36,1)' }
    );
  }
}

/* ── Esqueletos ─────────────────────────────────────────────── */

function esqueletos(cont, n) {
  cont.innerHTML = Array.from({ length: n }, () => `
    <div class="skel">
      <div class="skel-media shim"></div>
      <div class="skel-body">
        <div class="sk-h shim"></div>
        <div class="sk-l shim"></div>
        <div class="sk-l short shim"></div>
        <div class="sk-box shim"></div>
      </div>
    </div>`).join('');
}

function vacio(cont, glifo, titulo, sub) {
  cont.innerHTML =
    `<div class="empty"><span class="e-glyph">${glifo}</span>` +
    `<span class="e-title">${esc(titulo)}</span>` +
    (sub ? `<span class="e-sub">${esc(sub)}</span>` : '') + `</div>`;
}

/* ── Piezas de la tarjeta ───────────────────────────────────── */

const ico = (nombre, w = 15) =>
  `<svg style="width:${w}px;height:${w}px" aria-hidden="true"><use href="#i-${nombre}"/></svg>`;

function badgeHtml(estado, plano) {
  return `<span class="badge${plano ? ' badge-flat' : ''}" data-e="${esc(estado)}">` +
         `<span class="b-dot"></span>${esc(ESTADO_LABEL[estado] || estado)}</span>`;
}

function mediaHtml(m) {
  const foto = m.imagen_url
    ? `<img class="mcard-img" src="${esc(m.imagen_url)}" alt="${esc(m.modelo)}" loading="lazy" decoding="async" />`
    : `<div class="mcard-ph"><span class="ph-glyph">⚙</span><span class="ph-txt">${esc(m.modelo)}</span></div>`;

  return `<div class="mcard-media">
      ${foto}
      <div class="mcard-scrim"></div>
      ${badgeHtml(m.estado)}
      <button class="media-btn" data-act="compartir" data-id="${esc(m.id)}" title="Compartir ficha" aria-label="Compartir ficha">
        ${ico('share', 15)}
      </button>
    </div>`;
}

function timelineHtml(m) {
  const idx = ESTADO_ORDEN[m.estado] ?? 0;
  // La fecha de entrega solo se muestra cuando la máquina fue realmente
  // entregada: en una reservada, fecha_venta es la fecha en que se apartó,
  // y ponerla bajo "Entrega" haría pensar que ya se instaló.
  const entregada = m.estado === 'vendida_instalada';
  const pasos = [
    { l: 'OC',       v: fmtCorta(m.fecha_oc) },
    { l: 'Embarque', v: fmtCorta(m.fecha_embarque) },
    { l: 'Planta',   v: fmtCorta(m.fecha_llegada) },
    { l: 'Entrega',  v: entregada ? fmtCorta(m.fecha_venta) : '' }
  ];
  return `<ol class="tl">` + pasos.map((p, i) => {
    const cls = i < idx ? 'is-done' : (i === idx ? 'is-done is-now' : '');
    return `<li class="tl-step ${cls}">
      <span class="tl-dot"></span>
      <span class="tl-lbl">${p.l}</span>
      <span class="tl-val num">${p.v || '·'}</span>
    </li>`;
  }).join('') + `</ol>`;
}

function accionesHtml(m, ctx) {
  const admin = ctx.isAdmin;
  const enCurso = m.estado !== 'vendida_instalada';
  let h = '';

  if (admin) {
    if (enCurso) {
      h += `<button class="btn btn-outline btn-sm" data-act="estado" data-id="${esc(m.id)}">Estado</button>`;
    }
    h += `<button class="btn-icon" data-act="editar" data-id="${esc(m.id)}" title="Editar" aria-label="Editar">${ico('edit')}</button>`;
    h += `<button class="btn-icon is-danger" data-act="borrar" data-id="${esc(m.id)}" title="Eliminar" aria-label="Eliminar">${ico('trash')}</button>`;
  }

  if (enCurso) {
    if (m.cliente) {
      h += `<button class="btn btn-ghost btn-sm" data-act="editar-venta" data-id="${esc(m.id)}">Editar venta</button>`;
      h += `<button class="btn-icon is-danger" data-act="cancelar-venta" data-id="${esc(m.id)}" title="Cancelar venta" aria-label="Cancelar venta">${ico('x')}</button>`;
    } else {
      h += `<button class="btn btn-success btn-sm" data-act="vender" data-id="${esc(m.id)}">Registrar venta</button>`;
    }
  }
  return h;
}

function bodyHtml(m, ctx) {
  const dias = diasDesde(m.fecha_oc);
  const enCamino = m.estado === 'pedido' || m.estado === 'embarcado';

  let h = `<div class="mcard-body">
    <h3 class="mcard-title">${esc(m.modelo)}</h3>`;

  if (m.caracteristicas) h += `<p class="mcard-specs">${esc(m.caracteristicas)}</p>`;

  if (enCamino) {
    h += `<div class="metric${dias > 90 ? ' is-warm' : ''}">
        <span class="metric-n num" data-desde="${m.fecha_oc?.toMillis?.() || ''}">${dias}</span>
        <span class="metric-l">${dias === 1 ? 'día' : 'días'} desde la OC</span>
      </div>`;
  } else if (m.estado === 'entrega_inmediata' && m.fecha_llegada) {
    const d = diasDesde(m.fecha_llegada);
    h += `<div class="metric">
        <span class="metric-n num" data-desde="${m.fecha_llegada?.toMillis?.() || ''}">${d}</span>
        <span class="metric-l">${d === 1 ? 'día' : 'días'} en planta</span>
      </div>`;
  }

  h += timelineHtml(m);

  if (m.notas) h += `<div class="mcard-note">${esc(m.notas)}</div>`;

  if (m.cliente) {
    h += `<div class="sold-tag"><span class="st-ico">📋</span>` +
         `<span>Vendida a <strong>${esc(m.cliente)}</strong>` +
         (m.vendido_por ? ` · ${esc(m.vendido_por)}` : '') + `</span></div>`;
  }

  h += `<div class="mcard-actions">${accionesHtml(m, ctx)}</div></div>`;
  return h;
}

/* Firmas: solo se vuelve a pintar la parte que cambió de verdad. */
const sigMedia = (m) => `${m.imagen_url || ''}|${m.estado}|${m.modelo}`;
const sigBody  = (m, ctx) => [
  m.modelo, m.caracteristicas, m.notas, m.estado, m.cliente, m.vendido_por,
  m.fecha_oc?.toMillis?.(), m.fecha_embarque?.toMillis?.(),
  m.fecha_llegada?.toMillis?.(), m.fecha_venta?.toMillis?.(), ctx.isAdmin
].join('|');

function crearTarjeta(m, ctx) {
  const el = document.createElement('article');
  el.className = 'mcard';
  el.dataset.id = m.id;
  el.dataset.estado = m.estado;
  el.dataset.sm = sigMedia(m);
  el.dataset.sb = sigBody(m, ctx);
  el.innerHTML = mediaHtml(m) + bodyHtml(m, ctx);
  return el;
}

function actualizarTarjeta(el, m, ctx) {
  el.dataset.estado = m.estado;
  el.dataset.id = m.id;

  const sm = sigMedia(m);
  if (el.dataset.sm !== sm) {
    el.dataset.sm = sm;
    const media = el.querySelector('.mcard-media');
    if (media) media.outerHTML = mediaHtml(m);
  }

  const sb = sigBody(m, ctx);
  if (el.dataset.sb !== sb) {
    el.dataset.sb = sb;
    const body = el.querySelector('.mcard-body');
    if (body) body.outerHTML = bodyHtml(m, ctx);
  }
}

/**
 * Saca de un contenedor todo lo que no sea una tarjeta viva: esqueletos de
 * carga y estados vacíos. Sin esto el reconciliador los ignora (no tienen
 * clave) y quedarían pegados para siempre debajo de las tarjetas reales.
 */
function limpiarNoKeyed(cont) {
  Array.from(cont.children).forEach((el) => {
    if (!el.dataset.k && !el.classList.contains('is-gone')) el.remove();
  });
}

/** Pinta una grilla de máquinas. */
function pintarGrilla(cont, maquinas, ctx, vacioCfg) {
  limpiarNoKeyed(cont);

  if (!maquinas.length) {
    // Quitar también las tarjetas que quedaron del filtro anterior.
    reconciliar(cont, [], { clave: (m) => m.id, crear: () => null, actualizar: () => {} });
    vacio(cont, vacioCfg.glifo, vacioCfg.titulo, vacioCfg.sub);
    return;
  }

  reconciliarFlip(cont, maquinas, {
    clave: (m) => m.id,
    crear: (m) => crearTarjeta(m, ctx),
    actualizar: (el, m) => actualizarTarjeta(el, m, ctx)
  });
}

/* ── Tabla de vendidas ──────────────────────────────────────── */

function filaVendidaHtml(m, ctx) {
  const thumb = m.imagen_url
    ? `<img class="td-thumb" src="${esc(m.imagen_url)}" alt="" loading="lazy" decoding="async">`
    : `<div class="td-thumb-ph">⚙</div>`;

  const acciones = ctx.isAdmin
    ? `<button class="btn-icon" data-act="editar" data-id="${esc(m.id)}" title="Editar" aria-label="Editar">${ico('edit')}</button>
       <button class="btn-icon is-danger" data-act="borrar" data-id="${esc(m.id)}" title="Eliminar" aria-label="Eliminar">${ico('trash')}</button>`
    : `<button class="btn-icon" data-act="compartir" data-id="${esc(m.id)}" title="Compartir" aria-label="Compartir">${ico('share')}</button>`;

  return `<td>${thumb}</td>
    <td class="td-model">${esc(m.modelo)}</td>
    <td>${esc(m.cliente || '—')}</td>
    <td class="td-dim">${esc(m.vendido_por || '—')}</td>
    <td class="td-nowrap td-dim num">${fmtFecha(m.fecha_venta)}</td>
    <td class="td-notes">${esc(m.caracteristicas || '')}${m.notas ? '<br>' + esc(m.notas) : ''}</td>
    <td class="td-act">${acciones}</td>`;
}

function pintarVendidas(tbody, maquinas, ctx) {
  limpiarNoKeyed(tbody);

  if (!maquinas.length) {
    reconciliar(tbody, [], { clave: (m) => m.id, crear: () => null, actualizar: () => {} });
    tbody.innerHTML =
      `<tr><td colspan="7" style="padding:2.6rem 1rem;text-align:center;color:var(--text-3);font-size:.85rem">
        Todavía no hay máquinas vendidas.</td></tr>`;
    return;
  }

  reconciliar(tbody, maquinas, {
    clave: (m) => m.id,
    crear: (m) => {
      const tr = document.createElement('tr');
      tr.dataset.id = m.id;
      tr.dataset.sb = sigBody(m, ctx);
      tr.innerHTML = filaVendidaHtml(m, ctx);
      return tr;
    },
    actualizar: (tr, m) => {
      const sb = sigBody(m, ctx);
      if (tr.dataset.sb === sb) return;
      tr.dataset.sb = sb;
      tr.innerHTML = filaVendidaHtml(m, ctx);
    }
  });
}

/* ── Resumen de máquina para las hojas ──────────────────────── */

function resumenHtml(m) {
  if (!m) return '';
  const img = m.imagen_url
    ? `<img src="${esc(m.imagen_url)}" alt="" loading="lazy">`
    : `<div class="ms-ph">⚙</div>`;
  return `<div class="msum">${img}
      <div class="msum-txt">
        <strong>${esc(m.modelo)}</strong>
        <span>Estado actual: ${esc(ESTADO_LABEL[m.estado] || m.estado)}</span>
      </div>
      ${badgeHtml(m.estado, true)}
    </div>`;
}

/* ── Refresco de los contadores de días ─────────────────────── */

function refrescarDias() {
  document.querySelectorAll('[data-desde]').forEach((el) => {
    const ms = parseInt(el.dataset.desde, 10);
    if (!ms) return;
    const d = Math.max(0, Math.floor((Date.now() - ms) / 86400000));
    if (String(d) !== el.textContent) el.textContent = d;
  });
}

/* ── Resaltar una máquina concreta ──────────────────────────── */

function resaltarMaquina(id) {
  const el = document.querySelector(`.mcard[data-id="${CSS.escape(id)}"]`);
  if (!el) return false;
  el.scrollIntoView({ behavior: menosMovimiento() ? 'auto' : 'smooth', block: 'center' });
  el.classList.remove('is-flash');
  void el.offsetWidth;              // reinicia la animación
  el.classList.add('is-flash');
  setTimeout(() => el.classList.remove('is-flash'), 1600);
  return true;
}
