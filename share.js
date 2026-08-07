/* ═══════════════════════════════════════════════════════════════
   share.js — ficha compartible en un toque
   Compone la ficha de la máquina en un canvas y la manda directo a
   WhatsApp con la Web Share API. Reemplaza el "exportá la imagen y
   armá el mensaje a mano" que hacían los vendedores.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const FICHA_W = 1080;
const FICHA_H = 1350;
const FICHA_FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const ESTADO_COLOR = {
  pedido:            '#ffa53c',
  embarcado:         '#58a6ff',
  entrega_inmediata: '#35e08a',
  vendida_instalada: '#b98cff'
};
const ESTADO_FICHA = {
  pedido:            'PEDIDA · EN ESPERA',
  embarcado:         'EMBARCADA · EN TRÁNSITO',
  entrega_inmediata: 'DISPONIBLE · ENTREGA INMEDIATA',
  vendida_instalada: 'VENDIDA E INSTALADA'
};

/**
 * Carga la foto con CORS. Si el bucket no lo tiene habilitado, el canvas
 * quedaría contaminado y no se podría exportar; en ese caso devolvemos null
 * y la ficha se arma con una portada generada, que igual se ve bien.
 */
function cargarFotoCors(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.referrerPolicy = 'no-referrer';
    const t = setTimeout(() => resolve(null), 7000);
    img.onload  = () => { clearTimeout(t); resolve(img); };
    img.onerror = () => { clearTimeout(t); resolve(null); };
    img.src = url;
  });
}

/** Dibuja texto con salto de línea automático. Devuelve la Y final. */
function textoEnvuelto(ctx, texto, x, y, maxAncho, altoLinea, maxLineas) {
  const palabras = String(texto).split(/\s+/);
  let linea = '';
  let lineas = 0;

  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea ? linea + ' ' + palabras[i] : palabras[i];
    if (ctx.measureText(prueba).width > maxAncho && linea) {
      if (maxLineas && lineas === maxLineas - 1) {
        let corte = linea;
        while (ctx.measureText(corte + '…').width > maxAncho && corte.length) {
          corte = corte.slice(0, -1);
        }
        ctx.fillText(corte + '…', x, y);
        return y + altoLinea;
      }
      ctx.fillText(linea, x, y);
      y += altoLinea; lineas++;
      linea = palabras[i];
    } else {
      linea = prueba;
    }
  }
  if (linea) { ctx.fillText(linea, x, y); y += altoLinea; }
  return y;
}

function rectRedondo(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Arma la ficha completa y devuelve el canvas. */
async function componerFicha(m) {
  const cv = document.createElement('canvas');
  cv.width = FICHA_W; cv.height = FICHA_H;
  const ctx = cv.getContext('2d');
  const color = ESTADO_COLOR[m.estado] || '#ff2d40';

  ctx.fillStyle = '#0a0a0d';
  ctx.fillRect(0, 0, FICHA_W, FICHA_H);

  /* Foto (o portada generada) */
  const ALTO_FOTO = 760;
  const foto = await cargarFotoCors(m.imagen_url);

  if (foto) {
    const escala = Math.max(FICHA_W / foto.width, ALTO_FOTO / foto.height);
    const w = foto.width * escala, h = foto.height * escala;
    ctx.drawImage(foto, (FICHA_W - w) / 2, (ALTO_FOTO - h) / 2, w, h);
  } else {
    const g = ctx.createLinearGradient(0, 0, FICHA_W, ALTO_FOTO);
    g.addColorStop(0, '#1b1b22');
    g.addColorStop(1, '#101014');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FICHA_W, ALTO_FOTO);

    const halo = ctx.createRadialGradient(FICHA_W / 2, ALTO_FOTO / 2, 0, FICHA_W / 2, ALTO_FOTO / 2, 520);
    halo.addColorStop(0, color + '26');
    halo.addColorStop(1, 'transparent');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, FICHA_W, ALTO_FOTO);

    ctx.font = `300 190px ${FICHA_FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,.10)';
    ctx.textAlign = 'center';
    ctx.fillText('⚙', FICHA_W / 2, ALTO_FOTO / 2 + 66);
    ctx.textAlign = 'left';
  }

  /* Degradado inferior para que el texto respire */
  const scrim = ctx.createLinearGradient(0, ALTO_FOTO - 300, 0, ALTO_FOTO);
  scrim.addColorStop(0, 'rgba(10,10,13,0)');
  scrim.addColorStop(1, 'rgba(10,10,13,1)');
  ctx.fillStyle = scrim;
  ctx.fillRect(0, ALTO_FOTO - 300, FICHA_W, 300);

  /* Chapa de estado */
  const etiqueta = ESTADO_FICHA[m.estado] || String(m.estado || '').toUpperCase();
  ctx.font = `800 27px ${FICHA_FONT}`;
  const anchoTxt = ctx.measureText(etiqueta).width;
  ctx.fillStyle = 'rgba(10,10,13,.72)';
  rectRedondo(ctx, 64, 64, anchoTxt + 92, 62, 31);
  ctx.fill();
  ctx.strokeStyle = color + '66'; ctx.lineWidth = 2; ctx.stroke();

  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(101, 95, 9, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText(etiqueta, 126, 105);

  /* Cuerpo */
  let y = ALTO_FOTO + 24;
  const M = 64;
  const ANCHO = FICHA_W - M * 2;

  ctx.font = `800 68px ${FICHA_FONT}`;
  ctx.fillStyle = '#ffffff';
  y = textoEnvuelto(ctx, m.modelo || 'Máquina', M, y + 46, ANCHO, 78, 2);

  if (m.caracteristicas) {
    y += 18;
    ctx.font = `400 33px ${FICHA_FONT}`;
    ctx.fillStyle = '#a2a2ae';
    y = textoEnvuelto(ctx, m.caracteristicas, M, y, ANCHO, 46, 5);
  }

  /* Dato destacado: días desde la OC o fecha de llegada */
  const enCamino = m.estado === 'pedido' || m.estado === 'embarcado';
  let destacado = null;
  if (enCamino && m.fecha_oc) {
    destacado = { n: String(diasDesde(m.fecha_oc)), l: 'días desde la orden de compra' };
  } else if (m.estado === 'entrega_inmediata') {
    destacado = { n: '✓', l: 'lista para entregar hoy' };
  } else if (m.estado === 'vendida_instalada' && m.fecha_venta) {
    destacado = { n: '', l: 'Entregada el ' + fmtFecha(m.fecha_venta) };
  }

  if (destacado) {
    y += 26;
    const alto = 118;
    ctx.fillStyle = color + '1f';
    rectRedondo(ctx, M, y, ANCHO, alto, 22);
    ctx.fill();
    ctx.strokeStyle = color + '3d'; ctx.lineWidth = 2; ctx.stroke();

    if (destacado.n) {
      ctx.font = `800 62px ${FICHA_FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(destacado.n, M + 34, y + 80);
      const wN = ctx.measureText(destacado.n).width;
      ctx.font = `600 30px ${FICHA_FONT}`;
      ctx.fillStyle = color + 'cc';
      ctx.fillText(destacado.l, M + 34 + wN + 20, y + 76);
    } else {
      ctx.font = `600 34px ${FICHA_FONT}`;
      ctx.fillStyle = color;
      ctx.fillText(destacado.l, M + 34, y + 74);
    }
  }

  /* Pie de marca */
  ctx.fillStyle = '#ff2d40';
  ctx.fillRect(0, FICHA_H - 96, FICHA_W, 6);

  ctx.font = `800 34px ${FICHA_FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText('⚙  PANTÓGRAFOS MASTER', M, FICHA_H - 36);

  ctx.font = `600 25px ${FICHA_FONT}`;
  ctx.fillStyle = '#6a6a78';
  ctx.textAlign = 'right';
  ctx.fillText(fmtFecha(new Date()), FICHA_W - M, FICHA_H - 38);
  ctx.textAlign = 'left';

  return cv;
}

/** Texto de respaldo, para cuando no se puede compartir la imagen. */
function textoFicha(m) {
  const lineas = [`⚙ ${String(m.modelo || '').toUpperCase()}`];
  lineas.push(ESTADO_FICHA[m.estado] || '');
  if (m.caracteristicas) lineas.push('', m.caracteristicas);
  if (m.estado === 'pedido' || m.estado === 'embarcado') {
    if (m.fecha_oc) lineas.push('', `${diasDesde(m.fecha_oc)} días desde la orden de compra.`);
  }
  lineas.push('', '— Pantógrafos Master');
  return lineas.filter((l) => l !== null).join('\n');
}

const canvasABlob = (cv) => new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.9));

/**
 * Comparte la ficha. Cascada de respaldos, de mejor a peor:
 *   imagen por Web Share → texto por Web Share → descarga → portapapeles.
 */
async function compartirMaquina(m) {
  if (!m) return;
  const nombre = (norm(m.modelo).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'maquina') + '.jpg';
  const texto = textoFicha(m);

  let blob = null;
  try {
    const cv = await componerFicha(m);
    blob = await canvasABlob(cv);
  } catch (e) {
    console.warn('No se pudo componer la ficha:', e);
  }

  /* 1 — Imagen + texto por el menú nativo de compartir */
  if (blob && navigator.canShare) {
    const archivo = new File([blob], nombre, { type: 'image/jpeg' });
    if (navigator.canShare({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo], text: texto });
        haptic(18);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;   // el usuario cerró el menú
        console.warn('Share con archivo falló:', e);
      }
    }
  }

  /* 2 — Solo texto por el menú nativo */
  if (navigator.share) {
    try {
      await navigator.share({ title: m.modelo, text: texto });
      haptic(18);
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
  }

  /* 3 — Descargar la imagen (escritorio) */
  if (blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('Ficha descargada', 'Ya la podés mandar por WhatsApp.', 'success');
    return;
  }

  /* 4 — Copiar el texto */
  try {
    await navigator.clipboard.writeText(texto);
    toast('Ficha copiada', 'Pegala donde quieras.', 'success');
  } catch (e) {
    toast('No se pudo compartir', 'Probá desde el celular.', 'error');
  }
}
