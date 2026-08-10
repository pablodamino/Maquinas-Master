/* ═══════════════════════════════════════════════════════════════
   presets-extra.js — máquinas cargadas a mano

   Este archivo se edita a mano y NUNCA lo pisa
   tools/actualizar-catalogo.js. Es el lugar para las máquinas que no
   están publicadas en la web del proveedor: versiones sin cabina,
   modelos discontinuados que se siguen vendiendo, equipos de otras
   marcas, etc.

   Aparecen primero en la carga rápida, antes que el catálogo web.

   Estructura de cada entrada:
     id        identificador único, en minúsculas y sin espacios
     serie     nombre corto que se muestra en la tarjeta
     tipo      chapa | tubo | chapa-tubo | plegado | soldadura | automatizacion
     tipoTxt   texto que se muestra debajo del nombre
     lema      una línea descriptiva
     foto      ruta a una imagen del repo, o null si no hay
     variantes cada medida disponible, con sus potencias en watts
                 (dejar potencias en [] si la máquina no se mide en watts)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const PRESETS_EXTRA = [
  {
    id: 'gc',
    serie: 'GC',
    tipo: 'chapa',
    tipoTxt: 'Corte de chapa',
    lema: 'Versión sin cabina. El modelo más vendido de HSG. No figura en el catálogo web del fabricante.',
    foto: null,
    url: '',
    variantes: [
      {
        modelo: 'GC 3015',
        medida: '3000 × 1500 mm',
        potencias: [1500, 3000, 6000, 12000],
        specs: {
          'Área de trabajo (L*W)': '3000mm*1500mm',
          'Cabina': 'Sin cabina'
        }
      },
      {
        modelo: 'GC 6015',
        medida: '6000 × 1500 mm',
        potencias: [1500, 3000, 6000, 12000],
        specs: {
          'Área de trabajo (L*W)': '6000mm*1500mm',
          'Cabina': 'Sin cabina'
        }
      },
      {
        modelo: 'GC 6025',
        medida: '6000 × 2500 mm',
        potencias: [1500, 3000, 6000, 12000],
        specs: {
          'Área de trabajo (L*W)': '6000mm*2500mm',
          'Cabina': 'Sin cabina'
        }
      }
    ]
  }
];
