/* ═══════════════════════════════════════════════════════════════
   catalog.js — memoria de modelos
   Cada vez que se carga una máquina con foto, el modelo queda
   guardado. La próxima vez que alguien escriba o dicte ese modelo,
   la foto y las características se completan solas.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

let CATALOGO = [];
let _catUnsub = null;

/** Clave estable del modelo: sin acentos, sin símbolos, sin espacios dobles. */
function claveModelo(modelo) {
  return norm(modelo)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '-')
    .slice(0, 120);
}

function tokens(texto) {
  return norm(texto)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

/** Escucha el catálogo en tiempo real. Falla en silencio si no hay permiso. */
function escucharCatalogo() {
  dejarCatalogo();
  _catUnsub = db.collection('catalog').onSnapshot(
    (snap) => { CATALOGO = snap.docs.map((d) => ({ id: d.id, ...d.data() })); },
    (err) => { console.info('Catálogo no disponible:', err.code || err); CATALOGO = []; }
  );
}

function dejarCatalogo() {
  if (_catUnsub) { _catUnsub(); _catUnsub = null; }
  CATALOGO = [];
}

/**
 * Busca modelos parecidos. Puntúa por solapamiento de palabras más un
 * premio si el texto arranca igual — "compresor 500" pega con
 * "Compresor 500 litros trifásico".
 */
function buscarModelo(texto, limite = 3) {
  const q = tokens(texto);
  if (!q.length || !CATALOGO.length) return [];

  const qn = norm(texto).trim();

  const puntuados = CATALOGO.map((c) => {
    const t = tokens(c.modelo);
    if (!t.length) return { c, score: 0 };

    let comunes = 0;
    for (const w of q) {
      if (t.some((x) => x === w || x.startsWith(w) || w.startsWith(x))) comunes++;
    }
    // Jaccard suavizado: penaliza que el candidato tenga mucho de más.
    let score = comunes / Math.max(q.length, Math.min(t.length, q.length + 2));

    const cn = norm(c.modelo).trim();
    if (cn === qn) score += 0.6;
    else if (cn.startsWith(qn) || qn.startsWith(cn)) score += 0.3;

    return { c, score };
  });

  return puntuados
    .filter((p) => p.score >= 0.5)
    .sort((a, b) => b.score - a.score || (b.c.usos || 0) - (a.c.usos || 0))
    .slice(0, limite)
    .map((p) => p.c);
}

/** Coincidencia única y confiable, para autocompletar sin preguntar. */
function modeloExacto(texto) {
  const k = claveModelo(texto);
  if (!k) return null;
  return CATALOGO.find((c) => c.id === k) || null;
}

/**
 * Guarda o refresca un modelo en el catálogo.
 * Nunca bloquea el alta de la máquina: si falla, se ignora.
 */
async function recordarModelo(modelo, imagenUrl, caracteristicas) {
  const k = claveModelo(modelo);
  if (!k) return;
  try {
    const datos = {
      modelo: String(modelo).trim(),
      actualizado: firebase.firestore.FieldValue.serverTimestamp(),
      usos: firebase.firestore.FieldValue.increment(1)
    };
    if (imagenUrl) datos.imagen_url = imagenUrl;
    if (caracteristicas) datos.caracteristicas = String(caracteristicas).trim();
    await db.collection('catalog').doc(k).set(datos, { merge: true });
  } catch (e) {
    console.info('No se pudo actualizar el catálogo:', e.code || e);
  }
}

/* ═══════════════════════════════════════════════════════════════
   Carga rápida desde el catálogo del proveedor (presets.js)
   Serie → medida → potencia. Tres toques y la máquina queda cargada
   con su foto y sus características, sin escribir nada.
   ═══════════════════════════════════════════════════════════════ */

let _pSerie = null;
let _pVar   = null;
let _pPot   = null;
let _pTipo  = 'todas';

/** 1500 → "1.5 kW" · 6000 → "6 kW" · 60000 → "60 kW" */
function kW(w) {
  const k = w / 1000;
  return (Number.isInteger(k) ? k : k.toFixed(1)) + ' kW';
}

function abrirCargaRapida() {
  if (typeof PRESETS === 'undefined' || !PRESETS.length) {
    toast('Catálogo no disponible', 'No se pudo cargar la lista de máquinas.', 'error');
    return;
  }
  _pSerie = _pVar = _pPot = null;
  _pTipo = 'todas';
  $('preset-tipos').querySelectorAll('.chip')
    .forEach((c) => c.classList.toggle('is-on', c.dataset.t === 'todas'));
  mostrarPaso(1);
  pintarSeries();
  abrirHoja('sheet-preset');
}

function mostrarPaso(n) {
  $('preset-paso1').classList.toggle('hidden', n !== 1);
  $('preset-paso2').classList.toggle('hidden', n !== 2);
  $('preset-back').classList.toggle('hidden', n !== 2);
  $('preset-usar').classList.toggle('hidden', n !== 2);
  $('preset-title').textContent = n === 1 ? 'Carga rápida' : (_pSerie ? 'HSG ' + _pSerie.serie : 'Configurar');

  if (n === 1) {
    $('preset-sub').textContent = 'Elegí la máquina del catálogo';
  } else {
    const conPot = _pVar && _pVar.potencias.length > 0;
    const porModelo = _pSerie && (_pSerie.tipo === 'plegado' || _pSerie.tipo === 'soldadura');
    const que = porModelo ? 'el modelo' : 'la medida';
    $('preset-sub').textContent = conPot ? `Elegí ${que} y la potencia` : `Elegí ${que}`;
  }
  $('sheet-preset').querySelector('.sheet-body').scrollTop = 0;
}

function pintarSeries() {
  const lista = PRESETS.filter((p) => _pTipo === 'todas' || p.tipo === _pTipo);
  const cont = $('preset-lista');

  if (!lista.length) {
    cont.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <span class="e-glyph">🔍</span><span class="e-title">Sin máquinas de este tipo</span></div>`;
    return;
  }

  cont.innerHTML = lista.map((p) => {
    const n = p.variantes.length;
    // Con una sola variante conviene mostrar el código real del modelo: la
    // serie "CB" se vende como C3015B, y buscándola por "CB" no aparecía.
    const detalle = n === 1
      ? esc(p.variantes[0].modelo)
      : `${n} ${p.tipo === 'plegado' || p.tipo === 'soldadura' ? 'modelos' : 'medidas'}`;
    return `<button type="button" class="preset-card" data-id="${esc(p.id)}">
        <img src="${esc(p.foto)}" alt="${esc(p.serie)}" loading="lazy" decoding="async">
        <span class="pc-txt">
          <span class="pc-nom">${esc(p.serie)}</span>
          <span class="pc-sub">${detalle} · ${esc(p.tipoTxt)}</span>
        </span>
      </button>`;
  }).join('');

  cont.querySelectorAll('.preset-card').forEach((b) => {
    b.addEventListener('click', () => elegirSerie(b.dataset.id));
  });
}

function elegirSerie(id) {
  _pSerie = PRESETS.find((p) => p.id === id);
  if (!_pSerie) return;

  _pVar = _pSerie.variantes[0];
  _pPot = _pVar.potencias[0] || null;

  $('preset-foto').src = _pSerie.foto;
  $('preset-foto').alt = _pSerie.serie;
  $('preset-serie').textContent = 'HSG ' + _pSerie.serie;
  $('preset-lema').textContent = _pSerie.lema || _pSerie.tipoTxt;

  // Las plegadoras se eligen por modelo y tonelaje, no por medida de mesa.
  const porModelo = _pSerie.tipo === 'plegado' || _pSerie.tipo === 'soldadura';
  $('preset-medida-label').textContent = porModelo ? 'Modelo' : 'Medida';

  pintarMedidas();
  pintarPotencias();
  actualizarResumen();
  mostrarPaso(2);
  haptic();
}

function pintarMedidas() {
  $('preset-medidas').innerHTML = _pSerie.variantes.map((v, i) => `
    <button type="button" class="chip${v === _pVar ? ' is-on' : ''}" data-i="${i}">
      ${esc(v.medida || v.modelo)}
    </button>`).join('');

  $('preset-medidas').querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      _pVar = _pSerie.variantes[parseInt(c.dataset.i, 10)];
      // Si la potencia elegida no existe en esta medida, tomar la más baja.
      if (!_pVar.potencias.includes(_pPot)) _pPot = _pVar.potencias[0] || null;
      pintarMedidas(); pintarPotencias(); actualizarResumen(); haptic();
    });
  });
}

function pintarPotencias() {
  // Sin potencias publicadas (plegadoras), el paso directamente no aparece.
  const hay = _pVar.potencias.length > 0;
  $('preset-pot-field').classList.toggle('hidden', !hay);
  if (!hay) { $('preset-potencias').innerHTML = ''; return; }

  $('preset-potencias').innerHTML = _pVar.potencias.map((w) => `
    <button type="button" class="chip${w === _pPot ? ' is-on' : ''}" data-w="${w}">${kW(w)}</button>`).join('');

  $('preset-potencias').querySelectorAll('.chip').forEach((c) => {
    c.addEventListener('click', () => {
      _pPot = parseInt(c.dataset.w, 10);
      pintarPotencias(); actualizarResumen(); haptic();
    });
  });
}

/** Nombre final de la máquina: "HSG G3015X · 6 kW" */
function nombrePreset() {
  if (!_pVar) return '';
  return `HSG ${_pVar.modelo}` + (_pPot ? ` · ${kW(_pPot)}` : '');
}

/** Texto de características armado con las especificaciones del fabricante. */
function caracteristicasPreset() {
  if (!_pSerie || !_pVar) return '';
  const partes = [`${_pSerie.tipoTxt} · HSG serie ${_pSerie.serie}.`];
  if (_pPot) partes.push(`Potencia ${_pPot} W.`);
  for (const [k, v] of Object.entries(_pVar.specs)) partes.push(`${k}: ${v}.`);
  return partes.join(' ');
}

function actualizarResumen() {
  $('preset-resumen').innerHTML =
    `<span class="pr-lbl">Se va a cargar</span>
     <span class="pr-modelo">${esc(nombrePreset())}</span>
     <span class="pr-specs">${esc(caracteristicasPreset())}</span>`;
}

/** Vuelca el preset elegido en el formulario de alta. */
function aplicarPreset() {
  if (!_pSerie || !_pVar) return;

  $('add-modelo').value = nombrePreset();
  $('add-caracteristicas').value = caracteristicasPreset();
  $('add-suggest').innerHTML = '';

  // La foto vive en el repo, así que se guarda su ruta relativa y no hay
  // nada que subir. Ventaja extra: al ser del mismo origen, la ficha
  // compartible puede dibujarla en el canvas sin problemas de CORS.
  FOTO.add.blob = null;
  FOTO.add.delCatalogo = _pSerie.foto;
  FOTO.add.etiqueta = 'Catálogo HSG';
  pintarFoto('add', _pSerie.foto);
  $('add-photo-note').textContent = 'Foto del catálogo';
  $('add-photo-note').className = 'hint is-good';

  cerrarHoja('sheet-preset');
  haptic([12, 45, 12]);
  toast('Cargada del catálogo', nombrePreset(), 'success', 2600);
}

/* Eventos del selector. Se registran al cargar: el script es `defer`,
   así que el DOM ya está armado. */
$('add-preset').addEventListener('click', abrirCargaRapida);
$('preset-back').addEventListener('click', () => { mostrarPaso(1); haptic(); });
$('preset-usar').addEventListener('click', aplicarPreset);

$('preset-tipos').addEventListener('click', (ev) => {
  const c = ev.target.closest('.chip');
  if (!c) return;
  _pTipo = c.dataset.t;
  $('preset-tipos').querySelectorAll('.chip').forEach((x) => x.classList.toggle('is-on', x === c));
  pintarSeries();
  haptic();
});

/* ── Interfaz de sugerencias ────────────────────────────────── */

/**
 * Dibuja las sugerencias debajo del campo de modelo.
 * `onPick(entrada)` recibe la entrada del catálogo elegida.
 */
function pintarSugerencias(contId, texto, onPick) {
  const cont = $(contId);
  if (!cont) return;

  const res = texto && texto.trim().length >= 3 ? buscarModelo(texto) : [];
  if (!res.length) { cont.innerHTML = ''; return; }

  cont.innerHTML =
    `<div class="suggest">
      <div class="suggest-title">Ya cargaste algo parecido</div>
      <div class="suggest-list">` +
      res.map((c, i) => {
        const img = c.imagen_url
          ? `<img src="${esc(c.imagen_url)}" alt="" loading="lazy">`
          : `<span class="si-ph">⚙</span>`;
        return `<button type="button" class="suggest-item" data-i="${i}">${img}${esc(c.modelo)}</button>`;
      }).join('') +
      `</div></div>`;

  cont.querySelectorAll('.suggest-item').forEach((btn) => {
    btn.addEventListener('click', () => onPick(res[parseInt(btn.dataset.i, 10)]));
  });
}
