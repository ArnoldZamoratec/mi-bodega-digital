# QA_REPORT — Mi Bodega Digital (App móvil)

Fecha: 2026-10-19 · Rama: `feature/app-movil` · Expo SDK 58 · RN 0.88 · TypeScript 6 (strict)
Entorno de verificación: Windows 11, Node 24, JDK 17 (Gradle) / JBR 21 (emulador Firestore),
emulador Android **Pixel 5 · API 37**.

---

## 1. Resumen

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` (strict + `noUncheckedIndexedAccess`) | ✅ 0 errores |
| ESLint (`eslint-config-expo` + Prettier) | ✅ 0 errores, 0 advertencias |
| Jest — unitarias, integración y UI | ✅ 127/127 (20 suites) |
| Cobertura capa de dominio | ✅ ~99 % líneas (umbral exigido 70 %, aplicado en `jest.coverageThreshold`) |
| Reglas Firestore (endurecidas 2026-11) — emulador | ✅ 23/23 |
| `expo-doctor` | ✅ 20/20 checks |
| Bundle Metro Android (Hermes) | ✅ 6.1 MB |
| Build nativo Android release (Gradle local) | ✅ `app-release.apk` arm64-v8a, 37 MB (desde `C:\mb`, ver §6.0) |
| Ejecución en dispositivo real | ✅ Samsung Galaxy A24 (SM-A245M), Android 16 / API 36: instala, arranca y muestra el login; sin errores en logcat |
| E2E Maestro | ⏳ Flujos escritos, no ejecutados — ver §6.0 |
| iOS (simulador / IPA) | ⏳ No verificable en Windows — ver §6 |

## 2. Pruebas automatizadas

### 2.1 Unitarias de dominio (`src/domain/__tests__`) — 6 suites

| Suite | Qué cubre |
|---|---|
| `dinero` | céntimos, redondeo (1.005 → 1.01), formato `S/ 1,234.50`, parseo "12,5" |
| `carrito` | agregar/quitar/fijar, inmutabilidad, cantidades inválidas, total exacto, advertencias de stock |
| `productos` | stock bajo ≤ 5 y `null`, orden es-PE, búsqueda sin tildes y por código, deltas offline, detección de cruce a stock bajo |
| `venta` | documento idéntico a la web, fiado ⇒ cliente + cargo con `ventaId`, truncado a 100 caracteres (RN-05), método inválido |
| `fiado` | fórmula de saldo de la web, **reproducción del bug B-01**, FIFO (pendiente/parcial/cubierto/pagado), vencidos, abono/cargo/liquidación |
| `reportes` | rangos por día local, error fin < inicio, totales por método, fiado fuera de ingresos, top 5, serie diaria en hora local (B-04), fecha efectiva `creadaEn ?? fecha` de ventas sin conexión (D-26) |

### 2.2 Datos (`src/data/__tests__`)
Mappers tolerantes a datos heredados de la web (precio texto, stock ausente, `fecha` pendiente,
métodos desconocidos), traducción de errores Firebase, caché por usuario.

### 2.3 Integración (`src/__tests__/integracion`)
- **Venta offline** (8 casos): online, fiado, outbox persistente tras "reiniciar", reintento
  con servidor caído, **idempotencia** (sin doble descuento de stock), timeout "en vuelo",
  error permanente aislado, ejecución única concurrente, aislamiento por usuario.
- **Fiado**: deuda → abono parcial → liquidar ⇒ saldo 0, cargo no marcado como pagado, ingresos
  correctos en el reporte.

### 2.4 UI (`src/__tests__/ui`, React Native Testing Library)
- **Login**: validación, ingreso, error traducido, registro (≥ 6 y confirmación).
- **Cobro**: efectivo descuenta stock y vacía carrito; advertencia de stock; fiado sin cliente
  bloquea; **sin conexión guarda en el teléfono**.

### 2.5 Reglas de Firestore (`firebase/reglas.test.mjs`, emulador)
Aislamiento entre bodegas, acceso anónimo, escrituras exactas de la web v5.3 (venta, cargo,
`increment`, "Pagar", abonos, clientes), transacción idempotente móvil, campos aditivos,
validación de tipos, ventas inmutables. Endurecimiento 2026-11: aislamiento de productos/ventas/deudas
entre usuarios, `appId` distinto denegado, total negativo sin `anulaA`, `fecha` distinta de
`serverTimestamp`, Fiado sin `clienteId`, `pagado=false` en deudas, claves desconocidas en productos,
y el campo aditivo `creadaEn` (D-26) permitido.

```bash
cd mobile/firebase && npm install && npm test   # requiere Java 21
# Con Java 17:
cd mobile/firebase && npx -y firebase-tools@13.35.1 emulators:exec --only firestore --project demo-mi-bodega "node --test reglas.test.mjs"
```

### 2.6 E2E (Maestro, `.maestro/flujos`)
7 flujos: validación de login, login, CRUD de inventario + stock bajo, venta en efectivo con
descuento de stock, fiado completo (cliente → venta fiada → abono → saldo 0), venta en modo
avión con sincronización posterior, reportes + tema.

Estado: **escritos y revisados, no ejecutados** en esta sesión (ver §6.0). Requieren el APK
instalado y una cuenta de prueba.

## 3. Bugs encontrados y corregidos

### 3.1 En la lógica heredada de la web (no replicados en la app)
| ID | Severidad | Bug | Corrección en móvil | Prueba |
|---|---|---|---|---|
| B-01 | Alta | Abono pre-llenado descuenta el saldo dos veces | Abonos no marcan `pagado`; estado por FIFO | `fiado.test.ts` |
| B-02 | Media | "Pagar" no registra ingreso | "Liquidar" crea abono | `fiado.test.ts`, integración |
| B-03 | Media | Venta no atómica | Transacción | integración + reglas |
| B-04 | Media | Serie diaria en UTC | Día local | `reportes.test.ts` |
| B-05 | Media | Fuga de listeners por cliente | 1 listener por colección | revisión de código |
| B-06 | Baja | Consulta requiere índice no declarado | Filtro `monto<0` en cliente | revisión |
| B-07 | Baja | Errores de coma flotante | Céntimos | `dinero.test.ts` |
| B-10 | Media | `increment` convierte stock `null` en negativo | No se toca stock nulo | integración |

### 3.2 Encontrados durante el desarrollo de la app
| Bug | Detección | Corrección |
|---|---|---|
| `aCentimos(1.005)` devolvía 100 (coma flotante) | prueba unitaria | `toFixed(6)` antes de redondear |
| Validaciones del caso de uso de fiado lanzaban síncrono (no como promesa rechazada) | prueba de integración | casos de uso `async` |
| Faltaban `expo-font`/`expo-asset` (iconos fallarían en runtime) | prueba de UI | instalados con `expo install` |
| Se empaquetaban 18 fuentes de iconos | inspección del bundle | import por subruta (1 fuente) |
| Regex de tildes corrompida por herramientas (caracteres combinables literales) | revisión | `RegExp` construida con `String.fromCharCode` |
| Reportes: `setState` síncrono dentro de `useEffect` (renders en cascada) | ESLint `react-hooks` | resultados indexados por rango |
| Al confirmar venta se veía "carrito vacío" un instante | revisión de UX | volver antes de vaciar |
| Regla propuesta bloqueaba ventas si un producto heredado tenía datos inválidos | revisión de reglas | regla específica para actualizaciones solo de `stock` |

## 4. Revisión de estados de UI

| Pantalla | Cargando | Vacío | Error | Éxito / feedback |
|---|---|---|---|---|
| Login | botón con spinner | — | mensaje traducido | navega a la app |
| POS | spinner | sin productos (→ Inventario) / sin resultados | mensaje | háptica al agregar, badge de cantidad |
| Cobro | botón bloqueado | carrito vacío | mensaje en panel | snackbar + háptica |
| Escáner | permiso | permiso denegado | — | háptica + "+1 producto" |
| Inventario | spinner | sin productos / sin resultados | mensaje | snackbar |
| Fiado / Detalle | spinner, saldo "…" | sin clientes / sin movimientos | mensaje | snackbar |
| Reportes | "Calculando…" | "Sin ingresos" / "No hay datos" | mensaje / rango inválido | tiempo real |
| Ventas pendientes | — | "Todo sincronizado" | error por venta + bloqueadas | snackbar |
| Global | — | — | ErrorBoundary con reintento; pantalla de `.env` faltante | — |

Reconexión: banner persistente offline/pendientes; sincronización automática al volver la red,
al volver a primer plano y al iniciar sesión; escrituras no-venta bloqueadas con mensaje claro.

## 5. Accesibilidad y rendimiento
- `accessibilityLabel`/`Role` en botones de icono, filas de producto/cliente, KPIs y gráfico;
  `accessibilityLiveRegion` en errores y snackbar; objetivos táctiles ≥ 48 dp; colores con
  contraste en ambos temas.
- Rendimiento: ver DECISIONS D-20.

## 6. Pendientes y limitaciones conocidas

### 6.0 Build nativo y E2E
- `expo prebuild` ✅. Primer `gradlew assembleRelease` ❌ por rutas de más de 260 caracteres
  de Windows en la compilación C++ (`react_codegen_safeareacontext`).
- `subst` no lo resuelve: mapear `mobile/` rompe la autovinculación de Expo
  (`Couldn't find "package.json" up from path "M:\"`) y, mapeando la carpeta padre, las
  dependencias se resuelven igual con la ruta real larga.
- El reintento final, junto con el emulador, fue **detenido por falta de memoria del sistema**
  (Gradle + emulador + Metro superan la RAM disponible). No es un error del proyecto.
- **Resuelto:** compilando desde una ruta corta (`C:\mb`) + plugin `plugins/rutasCortasWindows.js`
  (CMake en `C:/r`), solo arm64-v8a. APK instalado y ejecutado en el teléfono del dueño.
- Pendiente: probar los flujos con sesión iniciada (POS, inventario, fiado, reportes, escáner
  y modo avión) con una cuenta de prueba, y los E2E de Maestro.
- Para repetirlo: cerrar otras aplicaciones y ejecutar los pasos del README §6 (opción B), o
  usar `npm run build:apk` (EAS en la nube, no consume memoria local). Luego
  `maestro test .maestro -e EMAIL=… -e PASSWORD=…`.

1. **iOS**: no se puede compilar ni ejecutar el simulador en Windows. El código no usa módulos
   solo-Android; la IPA requiere `npm run build:ios` con una cuenta Apple Developer.
2. **Reglas de Firestore**: la propuesta está probada pero **no desplegada** (decisión del dueño).
   Hasta desplegarla, el riesgo R-01 sigue abierto en producción.
3. **Datos históricos afectados por B-01**: no se corrigen automáticamente (R-05).
4. **Push remoto**: se implementaron notificaciones locales (D-11).
5. **Roles/multiusuario**: un rol (dueño) por cuenta (D-10).
6. **Login con Google**: no incluido; requiere client IDs OAuth nativos (R-09).
7. Reportes "Hoy" se calcula al elegir el periodo; si la app queda abierta pasada la medianoche,
   hay que volver a tocar "Hoy".
