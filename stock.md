# Stock de Maquinas — Pantógrafos Master

## Qué es este proyecto

App web PWA (Progressive Web App) para que los vendedores de Pantógrafos Master vean en tiempo real el inventario de maquinaria pesada y reciban notificaciones push en sus celulares Android cada vez que el stock cambia.

**URL:** https://pablodamino.github.io/Maquinas-Master/
**Repo:** https://github.com/pablodamino/Maquinas-Master

---

## Objetivo

Eliminar el caos de información sobre qué máquinas hay disponibles. Antes, un vendedor podía ofrecer una máquina que ya estaba vendida o no saber que llegó una nueva. Ahora todos ven lo mismo en tiempo real y se notifican automáticamente.

---

## Ciclo de vida de una máquina

```
[Admin agrega] → PEDIDO → EMBARCADO → ENTREGA INMEDIATA → VENDIDA E INSTALADA
```

| Estado | Descripción | Contador |
|--------|-------------|----------|
| `pedido` | OC confirmada, esperando embarque | Días desde la OC |
| `embarcado` | En tránsito hacia la planta | Días desde la OC |
| `entrega_inmediata` | En planta, lista para vender | — |
| `vendida_instalada` | Vendida e instalada en cliente | — (historial) |

- **Cualquier vendedor** puede registrar una venta en estado `pedido`, `embarcado` o `entrega_inmediata`
- **Solo admin** puede mover entre estados logísticos (pedido → embarcado → entrega_inmediata)
- Una vez `vendida_instalada`, la máquina es histórico: no se puede modificar

---

## Datos de cada máquina

- `modelo` — nombre/modelo del equipo (texto libre)
- `caracteristicas` — descripción técnica del equipo
- `imagen_url` — foto del equipo (Firebase Storage)
- `estado` — ver ciclo de vida
- `fecha_oc` — fecha de confirmación de la orden de compra
- `fecha_embarque` / `fecha_llegada` / `fecha_venta` — timestamps de cada transición
- `cliente` / `vendido_por` / `notas` — datos al momento de la venta

---

## Roles

| Rol | Puede hacer |
|-----|-------------|
| `admin` | Agregar máquinas, cambiar estado logístico, editar datos, registrar ventas |
| `vendedor` | Ver stock, registrar ventas |

---

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Hosting | GitHub Pages (gratis, 24/7) |
| Base de datos | Firebase Firestore (tiempo real) |
| Autenticación | Firebase Auth (email/password) |
| Push notifications | Firebase FCM + Service Worker |
| Notif. trigger | Firebase Cloud Functions (Blaze, ~$0/mes) |
| Imágenes | Firebase Storage |
| Frontend | HTML + CSS + Vanilla JS (sin build tools) |

---

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `index.html` | Estructura completa de la app (single page) |
| `app.js` | Toda la lógica: auth, listeners, render, modales |
| `firebase-config.js` | Init Firebase + upload imágenes + FCM tokens |
| `firebase-messaging-sw.js` | Service Worker para push en background |
| `styles.css` | Diseño completo (tema Pantógrafos Master) |
| `functions/index.js` | Cloud Function: detecta cambios → manda push a todos |
| `firestore.rules` | Reglas de seguridad por rol |
| `storage.rules` | Reglas de Firebase Storage |
| `.github/workflows/deploy.yml` | CI/CD: push a main → deploy automático a GitHub Pages |

---

## Firebase — IDs del proyecto

- **Project ID:** `maquinas-master`
- **Storage bucket:** `maquinas-master.firebasestorage.app`
- **Region Functions:** `us-central1`
- **Auth provider:** Email/Password

---

## Cómo deployar cambios

**Frontend** (automático):
```
git add . && git commit -m "descripción" && git push origin main
# GitHub Actions despliega en ~2 minutos
```

**Cloud Functions / Firestore Rules** (manual, desde la carpeta del proyecto):
```
firebase deploy --only functions
firebase deploy --only firestore:rules
firebase deploy --only storage
```

---

## Crear un vendedor nuevo

1. Firebase Console → Authentication → Add user → email + contraseña
2. Copiar el UID generado
3. Firestore → colección `vendors` → nuevo documento con ID = UID
4. Campos: `nombre` (string), `email` (string), `rol` = `vendedor`, `fcm_tokens` (array vacío)

---

## Push notifications en Android

Cada vendedor abre la app en Chrome Android → "Agregar a pantalla de inicio" → abre la PWA → acepta el permiso de notificaciones → recibe push aunque el celular esté bloqueado.

La Cloud Function `notificarCambioMaquina` se dispara en cada escritura en la colección `machines` y manda FCM a todos los tokens registrados.

---

## Problemas conocidos y soluciones

| Problema | Causa | Solución |
|----------|-------|----------|
| "Cargando..." pegado | Índice Firestore no construido | Queries ordenan client-side (sin orderBy) |
| Caché browser sirve JS viejo | Browser caché | Versión en los scripts `?v=X` — incrementar en cada deploy importante |
| FAB + no aparece | `rol` en Firestore no es `admin` | Verificar en Firestore que `rol: "admin"` (minúsculas) |
| Error deploy Functions | APIs Google Cloud habilitándose | Esperar 3 min y volver a `firebase deploy --only functions` |
