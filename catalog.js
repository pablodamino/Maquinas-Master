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
