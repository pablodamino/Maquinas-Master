/* ═══════════════════════════════════════════════════════════════
   voice.js — alta de máquinas por dictado
   El vendedor habla, la app entiende modelo, características y
   estado, y deja el formulario prellenado para que solo confirme.
   Nunca guarda a ciegas.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const soportaVoz = () => !!SR && window.isSecureContext;

/* Mapa de acentos a ASCII, uno a uno. Preserva la longitud del texto a
   propósito: así los índices de las coincidencias siguen siendo válidos
   sobre la cadena original, con acentos y todo. */
const SIN_TILDE = {
  'á':'a','é':'e','í':'i','ó':'o','ú':'u','ü':'u','ñ':'n',
  'Á':'A','É':'E','Í':'I','Ó':'O','Ú':'U','Ü':'U','Ñ':'N'
};
const aplanar = (s) => s.replace(/[áéíóúüñÁÉÍÓÚÜÑ]/g, (c) => SIN_TILDE[c]);

/* Palabras que delatan el estado.
   Van SIN acentos porque se prueban contra el texto aplanado: `\b` en
   JavaScript solo entiende [A-Za-z0-9_], así que /lleg[oó]\b/ jamás
   coincide con "llegó" — la ó no cuenta como carácter de palabra y no hay
   frontera. Ese era el motivo de que el dictado ignorara "ya llegó". */
const PISTAS_ESTADO = [
  { estado: 'entrega_inmediata', re: /\b(ya\s+)?(llego(\s+a\s+planta)?|en\s+planta|en\s+deposito|disponible|entrega\s+inmediata|ya\s+esta(\s+aca)?|para\s+entregar|lista\s+para\s+entregar)\b/i },
  { estado: 'embarcado',         re: /\b(recien\s+embarcad[ao]s?|embarcad[ao]s?|embarco|en\s+transito|en\s+camino|viajando|zarpo|en\s+(el\s+)?barco)\b/i },
  { estado: 'pedido',            re: /\b(recien\s+pedid[ao]s?|pedid[ao]s?|ordenad[ao]s?|orden\s+de\s+compra|solicitad[ao]s?|en\s+espera)\b/i }
];

/* Palabras vacías que sobran cuando se recorta la frase del estado. */
const RELLENO = /^(ya|y|o|que|se|esta|estan|es|son|fue|el|la|los|las|un|una|unos|unas|de|del|al|en|lo|muy|ahora)$/i;

function quitarRelleno(s) {
  const w = String(s).split(/\s+/).filter(Boolean);
  while (w.length && RELLENO.test(aplanar(w[0])))            w.shift();
  while (w.length && RELLENO.test(aplanar(w[w.length - 1]))) w.pop();
  const r = w.join(' ');
  return r.length < 3 ? '' : r.charAt(0).toUpperCase() + r.slice(1);
}

/**
 * Interpreta el dictado.
 * → { modelo, caracteristicas, estado }
 */
function parsearDictado(bruto) {
  // NFC primero: el reconocedor puede devolver los acentos descompuestos,
  // y el mapa de aplanado solo entiende los caracteres precompuestos.
  let t = String(bruto || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  if (!t) return { modelo: '', caracteristicas: '', estado: null };

  // 1. Buscar el estado sobre el texto aplanado y recortarlo del original.
  //    Los índices coinciden porque aplanar() no cambia la longitud.
  let estado = null;
  const plano = aplanar(t);
  for (const p of PISTAS_ESTADO) {
    const m = plano.match(p.re);
    if (m) {
      estado = p.estado;
      t = (t.slice(0, m.index) + ' ' + t.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
      break;
    }
  }

  // 2. Limpiar conectores y puntuación que quedan colgando.
  t = t.replace(/\s*[,;.]\s*$/, '')
       .replace(/^\s*[,;.]\s*/, '')
       .replace(/\s+(y|que|el|la)\s*$/i, '')
       .trim();

  // 3. Separar modelo de características.
  let modelo = t, caracteristicas = '';

  const conM = t.match(/\s+con\s+/i);
  const comaI = t.indexOf(',');

  if (comaI > 0) {
    modelo = t.slice(0, comaI);
    caracteristicas = t.slice(comaI + 1);
  } else if (conM && conM.index > 2) {
    modelo = t.slice(0, conM.index);
    caracteristicas = t.slice(conM.index + conM[0].length);
  }

  const pulir = (s) => String(s).replace(/\s*[,;.]+\s*$/, '').replace(/\s+/g, ' ').trim();
  modelo = pulir(modelo);
  caracteristicas = pulir(caracteristicas);

  // Al recortar el estado quedan verbos y conectores sueltos ("está", "ya").
  // Sin esto, "guillotina, está en tránsito" dejaba "Está" como característica.
  caracteristicas = quitarRelleno(caracteristicas);
  if (modelo) modelo = modelo.charAt(0).toUpperCase() + modelo.slice(1);
  if (caracteristicas) caracteristicas = caracteristicas.charAt(0).toUpperCase() + caracteristicas.slice(1);

  return { modelo, caracteristicas, estado };
}

/* ── Overlay de dictado ─────────────────────────────────────── */

let _rec = null;
let _finalizado = '';
let _resolver = null;
let _cortarPor = null;

function _pintarVoz(interino) {
  const el = $('voice-text');
  if (!el) return;
  el.innerHTML = esc(_finalizado) +
    (interino ? `<span class="vt-interim"> ${esc(interino)}</span>` : '');
}

function _terminarVoz(texto) {
  clearTimeout(_cortarPor);
  if (_rec) {
    _rec.onend = null; _rec.onresult = null; _rec.onerror = null;
    try { _rec.stop(); } catch (e) {}
    _rec = null;
  }
  $('voice-overlay')?.classList.add('hidden');
  document.body.classList.remove('is-locked');
  if (_resolver) { _resolver(texto); _resolver = null; }
}

/**
 * Abre el overlay y escucha. Devuelve el texto dictado, o null si se canceló.
 * Se reinicia solo cuando el navegador corta por silencio, así el vendedor
 * puede pensar entre frase y frase sin perder lo que ya dijo.
 */
function dictar() {
  if (!soportaVoz()) {
    toast('Dictado no disponible',
          'Necesitás Chrome en Android o en la computadora.', 'error');
    return Promise.resolve(null);
  }

  _finalizado = '';
  const ov = $('voice-overlay');
  ov.classList.remove('hidden', 'is-idle');
  document.body.classList.add('is-locked');
  $('voice-status').textContent = 'Escuchando…';
  _pintarVoz('');

  let cerrandoAdrede = false;

  const arrancar = () => {
    _rec = new SR();
    _rec.lang = 'es-AR';
    _rec.continuous = true;
    _rec.interimResults = true;
    _rec.maxAlternatives = 1;

    _rec.onresult = (ev) => {
      let interino = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const txt = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) _finalizado += (_finalizado ? ' ' : '') + txt.trim();
        else interino += txt;
      }
      _pintarVoz(interino);
    };

    _rec.onerror = (ev) => {
      if (ev.error === 'no-speech') return;                 // silencio: seguimos
      if (ev.error === 'aborted' && cerrandoAdrede) return;
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
        cerrandoAdrede = true;
        _terminarVoz(null);
        toast('Micrófono bloqueado',
              'Habilitá el micrófono para este sitio y probá de nuevo.', 'error', 6000);
        return;
      }
      console.warn('Dictado:', ev.error);
    };

    // Android corta por silencio: reanudar mientras el overlay siga abierto.
    _rec.onend = () => {
      if (cerrandoAdrede) return;
      try { _rec.start(); } catch (e) { /* ya arrancando */ }
    };

    try { _rec.start(); }
    catch (e) { console.warn('No se pudo iniciar el dictado:', e); }
  };

  arrancar();
  haptic(14);

  // Tope duro de 90 s, para no dejar el micrófono abierto por olvido.
  _cortarPor = setTimeout(() => {
    cerrandoAdrede = true;
    _terminarVoz(_finalizado.trim() || null);
  }, 90000);

  return new Promise((res) => {
    _resolver = res;

    $('voice-done').onclick = () => {
      cerrandoAdrede = true;
      $('voice-status').textContent = 'Procesando…';
      ov.classList.add('is-idle');
      setTimeout(() => _terminarVoz(_finalizado.trim() || null), 220);
    };
    $('voice-cancel').onclick = () => {
      cerrandoAdrede = true;
      _terminarVoz(null);
    };
  });
}
