# ARCHITECTURE — Mi Bodega Digital (App móvil)

> Documento vivo. Fase 0 (auditoría) completada; actualizado al cierre de las fases 1–5.
> Fuente auditada: rama `main`, commit `4e6ff2a` (v5.3).

---

## 1. Resumen de la auditoría

### 1.1 Qué hay en el repositorio

| Ruta | Estado | Relevancia para móvil |
|---|---|---|
| `js/firebase.js` | Firebase JS SDK 11.6.1 por CDN, config del proyecto `bodega-difital` | Base del contrato de backend |
| `js/store.js` | Estado global + **rutas de Firestore** | Contrato de datos (crítico) |
| `js/modules/pos.js` | Búsqueda, carrito, venta, descuento de stock | Lógica de negocio a portar |
| `js/modules/inventory.js` | CRUD de productos | Lógica a portar |
| `js/modules/clients.js` | Clientes, deudas, abonos, saldo | Lógica a portar (con bugs, ver §5) |
| `js/modules/reports.js` | Totales por método, top 5, serie diaria | Lógica a portar (con bugs, ver §5) |
| `js/main.js` | Login email/password, registro, Google (popup), logout | Flujo de auth |
| `js/ui.js` | Render DOM, umbral de stock bajo (≤ 5), pre-llenado de pago | Reglas de UI implícitas |
| `js/theme.js`, `js/clock.js` | Tema claro/oscuro (localStorage), reloj | Cosmético |
| `firestore.rules` | `allow read, write: if request.auth != null` sobre **todo** | Riesgo crítico de seguridad |
| `firestore.indexes.json` | Vacío | Riesgo: la consulta de reportes necesita índice compuesto |
| `functions/` | Plantilla vacía (sin funciones exportadas) + muestra Genkit | No se usa |
| `dataconnect/` | Esquema PostgreSQL de ejemplo (Product/Customer/Sale…) | **No lo usa la app**. Se ignora |
| `js/main.js.backup`, `js/registro_code.js`, `fix-main.ps1` | Restos de desarrollo | No se usan |

La app web **no tiene build ni tests**; se sirve estática por Firebase Hosting.

### 1.2 Flujos de usuario identificados

1. **Auth**: login email/password · registro (contraseña ≥ 6, confirmación) · login Google (popup) · logout · sesión persistente.
2. **POS (Vender)**: lista de productos en tiempo real ordenada por nombre → filtro por texto (contiene, sin distinguir mayúsculas) → `+` agrega 1 unidad → `-` quita 1 unidad → método de pago (Efectivo / Yape/Plin / Fiado) → si es Fiado, cliente obligatorio → registrar venta → limpiar carrito.
3. **Inventario**: lista ordenada por nombre → crear / editar (nombre, precio, stock opcional) → eliminar con confirmación → resaltado si `stock ≤ 5`, rojo si `stock ≤ 0`.
4. **Fiado**: lista de clientes con saldo en vivo → crear / editar cliente (nombre, teléfono) → detalle: historial cronológico, saldo, añadir deuda manual, registrar abono (método de pago), marcar cargo como pagado, eliminar movimiento.
5. **Reportes**: rango de fechas (por defecto hoy) → total ingresos, efectivo, Yape/Plin, fiado → gráfico de ingresos diarios → top 5 productos por unidades. En tiempo real.

---

## 2. Contratos de datos Firestore (existentes — NO se modifican)

Todos los datos de un usuario viven bajo:

```
artifacts/{appId}/users/{uid}/...
appId = "mi-bodega-app"   (constante en js/firebase.js)
uid   = Firebase Auth UID
```

No hay documentos de usuario ni de configuración: solo cuatro subcolecciones.

### 2.1 `productos/{productoId}` (id autogenerado)

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | string | Obligatorio en el formulario |
| `precio` | number | Soles, float (`parseFloat`) |
| `stock` | number \| **null** | `null` = stock no controlado. Puede quedar **negativo** (no hay validación al vender) |

### 2.2 `clientes/{clienteId}`

| Campo | Tipo | Notas |
|---|---|---|
| `nombre` | string | |
| `telefono` | string | Puede ser `""` |

No existe borrado de clientes en la web.

### 2.3 `ventas/{ventaId}`

| Campo | Tipo | Notas |
|---|---|---|
| `items` | array<{ `id`, `nombre`, `precio`, `cantidad` }> | Copia desnormalizada del producto al momento de vender |
| `total` | number | Σ precio × cantidad |
| `metodoDePago` | `"Efectivo"` \| `"Yape/Plin"` \| `"Fiado"` | Literales exactos (con barra) |
| `clienteId` | string \| null | Solo si es Fiado |
| `fecha` | Timestamp | `serverTimestamp()` |

### 2.4 `deudas/{deudaId}` — libro de movimientos de fiado

Una sola colección guarda **cargos** y **abonos**, distinguidos por el signo de `monto`:

| Campo | Cargo (`monto > 0`) | Abono (`monto < 0`) |
|---|---|---|
| `clienteId` | string | string |
| `monto` | number > 0 | number < 0 (`-Math.abs`) |
| `descripcion` | string (≤ 100 chars si viene de venta) | string |
| `fecha` | Timestamp | Timestamp |
| `pagado` | boolean (`false` al crear) | siempre `false` (sin significado) |
| `ventaId` | string (solo si viene del POS) | — |
| `metodoPago` | — | `"Efectivo"` \| `"Yape/Plin"` (nota: **sin** "De", distinto a ventas) |

**Saldo del cliente (regla de la web):**

```
saldo = Σ abonos (negativos)  +  Σ cargos con pagado != true
```

### 2.5 Reglas de negocio implícitas

| ID | Regla | Origen |
|---|---|---|
| RN-01 | Stock bajo si `stock !== null && stock <= 5` | `ui.js` |
| RN-02 | Sin stock si `stock <= 0` (se permite vender igual) | `ui.js`, `pos.js` |
| RN-03 | Vender descuenta `stock` con `increment(-cantidad)` | `pos.js` |
| RN-04 | Venta Fiado ⇒ cliente obligatorio y se crea un cargo con `ventaId` | `pos.js` |
| RN-05 | Descripción del cargo de venta: `"Nombre (xN), …"`, truncada a 97 + `"..."` | `pos.js` |
| RN-06 | Ingresos = ventas Efectivo + ventas Yape/Plin + abonos (por su `metodoPago`). Las ventas Fiado **no** son ingreso; se reportan aparte | `reports.js` |
| RN-07 | Top 5 por unidades vendidas, agrupado por **nombre** (incluye ventas Fiado) | `reports.js` |
| RN-08 | Reporte por rango `[inicio 00:00:00.000, fin 23:59:59.999]`; error si fin < inicio | `reports.js` |
| RN-09 | El pago pre-llena con el cargo pendiente **más antiguo** | `ui.js` |
| RN-10 | Moneda: `S/ 0.00` (2 decimales), locale `es-PE` | `ui.js` |
| RN-11 | Contraseña ≥ 6 caracteres y confirmación igual | `main.js` |

### 2.6 Extensiones **aditivas** que propone la app móvil

Ninguna rompe la web (la web usa `updateDoc`, que hace merge y no borra campos desconocidos).

| Ruta / campo | Uso | Compatibilidad |
|---|---|---|
| `productos.codigoBarras?: string` | Escáner en POS / inventario | La web lo ignora |
| `deudas.deudaOrigenId?: string` en abonos | Trazabilidad del abono | La web lo ignora |
| `deudas.origen?: "movil"` | Auditoría | La web lo ignora |
| `config/negocio` (doc) `{ nombre, ruc?, direccion?, telefono?, diasVencimientoFiado }` | Pantalla de configuración | Ruta nueva bajo el mismo `uid` |
| `ventas/{id}` con id generado en cliente | Idempotencia offline | Mismo esquema |

---

## 3. Arquitectura objetivo (Clean Architecture)

```
┌──────────────────────────────────────────────────────────────────┐
│ presentation/  (React Native, Paper, React Navigation, Zustand)  │
│   screens/ · components/ · navigation/ · theme/ · hooks/         │
│   stores/ (Zustand: carrito, sesión, tema, estado de red)        │
└───────────────▲──────────────────────────────────────────────────┘
                │ usa casos de uso (inyectados por un contenedor simple)
┌───────────────┴──────────────────────────────────────────────────┐
│ domain/  (TypeScript puro — sin React, sin Firebase)             │
│   entities/   Producto, Cliente, Venta, MovimientoFiado, Reporte │
│   rules/      carrito, saldo, reportes, stock, dinero (céntimos) │
│   usecases/   RegistrarVenta, RegistrarAbono, GenerarReporte…    │
│   ports/      interfaces de repositorios y servicios             │
└───────────────▲──────────────────────────────────────────────────┘
                │ implementa los puertos
┌───────────────┴──────────────────────────────────────────────────┐
│ data/                                                            │
│   firebase/   cliente, rutas (artifacts/mi-bodega-app/users/uid) │
│   mappers/    Firestore ⇄ entidades (tolerantes a datos legacy)  │
│   repositories/ Productos, Clientes, Ventas, Deudas, Config      │
│   offline/    outbox de ventas (AsyncStorage) + caché de catálogo│
└───────────────▲──────────────────────────────────────────────────┘
┌───────────────┴──────────────────────────────────────────────────┐
│ shared/  env (expo-constants), errores, formato S/, fechas Lima, │
│          logger, utilidades                                      │
└──────────────────────────────────────────────────────────────────┘
```

Regla de dependencia: `presentation → domain ← data`; `shared` lo usan todos; `domain` no importa nada externo. Esto permite probar el 100 % de las reglas de negocio con Jest sin emuladores.

### 3.1 Navegación (implementada)

Un único *native stack* raíz que contiene las pestañas y las pantallas secundarias. Es más
simple que un stack por pestaña y permite abrir, p. ej., el escáner o el formulario de cliente
desde cualquier pestaña.

```
Pila raíz (native-stack)
├── Login                      (solo sin sesión: login · registro · recuperar contraseña)
├── Tabs (bottom-tabs, lazy)
│   ├── Vender      → PosScreen
│   ├── Inventario  → InventarioScreen
│   ├── Fiado       → ClientesScreen
│   ├── Reportes    → ReportesScreen
│   └── Ajustes     → AjustesScreen
├── Cobro · Escaner(modo pos|codigo) · ProductoForm
├── ClienteDetalle · ClienteForm (modal) · MovimientoForm (modal, cargo|abono)
└── VentasPendientes · DatosNegocio
```

### 3.2 Estructura de carpetas (implementada)

```
src/
├── domain/
│   ├── entities.ts · errors.ts · ports.ts
│   ├── rules/      dinero · carrito · productos · venta · fiado · reportes
│   ├── usecases/   registrarVenta · sincronizarVentas · fiado
│   └── __tests__/
├── data/
│   ├── firebase/   client · rutas · repositorios · auth · errores
│   ├── local/      colaVentas (outbox) · cacheCatalogo
│   ├── memoria/    repositorios en memoria (pruebas de integración)
│   ├── mappers.ts · contenedor.ts
├── presentation/
│   ├── app/        App · useArranque (ciclo de sesión, sync, notificaciones)
│   ├── navigation/ components/ screens/ forms/ hooks/ services/ stores/ theme/
├── shared/env.ts
└── __tests__/      integracion/ · ui/
```

### 3.3 Estado

| Store (Zustand) | Contenido |
|---|---|
| `sesionStore` | usuario + contenedor de dependencias del uid |
| `datosStore` | productos, clientes, movimientos de fiado, config, outbox — **un listener por colección** |
| `carritoStore` | items, método de pago, cliente (lógica en `domain/rules/carrito`) |
| `redStore` | conectividad (NetInfo) |
| `temaStore` | sistema / claro / oscuro (misma clave que la web: `bodega-theme`) |
| `avisosStore`, `escanerStore` | snackbar global, código escaneado devuelto a formularios |

### 3.4 Flujo de una venta (implementado, "outbox-first")

```
CobroScreen ──► registrarVenta (domain)
                 1. armarOperacionVenta: valida carrito/método/cliente, total en céntimos,
                    venta + cargo fiado + deltas de stock; ventaId y cargoId generados en el cliente
                 2. cola.agregar(op)  → AsyncStorage  (desde aquí la venta ya no se pierde)
                 3. ¿hay red? no → "pendiente" (la UI descuenta el stock localmente)
                              sí → SincronizadorVentas.sincronizar()
                                     └─ por cada op (en orden, una ejecución a la vez):
                                        runTransaction:
                                          ventas/{ventaId} existe → nada (idempotente)
                                          si no → set venta + set cargo + increment(stock)
                                        ok → quitar del outbox
                                        timeout/sin red → queda pendiente (y "en vuelo")
                                        permission-denied/invalid → bloqueada, visible en Ajustes
Reintentos automáticos: al recuperar red (NetInfo), al volver la app a primer plano y al iniciar sesión.
```

---

## 4. Plan de migración (por fases)

| Fase | Entregable | Criterio de salida |
|---|---|---|
| 0 | Este documento + `DECISIONS.md` | Contratos y riesgos aprobados |
| 1 | Proyecto Expo + TS strict, ESLint/Prettier, estructura de capas, Firebase por `.env`, navegación, tema, error boundary, login/registro | `tsc`, `lint` y `jest` en verde; arranca en emulador Android |
| 2 | Módulos: Auth → Inventario → POS → Fiado → Reportes → Ajustes (uno a la vez, con tests) | Cada módulo cumple sus criterios de aceptación |
| 3 | Escáner (expo-camera), notificaciones locales, outbox offline, háptica, accesibilidad, rendimiento | Venta offline sincroniza; escáner agrega al carrito |
| 4 | Cobertura dominio ≥ 70 %, integración, E2E Maestro, reglas Firestore endurecidas | `QA_REPORT.md` |
| 5 | README móvil, `eas.json`, APK de preview | Build instalable o instrucciones exactas |

La web **no se toca**; convive con la app sobre los mismos datos. La app vive en `mobile/` dentro del mismo repositorio.

---

## 5. Hallazgos, riesgos y supuestos

### 5.1 Bugs en la lógica actual (la app móvil NO los replica)

| ID | Severidad | Hallazgo | Tratamiento en móvil |
|---|---|---|---|
| B-01 | **Alta** | Al registrar un abono pre-llenado, la web crea el abono (−X) **y** marca el cargo origen como `pagado` ⇒ el saldo baja **2 × X** (el cliente queda "a favor" falsamente). | La app no marca `pagado` al abonar. El estado "cubierto" de cada cargo se calcula con asignación FIFO de abonos. Saldo con la misma fórmula ⇒ web y móvil muestran lo mismo para datos nuevos. Datos históricos afectados: ver R-05. |
| B-02 | Media | El botón "Pagar" marca `pagado` sin registrar abono ⇒ ese dinero **no aparece** en ingresos del reporte. | En móvil, "Liquidar" crea un abono por el pendiente con método de pago. Se siguen leyendo `pagado: true` heredados. |
| B-03 | Media | La venta escribe venta, cargo y stocks en llamadas separadas (no atómico). Un fallo a mitad deja datos inconsistentes. | `writeBatch` atómico. |
| B-04 | Media | Serie diaria agrupa con `toISOString()` (UTC). En Perú (UTC−5), ventas después de las 19:00 caen en el día siguiente. | Agrupación por fecha local (`America/Lima`). |
| B-05 | Media | La lista de clientes abre un `onSnapshot` de deudas **por cliente en cada cambio** y nunca los cierra (fuga de listeners y lecturas). | Un único listener sobre `deudas`, agregado por `clienteId` en memoria. |
| B-06 | Baja | La consulta de pagos del reporte combina rango en `fecha` y `monto < 0` ⇒ requiere índice compuesto que no está en `firestore.indexes.json`. | Consulta solo por rango de `fecha`, filtra `monto < 0` en el cliente. Sin índices nuevos. |
| B-07 | Baja | Precios en float ⇒ errores de redondeo en totales (0.1 + 0.2). | Cálculo en céntimos enteros; se persiste en soles (number) por compatibilidad. |
| B-08 | Baja | Strings con mojibake (`Contrase�a`) en `main.js` (codificación rota tras `fix-main.ps1`). | No aplica; textos nuevos en UTF-8. |
| B-09 | Baja | `innerHTML` con datos del usuario (nombres) ⇒ XSS almacenado posible en la web. | No aplica a RN. Se reporta para la web. |
| B-10 | Media | Al vender un producto con `stock: null` ("sin control"), la web aplica `increment(-n)`, que convierte el campo en `-n`: el producto pasa a "controlado" con stock negativo. Además, si el producto fue eliminado, `updateDoc` falla y deja la venta a medias. | La transacción móvil lee cada producto: no toca `stock` nulo y omite productos eliminados. |

### 5.2 Riesgos

| ID | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| R-01 | **Reglas Firestore abiertas**: cualquier usuario autenticado (registro libre) puede leer/escribir los datos de **todas** las bodegas. | Crítico | Reglas por `uid` (propuesta en `DECISIONS.md` D-12). Compatibles con la web porque ya solo accede a su propia ruta. **Desplegarlas requiere aprobación del dueño del proyecto.** |
| R-02 | Host Windows: no hay simulador iOS ni build local de iOS. | Alto para el criterio "corre en simulador iOS" | Código multiplataforma sin módulos solo-Android; IPA vía EAS Build en la nube (requiere cuenta Apple Developer). Se documenta como pendiente verificable por el dueño. |
| R-03 | Push remoto requiere backend (Cloud Functions ⇒ plan Blaze) y credenciales FCM/APNs. | Medio | Notificaciones **locales** (stock bajo al detectarlo, recordatorio de fiado vencido). Push remoto queda diseñado como extensión opcional. |
| R-04 | Firebase JS SDK en RN no tiene caché persistente en disco para Firestore. | Medio | Outbox propio para ventas + caché del catálogo en AsyncStorage (ver D-05). |
| R-05 | Datos históricos ya afectados por B-01 (saldos "a favor" falsos). | Medio | No se modifican automáticamente. Se propone, como pendiente, una herramienta de conciliación revisada por el dueño. |
| R-06 | Web y móvil usados a la vez: si en la web se pulsa "Pagar" sobre un cargo que la app ya cubrió con un abono, el saldo queda corrido. | Bajo | Documentado en la guía de usuario; recomendación de usar una sola interfaz para cobros. |
| R-07 | Vender más que el stock disponible (stock negativo) era comportamiento de la web. | Bajo | **Revisado (pedido del dueño, 2026-10-20):** la app móvil ya no lo permite. No se agrega al carrito un producto agotado ni más unidades que su stock (POS, escáner y cobro), y la venta se bloquea si el stock bajó mientras se armaba el carrito. Productos sin control de stock (`null`) no tienen límite. Dos teléfonos vendiendo a la vez sin conexión aún pueden dejar stock negativo al sincronizar. |
| R-08 | Emulador de Firestore para pruebas de integración necesita Java (instalado: 17; versiones recientes de firebase-tools piden 21). | Bajo | Integración con repositorios falsos en memoria; emulador opcional si el entorno lo permite. |
| R-09 | Login con Google nativo requiere OAuth client IDs Android/iOS y una development build. | Bajo | Email/contraseña en Fase 1 (cubre el login actual). Google queda tras feature flag hasta tener los client IDs. |

### 5.3 Supuestos

- S-01: Un usuario de Firebase = una bodega = un rol (dueño). No hay esquema de roles en los datos; ver D-10.
- S-02: Zona horaria de negocio `America/Lima`, moneda Soles (`S/`).
- S-03: "Deuda vencida" = cargo con saldo pendiente y antigüedad mayor a `diasVencimientoFiado` (por defecto 30). No hay fecha de vencimiento en los datos actuales.
- S-04: Dispositivo objetivo de gama media-baja: Android 10+ con 2–3 GB de RAM; catálogos de hasta ~2 000 productos y ~500 clientes.
- S-05: El proyecto Firebase de producción es `bodega-difital`; para desarrollo se recomienda un proyecto separado (configurable por `.env`).
