#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   actualizar-catalogo.js

   Regenera la carga rápida desde el catálogo oficial de HSG:
   baja las fotos a catalogo/ y reescribe presets.js con las series,
   sus medidas y las potencias en las que viene cada una.

   Uso, desde la raíz del proyecto:
       node tools/actualizar-catalogo.js

   Sin dependencias: solo Node 18 o superior (fetch incluido).
   Correr cuando HSG actualice su línea de productos.
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const DIR_FOTOS = path.join(RAIZ, 'catalogo');
const BASE = 'https://www.hsglaser.com';
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36' };

const CATEGORIAS = [
  ['sheet-metal', 'chapa', 'Corte de chapa'],
  ['tube-metal', 'tubo', 'Corte de tubo'],
  ['sheet-tube', 'chapa-tubo', 'Corte de chapa y tubo'],
  ['bending-machine', 'plegado', 'Plegadora'],
  ['welding-machine', 'soldadura', 'Soldadora'],
  ['automation-equipment', 'automatizacion', 'Automatización']
];

/* Productos que están en el sitemap pero no figuran en ninguna página de
   categoría. Como la asociación de la foto se hace por cercanía dentro de la
   categoría, para estos hay que indicar la imagen a mano. */
const SUELTOS = [
  {
    ruta: '/es/product/laser-cutting-machine-cell.html',
    tipo: 'chapa',
    tipoTxt: 'Corte 3D de 5 ejes',
    imagen: 'https://static.hsglasercnc.com/img/cell/cell.webp'
  }
];

/* Potencias comerciales de fibra. El sitio publica rangos ("3000W-20000W");
   acá se traducen a las opciones concretas que se pueden pedir. */
const ESCALONES = [1000, 1500, 2000, 3000, 4000, 6000, 8000, 12000, 15000, 20000, 25000, 30000, 40000, 60000];

const CLAVES_POT   = ['Potencia', 'Potencia del láser', 'Potencia láser máxima', 'Poder', 'Potenza Laser'];
/* Las plegadoras no se miden en watts sino en toneladas de fuerza. */
const CLAVES_FUERZA = ['Fuerza de plegado', 'Fuerza de flexión'];
const CLAVES_AREA  = ['Área de trabajo (L*W)', 'Área de corte (Largo × Ancho)', 'Formato de procesamiento', 'Area di lavoro'];
const CLAVES_TUBO  = ['Procesamiento de tubo redondo Dim', 'Capacidad De Corte De Tubo Redondo',
                      'Capacidad de corte de tubos redondos', 'Rango de tubos en diámetro'];
const CLAVES_LARGO = ['Rango de longitud del tubo', 'El rango de material de tubo'];

async function bajar(url, binario = false) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const buf = Buffer.from(await r.arrayBuffer());
  return binario ? buf : buf.toString('utf8');
}

const limpiar = (s) => s
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(d))
  .replace(/\s+/g, ' ').trim();

const primero = (campos, claves) => { for (const k of claves) if (campos[k]) return campos[k]; return ''; };

/**
 * Los lemas del sitio vienen con viñetas al principio y varias frases pegadas
 * ("* Calcula el ángulo * Corrige la desviación"). Se toma la primera frase y
 * se corta en palabra entera, para que no queden colgando sílabas sueltas.
 */
function pulirLema(txt) {
  let s = String(txt || '')
    .replace(/^[\s*•·\-–—]+/, '')
    .split(/\s*[*•]\s*/)[0]
    .trim();
  if (s.length <= 120) return s;
  s = s.slice(0, 120);
  const corte = s.lastIndexOf(' ');
  return (corte > 60 ? s.slice(0, corte) : s).replace(/[\s,;.]+$/, '') + '…';
}

/* El cuadro de especificaciones tiene una columna de etiquetas y una columna
   por modelo dentro de un carrusel. */
function extraerParametros(html) {
  const i = html.indexOf('technical-parameters');
  if (i < 0) return [];
  const bloque = html.slice(i, i + 40000);

  const listas = [...bloque.matchAll(/<ul class="list-unstyled">([\s\S]*?)<\/ul>/g)]
    .map((m) => [...m[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((x) => limpiar(x[1])));
  if (!listas.length) return [];

  const etiquetas = listas[0];
  return listas.slice(1)
    .filter((c) => c.length && c.some(Boolean))
    .map((col) => {
      const campos = {};
      etiquetas.forEach((et, k) => { if (col[k]) campos[et] = col[k]; });
      return { modelo: col[0] || '', campos };
    })
    .filter((m) => m.modelo);
}

function potencias(txt) {
  if (!txt) return [];
  const kw = /kw/i.test(txt);
  const nums = [...txt.matchAll(/(\d[\d.]*)/g)]
    .map((m) => { const n = parseFloat(m[1]); return kw && n < 100 ? Math.round(n * 1000) : n; })
    .filter((n) => n >= 500);
  if (!nums.length) return [];

  const min = Math.min(...nums), max = Math.max(...nums);
  const lista = ESCALONES.filter((p) => p >= min && p <= max);
  if (!lista.includes(min)) lista.unshift(min);
  if (!lista.includes(max)) lista.push(max);
  return [...new Set(lista)].sort((a, b) => a - b);
}

function medida(campos) {
  const area = primero(campos, CLAVES_AREA);
  if (area) {
    // El "mm" puede aparecer entre ambos números: "3100mm*1524mm".
    const m = area.match(/(\d[\d.]*)\s*(?:mm)?\s*[*x×]\s*(\d[\d.]*)/i);
    if (m) return `${Math.round(parseFloat(m[1]))} × ${Math.round(parseFloat(m[2]))} mm`;
    return area.split('/')[0].trim();
  }
  const d = primero(campos, CLAVES_TUBO).replace(/[Φφ]/g, 'Ø').replace(/\s+/g, '');
  const largo = primero(campos, CLAVES_LARGO).replace(/\s+/g, '');
  if (d && largo) return `${d} · ${largo}`;
  return d || largo || '';
}

(async () => {
  const productos = new Map();
  const imagenes = new Map();

  for (const [slug, tipo, tipoTxt] of CATEGORIAS) {
    let html;
    try { html = await bajar(`${BASE}/es/products/${slug}`); }
    catch (e) { console.log(`! categoría ${slug}: ${e.message}`); continue; }

    const enlaces = [...html.matchAll(/\/es\/product\/([a-z0-9\-]+)\.html/g)]
      .map((m) => ({ ruta: m[0], slug: m[1], pos: m.index }));
    const imgs = [...html.matchAll(/\/\/static\.hsglasercnc\.com\/img\/products\/[a-z0-9_\-]+\.webp/g)]
      .map((m) => ({ url: 'https:' + m[0], pos: m.index }));

    for (const e of enlaces) {
      if (!productos.has(e.ruta)) productos.set(e.ruta, { slug: e.slug, tipo, tipoTxt });
      if (imagenes.has(e.ruta)) continue;

      // La foto de cada tarjeta es la que aparece más cerca del enlace dentro
      // del HTML. Buscarla por nombre no sirve: HSG no es consistente y usa
      // sufijos y prefijos sueltos ("t1" para la T2, "eur2pro" para la R2 PRO).
      let mejor = null, dist = Infinity;
      for (const i of imgs) {
        const d = Math.abs(i.pos - e.pos);
        if (d < dist) { dist = d; mejor = i.url; }
      }
      if (mejor && dist < 4000) imagenes.set(e.ruta, mejor);
    }
  }

  for (const s of SUELTOS) {
    if (!productos.has(s.ruta)) {
      productos.set(s.ruta, { slug: s.ruta.match(/\/([a-z0-9\-]+)\.html/)[1], tipo: s.tipo, tipoTxt: s.tipoTxt });
      imagenes.set(s.ruta, s.imagen);
    }
  }

  fs.mkdirSync(DIR_FOTOS, { recursive: true });
  const presets = [];

  for (const [ruta, info] of productos) {
    let html;
    try { html = await bajar(BASE + ruta); }
    catch (e) { console.log(`! ${info.slug}: ${e.message}`); continue; }

    // HSG antepone el tipo de máquina al nombre de la serie en la URL.
    const serie = info.slug
      .replace(/^(laser-cutting-machine|laser-welding-machine|welding-machine|bending-machine|automation-equipment)-/, '')
      .toUpperCase();
    const id = serie.toLowerCase().replace(/[^a-z0-9]/g, '');

    const modelos = extraerParametros(html);
    if (!modelos.length) { console.log(`${serie.padEnd(8)} sin especificaciones, se omite`); continue; }

    const urlFoto = imagenes.get(ruta);
    if (!urlFoto) { console.log(`${serie.padEnd(8)} sin foto, se omite`); continue; }

    const archivo = `${id}.webp`;
    try {
      fs.writeFileSync(path.join(DIR_FOTOS, archivo), await bajar(urlFoto, true));
    } catch (e) {
      console.log(`${serie.padEnd(8)} error bajando la foto: ${e.message}`);
      continue;
    }

    const h1 = limpiar((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [, ''])[1]);
    const lema = limpiar((html.match(/<h1[^>]*>[\s\S]{0,600}?<p[^>]*>([\s\S]*?)<\/p>/) || [, ''])[1]);

    const variantes = modelos.map((m) => {
      const specs = {};
      for (const [k, v] of Object.entries(m.campos)) {
        // El modelo y la potencia ya viajan en el nombre de la máquina.
        if (/^Model|^Potencia|^Poder$|^Potenza/i.test(k)) continue;
        specs[k] = v;
      }
      // Etiqueta de la variante: el área o el diámetro cuando existen; para las
      // plegadoras, el modelo con su tonelaje, que es lo que las distingue.
      const med = medida(m.campos);
      const fuerza = primero(m.campos, CLAVES_FUERZA);
      return {
        modelo: m.modelo,
        medida: med || (fuerza ? m.modelo + ' · ' + fuerza : ''),
        potencias: potencias(primero(m.campos, CLAVES_POT)),
        specs
      };
    });

    // No se exige potencia: las plegadoras se miden en toneladas y algunas
    // soldadoras vienen con una sola potencia fija.
    presets.push({
      id, serie,
      tipo: info.tipo,
      tipoTxt: info.tipoTxt,
      lema: pulirLema(lema || h1),
      foto: 'catalogo/' + archivo,
      url: BASE + ruta,
      variantes
    });
    const conPot = variantes.some((v) => v.potencias.length);
    console.log(
      `${serie.padEnd(8)} ${String(variantes.length).padStart(2)} variantes  ` +
      `${(conPot ? 'con potencia' : 'sin potencia').padEnd(13)}${info.tipoTxt}`
    );
  }

  const cabecera = `/* ═══════════════════════════════════════════════════════════════
   presets.js — carga rápida de máquinas HSG
   GENERADO AUTOMÁTICAMENTE. No editar a mano.
   Regenerar con:  node tools/actualizar-catalogo.js
   Fuente: catálogo oficial de HSG Laser (nuestro proveedor).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const PRESETS = `;

  fs.writeFileSync(path.join(RAIZ, 'presets.js'), cabecera + JSON.stringify(presets, null, 2) + ';\n');

  const variantes = presets.reduce((s, p) => s + p.variantes.length, 0);
  const combos = presets.reduce((s, p) => s + p.variantes.reduce((a, v) => a + v.potencias.length, 0), 0);
  console.log(`\n→ presets.js — ${presets.length} series · ${variantes} medidas · ${combos} combinaciones`);
  console.log('→ catalogo/ — ' + fs.readdirSync(DIR_FOTOS).length + ' fotos');
  console.log('\nAcordate de subir VERSION en firebase-messaging-sw.js para que se');
  console.log('refresque el caché de los usuarios.');
})();
