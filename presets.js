/* ═══════════════════════════════════════════════════════════════
   presets.js — carga rápida de máquinas HSG
   GENERADO AUTOMÁTICAMENTE. No editar a mano.
   Regenerar con:  node tools/actualizar-catalogo.js
   Fuente: catálogo oficial de HSG Laser (nuestro proveedor).
   ═══════════════════════════════════════════════════════════════ */
'use strict';

const PRESETS = [
  {
    "id": "gt",
    "serie": "GT",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "Ofrece un corte instantáneo de alta velocidad con un rendimiento constante y estable. Aumenta enormemente la producción",
    "foto": "catalogo/gt.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-gt.html",
    "variantes": [
      {
        "modelo": "G3015T",
        "medida": "3100 × 1524 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000
        ],
        "specs": {
          "Formato de procesamiento": "3100mm*1524mm",
          "Max. Aceleración": "2.0G",
          "Filtro paso bajo": "8Hz",
          "Velocidad máxima de enlace": "200m/min"
        }
      },
      {
        "modelo": "G4020T",
        "medida": "4064 × 2040 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000
        ],
        "specs": {
          "Formato de procesamiento": "4064mm*2040mm",
          "Max. Aceleración": "2.0G",
          "Filtro paso bajo": "8Hz",
          "Velocidad máxima de enlace": "200m/min"
        }
      },
      {
        "modelo": "G6025T",
        "medida": "6100 × 2540 mm",
        "potencias": [
          6000,
          8000,
          12000
        ],
        "specs": {
          "Formato de procesamiento": "6100mm*2540mm",
          "Max. Aceleración": "2.0G",
          "Filtro paso bajo": "8Hz",
          "Velocidad máxima de enlace": "200m/min"
        }
      }
    ]
  },
  {
    "id": "gh",
    "serie": "GH",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "La nueva Serie GH está diseñada para superar a las competencias, con una aceleración ultra rápida y una capacidad de pot",
    "foto": "catalogo/gh.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-gh.html",
    "variantes": [
      {
        "modelo": "G3015H",
        "medida": "3100 × 1550 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000,
          25000,
          30000
        ],
        "specs": {
          "Área de corte (Largo × Ancho)": "3100mm*1550mm",
          "Aceleración Máxima": "4G",
          "Velocidad de enlace máxima": "200m/min"
        }
      },
      {
        "modelo": "G4020H",
        "medida": "4100 × 2050 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000,
          25000,
          30000,
          40000,
          60000
        ],
        "specs": {
          "Área de corte (Largo × Ancho)": "4100mm*2050mm",
          "Aceleración Máxima": "2.8G",
          "Velocidad de enlace máxima": "200m/min"
        }
      },
      {
        "modelo": "G6025H",
        "medida": "6200 × 2550 mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000,
          25000,
          30000,
          40000,
          60000
        ],
        "specs": {
          "Área de corte (Largo × Ancho)": "6200mm*2550mm",
          "Aceleración Máxima": "2.8G",
          "Velocidad de enlace máxima": "200m/min"
        }
      }
    ]
  },
  {
    "id": "gx",
    "serie": "GX",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "La serie GX está afinada por el Centro Global de I + D de HSG en Kanagawa, Tokio. Este centro lidera los avances pionero",
    "foto": "catalogo/gx.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-gx.html",
    "variantes": [
      {
        "modelo": "G3015X",
        "medida": "3048 × 1524 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Área de trabajo (L*W)": "3048mm*1524mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      },
      {
        "modelo": "G4020X",
        "medida": "4064 × 2040 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Área de trabajo (L*W)": "4064mm*2040mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      },
      {
        "modelo": "G6025X",
        "medida": "6096 × 2540 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Área de trabajo (L*W)": "6096mm*2540mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      },
      {
        "modelo": "G12025X",
        "medida": "12500 × 2540 mm",
        "potencias": [
          12000,
          15000,
          20000,
          25000,
          30000
        ],
        "specs": {
          "Área de trabajo (L*W)": "12500mm*2540mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      }
    ]
  },
  {
    "id": "gf",
    "serie": "GF",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "La base de la máquina está compuesta por varias secciones modulares, lo que permite configurar de forma flexible tanto l",
    "foto": "catalogo/gf.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-gf.html",
    "variantes": [
      {
        "modelo": "G13035FA",
        "medida": "13000 × 3500 mm",
        "potencias": [
          12000,
          15000,
          20000,
          25000,
          30000,
          40000,
          60000
        ],
        "specs": {
          "Área de trabajo (L*W)": "13000*3500mm",
          "Precisión de posicionamiento": "±0.05mm/m"
        }
      },
      {
        "modelo": "G26035FA",
        "medida": "26000 × 3500 mm",
        "potencias": [
          12000,
          15000,
          20000,
          25000,
          30000,
          40000,
          60000
        ],
        "specs": {
          "Área de trabajo (L*W)": "26000*3500mm",
          "Precisión de posicionamiento": "±0.05mm/m"
        }
      }
    ]
  },
  {
    "id": "x",
    "serie": "X",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "La nueva Serie X presenta una estructura compacta y todo en uno,ocupando menos espacio e requeriendo instalación más fác",
    "foto": "catalogo/x.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-x.html",
    "variantes": [
      {
        "modelo": "X3015",
        "medida": "3048 × 1524 mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000
        ],
        "specs": {
          "Area di lavoro": "3048*1524mm / 3000*1500mm(12000W)",
          "Precisione di Posizionamento": "±0.03mm/m"
        }
      }
    ]
  },
  {
    "id": "gl",
    "serie": "GL",
    "tipo": "chapa",
    "tipoTxt": "Corte de chapa",
    "lema": "La serie GL integra cuatro funciones: desenrollado, alimentación, corte y descarga. Es una evolución: de un simple corte",
    "foto": "catalogo/gl.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-gl.html",
    "variantes": [
      {
        "modelo": "G3015LA30",
        "medida": "3000 × 1500 mm",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Área de trabajo (L*W)": "3000*1500mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      },
      {
        "modelo": "G4015LA40",
        "medida": "4000 × 1500 mm",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Área de trabajo (L*W)": "4000*1500mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      },
      {
        "modelo": "G6020LA60",
        "medida": "6000 × 2000 mm",
        "potencias": [
          1500,
          2000,
          3000,
          4000,
          6000
        ],
        "specs": {
          "Área de trabajo (L*W)": "6000*2000mm",
          "Precisión de posicionamiento": "±0.03mm/m"
        }
      }
    ]
  },
  {
    "id": "ts2",
    "serie": "TS2",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "La velocidad máxima de enlace es de 140 m / min, la aceleración es de 1,4G y la velocidad de rotación del mandril es de",
    "foto": "catalogo/ts2.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-ts2.html",
    "variantes": [
      {
        "modelo": "TS2",
        "medida": "Ø12-Ø273mm · 1m-6.5m",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Capacidad De Corte De Tubo Redondo": "Φ12-Φ273mm",
          "Capacidad De Corte De Tubo Cuadrado": "□12*12-□220*220mm",
          "Rango de longitud del tubo": "1m-6.5m",
          "Rango de longitud de descarga": "3m / 4.5m",
          "Peso de un solo tubo": "1.4G",
          "Aceleración": "300kg"
        }
      },
      {
        "modelo": "TS2-90",
        "medida": "Ø12-Ø273mm · 1m-9.2m",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Capacidad De Corte De Tubo Redondo": "Φ12-Φ273mm",
          "Capacidad De Corte De Tubo Cuadrado": "□12*12-□220*220mm",
          "Rango de longitud del tubo": "1m-9.2m",
          "Rango de longitud de descarga": "4.5m / 6.5m",
          "Peso de un solo tubo": "1.4G",
          "Aceleración": "300kg"
        }
      }
    ]
  },
  {
    "id": "tx",
    "serie": "TX",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "Diseñada para procesar tubos de hasta 360 mm (TX3) / 510 mm (TX5) de diámetro y con un peso de hasta 1200 kg (TX3) / 200",
    "foto": "catalogo/tx.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-tx.html",
    "variantes": [
      {
        "modelo": "TX3R",
        "medida": "Ø40-Ø350mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ40-Φ350mm",
          "Procesamiento de tubo cuadrado Dim": "□40*40-□350*350mm",
          "Max. Peso de un solo tubo cargado": "1200kg"
        }
      },
      {
        "modelo": "TX5R",
        "medida": "Ø50-Ø510mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ50-Φ510mm",
          "Procesamiento de tubo cuadrado Dim": "□50*50-□500*500mm",
          "Max. Peso de un solo tubo cargado": "2000kg"
        }
      }
    ]
  },
  {
    "id": "tl",
    "serie": "TL",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "HSG Laser lanzó la primera generación de la máquina cortadora láser de tubo de alta resistencia HSG de cuatro mandriles,",
    "foto": "catalogo/tl.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-tl.html",
    "variantes": [
      {
        "modelo": "TL660",
        "medida": "Ø80-Ø660mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.1mm/m",
          "Procesamiento de tubo redondo Dim": "Φ80-Φ660mm",
          "Procesamiento de tubo cuadrado Dim": "□80*80-□450*450mm",
          "Max. Peso de un solo tubo cargado": "3000kg"
        }
      }
    ]
  },
  {
    "id": "tl3pro",
    "serie": "TL3PRO",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "Desde tubos pequeños hasta tubos resistentes, el TL3 Pro se encarga de todo.",
    "foto": "catalogo/tl3pro.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-tl3pro.html",
    "variantes": [
      {
        "modelo": "TL3 PRO",
        "medida": "Ø20-Ø360mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Capacidad de corte de tubos redondos": "Φ20-Φ360mm",
          "Capacidad de corte de tubos cuadrados": "□20*20-□360*360mm",
          "Peso del tubo único": "1600kg",
          "Velocidad de interpolación máx.": "100m/min",
          "Aceleración máxima": "1.0G",
          "Corte en bisel": "Opcional",
          "4+1 mandriles gemelos": "Estándar"
        }
      },
      {
        "modelo": "TL3",
        "medida": "Ø40-Ø360mm",
        "potencias": [
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Capacidad de corte de tubos redondos": "Φ40-Φ360mm",
          "Capacidad de corte de tubos cuadrados": "□40*40-□360*360mm",
          "Peso del tubo único": "1600kg",
          "Velocidad de interpolación máx.": "80m/min",
          "Aceleración máxima": "0.8G",
          "Corte en bisel": "Opcional",
          "4+1 mandriles gemelos": "×"
        }
      }
    ]
  },
  {
    "id": "r1",
    "serie": "R1",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "Diámetro mínimo para tubo redondo: 8 mm Longitud mínima del borde del tubo cuadrado: 8 mm",
    "foto": "catalogo/r1.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-r1.html",
    "variantes": [
      {
        "modelo": "R1",
        "medida": "Ø8-Ø120mm",
        "potencias": [
          1500,
          2000,
          3000,
          4000,
          6000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ8-Φ120mm",
          "Procesamiento de tubo cuadrado Dim": "□8*8-□120*120mm",
          "Max. Peso de un solo tubo cargado": "≈80kg"
        }
      },
      {
        "modelo": "R1R",
        "medida": "Ø8-Ø120mm",
        "potencias": [
          1500,
          2000,
          3000,
          4000,
          6000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ8-Φ120mm",
          "Procesamiento de tubo cuadrado Dim": "□8*8-□120*120mm",
          "Max. Peso de un solo tubo cargado": "≈80kg"
        }
      }
    ]
  },
  {
    "id": "r2pro",
    "serie": "R2PRO",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "Este sistema, impulsado por una velocidad de mandril de 140 r/min, una velocidad de enlace de 150 m/min y una aceleració",
    "foto": "catalogo/r2pro.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-r2pro.html",
    "variantes": [
      {
        "modelo": "R2 PRO",
        "medida": "Ø12-240mm · 1000-6500mm",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Capacidad de corte de tubos redondos": "φ12-240mm",
          "Capacidad de corte de tubos cuadrados": "□12×12- □240×240mm",
          "Capacidad de corte de tubos rectangulares": "12-240mm",
          "Filtro pasa bajas": "7 Hz",
          "Max. Aceleración": "1.5G",
          "Velocidad de enlace máxima": "150m/min",
          "Velocidad de rotación máxima": "140r/min",
          "El rango de material de tubo": "1000-6500mm"
        }
      },
      {
        "modelo": "R2-90 PRO",
        "medida": "Ø12-240mm · 1000-9000mm",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Capacidad de corte de tubos redondos": "φ12-240mm",
          "Capacidad de corte de tubos cuadrados": "□12×12- □240×240mm",
          "Capacidad de corte de tubos rectangulares": "12-240mm",
          "Filtro pasa bajas": "7 Hz",
          "Max. Aceleración": "1.5G",
          "Velocidad de enlace máxima": "150m/min",
          "Velocidad de rotación máxima": "140r/min",
          "El rango de material de tubo": "1000-9000mm"
        }
      }
    ]
  },
  {
    "id": "r2",
    "serie": "R2",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "R2 adopta una estructura de armadura triangular, lo que hace que la máquina entera sea más pesada y más rígida, lo que g",
    "foto": "catalogo/r2.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-r2.html",
    "variantes": [
      {
        "modelo": "R2",
        "medida": "Ø12-Ø240mm",
        "potencias": [
          3000,
          4000,
          6000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ12-Φ240mm",
          "Procesamiento de tubo cuadrado Dim": "□12*12-□240*240mm",
          "Max. Peso de un solo tubo cargado": "300kg"
        }
      }
    ]
  },
  {
    "id": "r3",
    "serie": "R3",
    "tipo": "tubo",
    "tipoTxt": "Corte de tubo",
    "lema": "Con los mandriles de carrera completa HSG, los tubos se pueden fabricar en todo el rango de sujeción de 40 mm a 360 mm s",
    "foto": "catalogo/r3.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-r3.html",
    "variantes": [
      {
        "modelo": "R3R",
        "medida": "Ø40-Ø360mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.03mm/m",
          "Procesamiento de tubo redondo Dim": "Φ40-Φ360mm",
          "Procesamiento de tubo cuadrado Dim": "□40*40-□360*360mm",
          "Max. Peso de un solo tubo cargado": "≈600kg"
        }
      },
      {
        "modelo": "R3R-120",
        "medida": "Ø40-Ø360mm",
        "potencias": [
          3000,
          4000,
          6000,
          8000,
          12000,
          15000,
          20000
        ],
        "specs": {
          "Precisión de posicionamiento": "±0.05mm/m",
          "Procesamiento de tubo redondo Dim": "Φ40-Φ360mm",
          "Procesamiento de tubo cuadrado Dim": "□40*40-□360*360mm",
          "Max. Peso de un solo tubo cargado": "1200kg"
        }
      }
    ]
  },
  {
    "id": "cb",
    "serie": "CB",
    "tipo": "chapa-tubo",
    "tipoTxt": "Corte de chapa y tubo",
    "lema": "Diseño integrado, una máquina integra la función de corte de tubos y láminas, ahorrando costos de adquisición de equipos",
    "foto": "catalogo/cb.webp",
    "url": "https://www.hsglaser.com/es/product/laser-cutting-machine-cb.html",
    "variantes": [
      {
        "modelo": "C3015B",
        "medida": "3048 × 1524 mm",
        "potencias": [
          1500,
          2000,
          3000,
          4000,
          6000
        ],
        "specs": {
          "Área de trabajo (L*W)": "3048mm*1524mm",
          "Max. Velocidad de enlace": "100m/min",
          "Procesamiento de tubo redondo Dim": "Φ20-Φ240mm",
          "Procesamiento de tubo cuadrado Dim": "□20*20-□240*240mm"
        }
      }
    ]
  }
];
