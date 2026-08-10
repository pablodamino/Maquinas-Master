# Stock de Máquinas — Pantógrafos Master

App web PWA para que los vendedores vean el inventario de maquinaria en tiempo real, registren ventas y reciban avisos cuando el stock cambia.

**URL:** https://pablodamino.github.io/Maquinas-Master/
**Repo:** https://github.com/pablodamino/Maquinas-Master

---

## Ciclo de vida de una máquina

```
[Alta] → PEDIDO → EMBARCADO → ENTREGA INMEDIATA → VENDIDA E INSTALADA
```

| Estado | Qué significa | Quién lo mueve |
|---|---|---|
| `pedido` | OC confirmada, esperando embarque | — |
| `embarcado` | En tránsito hacia la planta | admin |
| `entrega_inmediata` | En planta, lista para vender | admin |
| `vendida_instalada` | Entregada e instalada. Histórico. | admin |

**Reservar una venta** es independiente del estado logístico: cualquier vendedor puede
poner `cliente` en una máquina en cualquier estado en curso, y también liberarla.
Solo el admin cierra el circuito pasándola a `vendida_instalada`.

---

## Notificaciones — tres capas

Están diseñadas para funcionar **sin backend**. Las dos primeras capas no necesitan
Cloud Functions, ni plan Blaze, ni FCM.

| Capa | Qué hace | Requiere |
|---|---|---|
| **1 · Bandeja** | Feed en tiempo real en la campana 🔔, con badge de no leídas. | Nada. Solo Firestore. |
| **2 · Aviso del sistema** | Notificación del celular cuando la app está abierta pero no en foco. | Permiso de notificaciones. |
| **3 · Push con la app cerrada** | Aviso con el celular bloqueado y la app cerrada. | FCM + Cloud Function (plan Blaze). |

Si la capa 3 no está desplegada, la app **no la promete**: el panel de la campana
muestra el estado real del permiso y qué se puede esperar.

### Por qué antes no funcionaban

Cinco fallas encadenadas, cualquiera de ellas suficiente para romper todo:

1. `firebase.messaging()` se llamaba sin guardia en el nivel superior de
   `firebase-config.js`. En navegadores sin FCM (Safari iOS sin instalar, navegador
   interno de WhatsApp) lanzaba excepción y se llevaba puesto el resto del archivo,
   incluido `storage`. Hoy está detrás de `isSupported()` y carga perezosa.
2. El permiso se pedía desde `onAuthStateChanged`, sin gesto del usuario. iOS lo
   rechaza siempre y Chrome lo degrada a la UI silenciosa. Hoy se pide desde un botón.
3. La regla de creación de `vendors` exigía `isAdmin()`, que leía el documento que
   todavía no existía. El alta de perfil se denegaba siempre y, en consecuencia,
   **el token FCM nunca se guardaba**. Hoy cada usuario puede crear su propio perfil
   con rol `vendedor`, y el token se guarda con `set({merge:true})` en vez de `update()`.
4. Todo dependía de una Cloud Function que quizá nunca se desplegó.
5. La campana solo reseteaba un contador en memoria; no había bandeja ni historial.

---

## Automatizaciones

| Función | Cómo funciona | Archivo |
|---|---|---|
| **Carga rápida** | Catálogo del proveedor precargado: serie → medida → potencia, y la máquina queda cargada con foto y características sin escribir nada. | `presets.js`, `catalog.js` |
| **Compartir ficha** | Compone la ficha en un `<canvas>` (1080×1350) y la manda por Web Share API → WhatsApp. Cascada de respaldos: imagen → texto → descarga → portapapeles. | `share.js` |
| **Alta por voz** | `SpeechRecognition` en `es-AR`. Entiende modelo, características y estado ("compresor 500 litros, ya llegó"). Prellena y el usuario confirma. | `voice.js` |
| **Foto automática** | Cada modelo cargado con foto queda en la colección `catalog`. Al escribir o dictar un modelo parecido, se completan foto y características solas. | `catalog.js` |
| **Compresión de fotos** | Redimensiona a 1600 px y exporta JPEG 0.82 en el celular, antes de subir. Resuelve la orientación EXIF. | `firebase-config.js` |
| **Búsqueda y filtros** | Sobre los datos ya cargados. Cero lecturas extra a Firestore. | `app.js` |
| **Offline** | Service Worker + persistencia de Firestore. Abre y muestra el stock sin señal. | `firebase-messaging-sw.js` |

---

## Arquitectura del frontend

Sin build tools: HTML, CSS y JavaScript plano cargado con `<script>` en orden.

| Archivo | Rol |
|---|---|
| `index.html` | Estructura, sprite de íconos SVG, tema aplicado antes del primer pintado |
| `styles.css` | Sistema de diseño con tokens. Oscuro y claro, por sistema o manual |
| `firebase-config.js` | Init de Firebase, Service Worker, permisos, tokens, compresión y subida |
| `ui.js` | Reconciliador keyed, animaciones FLIP, toasts, hojas, render de tarjetas |
| `catalog.js` | Memoria de modelos y coincidencia difusa |
| `share.js` | Composición de la ficha y Web Share |
| `voice.js` | Dictado y parser |
| `notifications.js` | Las tres capas, la bandeja y el estado de permisos |
| `app.js` | Orquestador: auth, listeners, mutaciones, filtros, tema, instalación |
| `firebase-messaging-sw.js` | Un solo Service Worker: push **y** caché offline |

### El reconciliador

Antes, cada `onSnapshot` hacía `innerHTML = …` sobre la grilla entera: destruía el
DOM, perdía el scroll y el foco, y mataba cualquier animación. Ahora `reconciliar()`
identifica cada tarjeta por el id de la máquina y solo parchea lo que cambió, con dos
firmas separadas (media y cuerpo) para no recargar la foto si no cambió.
`reconciliarFlip()` además anima el desplazamiento de las tarjetas que se mueven.

---

## Colecciones de Firestore

| Colección | Contenido | Quién escribe |
|---|---|---|
| `machines` | El stock | admin (todo), vendedor (solo campos de venta) |
| `vendors` | Perfiles, tokens FCM, marca de última lectura | cada uno lo suyo; admin todo |
| `activity` | Feed de novedades — alimenta las notificaciones | cualquier vendedor, solo en nombre propio |
| `catalog` | Memoria de modelos: foto y características | cualquier vendedor |
| `notifications` | Historial de la Cloud Function, si está desplegada | solo Admin SDK |

---

## Deploy

**Frontend** — automático al hacer push a `main`; GitHub Actions publica en ~2 minutos.

```
git push origin main
```

**Reglas de Firestore** — NO se despliegan solas. Hay que correrlo a mano una vez:

```
firebase deploy --only firestore:rules
```

Sin esto, la bandeja de novedades y el catálogo no tienen permiso de escritura.

**Cloud Functions** (opcional, solo para la capa 3):

```
firebase deploy --only functions
```

---

## Crear un vendedor nuevo

1. Firebase Console → Authentication → Add user → email y contraseña.
2. Listo. La primera vez que entre, la app le crea sola el perfil en `vendors`
   con rol `vendedor`.
3. Para hacerlo admin: Firestore → `vendors` → su documento → `rol` = `admin`.

---

## Carga rápida — el catálogo del proveedor

`presets.js` trae las 15 series de HSG con sus 31 medidas y 167 combinaciones de
medida y potencia, más la foto de cada máquina en `catalogo/`. Con eso, cargar una
máquina son tres toques y cero escritura.

Las potencias del sitio vienen como rangos (`3000W-20000W`); el generador las
traduce a los escalones comerciales concretos que entran en ese rango.

Las fotos se guardan en el repo en vez de enlazarse a HSG: no dependen de que el
proveedor no cambie sus URLs, y al ser del mismo origen la ficha compartible puede
dibujarlas en el canvas sin necesidad de configurar CORS.

**Para actualizar cuando HSG cambie su línea de productos:**

```
node tools/actualizar-catalogo.js
```

Vuelve a bajar las fotos y reescribe `presets.js`. No tiene dependencias: solo
Node 18 o superior. Después subí `VERSION` en `firebase-messaging-sw.js` para que
se refresque el caché de los usuarios.

Las series sin cuadro de especificaciones o sin foto en el sitio se omiten solas y
quedan avisadas en la salida del comando.

### Máquinas que no están en la web del proveedor

`presets-extra.js` es un archivo que se edita **a mano** y que el generador
**nunca pisa**. Es el lugar para lo que HSG no publica: versiones sin cabina,
modelos discontinuados que se siguen vendiendo, o equipos de otras marcas.

Aparecen primero en la lista, antes del catálogo web. El archivo tiene la
estructura documentada arriba de todo.

Ahí está cargada la **GC**, la versión sin cabina —según el vendedor, la más
vendida— en 3000×1500, 6000×1500 y 6000×2500, con 1,5 / 3 / 6 / 12 kW.

Una máquina puede tener `foto: null` si no hay imagen disponible: la app muestra
una portada generada y le avisa al vendedor que le saque una foto.

El código de la GC es **G + medida de mesa + C** (`G3015C`, `G6015C`, `G6025C`),
la misma convención que usa HSG en el resto de sus series. Confirmado por el
vendedor.

## Cosas para saber

**Versionado de assets.** Lo maneja el Service Worker con la constante `VERSION` en
`firebase-messaging-sw.js`. Al cambiar archivos, subir esa versión — reemplaza al
viejo `?v=X` manual de cada `<script>`.

**Foto en la ficha compartida.** El canvas necesita CORS en el bucket de Storage.
Si no está configurado, la ficha se arma igual con una portada generada. Para tener
la foto real en la ficha, una sola vez:

```
# cors.json → [{"origin":["https://pablodamino.github.io"],"method":["GET"],"maxAgeSeconds":3600}]
gsutil cors set cors.json gs://maquinas-master.firebasestorage.app
```

**Dictado por voz.** Solo Chrome (Android y escritorio) y solo por HTTPS. En
navegadores sin soporte el botón se oculta solo.

**Notificaciones en iPhone.** Solo funcionan con la app agregada a la pantalla de
inicio, desde iOS 16.4. La app lo detecta y muestra las instrucciones.

**Probar en local:**

```
npx --yes serve .
```

Todas las rutas son relativas, así que funciona en cualquier subcarpeta.
