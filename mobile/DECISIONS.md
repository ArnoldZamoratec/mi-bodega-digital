# DECISIONS — Mi Bodega Digital (App móvil)

Formato: contexto → decisión → alternativas descartadas → consecuencias.
Estado: **Propuesta** · **Vigente** · **Reemplazada**.
Las propuestas de la Fase 0 fueron aprobadas por el dueño del proyecto; solo D-12 queda pendiente de despliegue.

---

### D-01 · React Native + Expo (SDK estable más reciente) + TypeScript strict — Vigente
- **Contexto:** requisito del encargo; equipo con experiencia en JS.
- **Decisión:** Expo con nueva arquitectura, `strict: true`, `noUncheckedIndexedAccess: true`. Se usan **development builds** (`expo-dev-client`) además de Expo Go.
- **Descartado:** WebView/Capacitor (prohibido), Flutter (otra base de lenguaje).
- **Consecuencias:** builds con EAS; iOS solo vía nube desde Windows (R-02).

### D-02 · La app vive en `mobile/` del mismo repositorio — Reemplazada por D-27 (la app sigue en `mobile/`; el "sin workspaces" ya no aplica)
- **Contexto:** la web sigue en producción sobre los mismos datos.
- **Decisión:** carpeta `mobile/` independiente (su propio `package.json`). La web no se modifica.
- **Descartado:** repo nuevo (pierde trazabilidad con la lógica original); monorepo con workspaces (la web no tiene build, no aporta).

### D-03 · Esquema Firestore existente sin cambios destructivos — Vigente
- **Decisión:** mismas rutas `artifacts/mi-bodega-app/users/{uid}/…`, mismos nombres de campo y literales (`"Yape/Plin"`, `metodoDePago` vs `metodoPago`). Solo campos/documentos **aditivos** (ARCHITECTURE §2.6).
- **Consecuencias:** mappers tolerantes: `stock` puede ser `null`/ausente, `telefono` ausente, `fecha` `null` mientras el `serverTimestamp` está pendiente.

### D-04 · Firebase **JS SDK** (modular) en lugar de React Native Firebase — Vigente
- **Contexto:** se necesita Auth + Firestore, configuración por `.env`, rapidez de iteración.
- **Decisión:** `firebase` JS SDK (v13) con `initializeAuth` + `getReactNativePersistence(AsyncStorage)`.
- **Detalle técnico:** los tipos publicados de `firebase/auth` no incluyen `getReactNativePersistence` (solo existe en el build `react-native` de `@firebase/auth`, que Metro resuelve). Se declara en `src/types/firebase-auth-rn.d.ts`.
- **Descartado:** `@react-native-firebase/*`. Ventaja: caché offline nativa en disco. Desventajas: exige `google-services.json`/`GoogleService-Info.plist` (no encaja con `.env`), no funciona en Expo Go, builds más pesados para gama baja.
- **Consecuencias:** offline se resuelve con D-05. Si en el futuro se necesita offline total (no solo ventas), migrar a RNFB es local a `src/data/firebase` gracias a los puertos de dominio.

### D-05 · Modo offline: outbox de ventas idempotente + caché de catálogo — Vigente
- **Decisión:**
  1. Catálogo de productos y clientes se guarda en AsyncStorage tras cada snapshot; al iniciar sin red se muestra la caché (marcada "sin conexión").
  2. Cada venta recibe su `ventaId` en el cliente (`doc(col).id`). Si el `writeBatch` falla por red, la operación se encola en un outbox persistente.
  3. **Outbox-first** (implementado): toda venta se guarda primero en el outbox y luego se confirma con `runTransaction`: si `ventas/{ventaId}` existe ⇒ no se escribe (evita doble descuento de stock); si no ⇒ venta + cargo + `increment` de stock, todo o nada. Un solo camino de código para online y offline.
     *Por qué no `writeBatch` directo:* con caché en memoria, un `commit()` sin red no falla, queda colgado y se pierde si se cierra la app. Las transacciones fallan explícitamente sin red y son idempotentes con la lectura previa.
  4. El stock mostrado offline aplica los deltas pendientes del outbox.
- **Alcance:** solo **ventas** (operación crítica). CRUD de inventario/fiado offline queda deshabilitado con mensaje claro.
- **Consecuencias:** lógica de outbox en dominio/datos puros ⇒ testeable con Jest.

### D-06 · Estado: Zustand — Vigente
- **Decisión:** Zustand para estado de cliente (carrito, sesión, tema, red). Datos remotos vía suscripciones `onSnapshot` encapsuladas en hooks (`useProductos`, `useClientes`…), un listener por colección compartido.
- **Descartado:** Redux Toolkit (más ceremonia para un dominio pequeño); React Query (no aporta sobre listeners en tiempo real).

### D-07 · UI: React Native Paper (Material 3) — Vigente
- **Decisión:** Paper con tema propio derivado de la paleta web v5.2 (verde `#059669`), claro/oscuro, `useColorScheme` + preferencia persistida.
- **Descartado:** NativeBase (mantenimiento discontinuado en favor de gluestack).

### D-08 · Formularios: React Hook Form + Zod — Vigente
- Los esquemas Zod reflejan las reglas de la web (contraseña ≥ 6, precio > 0, stock entero ≥ 0 u opcional).

### D-09 · Escáner con `expo-camera` (`CameraView` + `onBarcodeScanned`) — Vigente
- **Contexto:** el encargo menciona `expo-barcode-scanner`, pero ese paquete está **deprecado y retirado del SDK de Expo** (desde SDK 51/52).
- **Decisión:** `expo-camera`, formatos EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR. Campo aditivo `productos.codigoBarras`.
- **Flujo:** POS escanea ⇒ si existe el código, agrega al carrito con háptica; si no, ofrece crear el producto con ese código.

### D-10 · Roles: rol único "dueño" — Vigente
- **Contexto:** el encargo pide "Autenticación y roles", pero los datos actuales están particionados por `uid` y no existe ningún campo de rol. Agregar empleados que compartan una bodega exige cambiar la ruta de datos (rompería la web).
- **Decisión:** se implementa autenticación completa con un único rol (dueño). La capa de dominio define `Rol = 'dueno'` y un guard de permisos para extender después.
- **Pendiente:** multiusuario (empleados) requiere un esquema nuevo (`bodegas/{bodegaId}/miembros/{uid}`) y migración; fuera de alcance hasta que el dueño lo apruebe.

### D-11 · Notificaciones: locales con `expo-notifications` — Vigente
- **Contexto:** push remoto exige Cloud Functions (plan Blaze) + credenciales FCM/APNs (R-03).
- **Decisión:** notificaciones locales: (a) al detectar un producto que cruza a stock bajo (RN-01), con antirrebote por producto; (b) recordatorio diario configurable de fiados vencidos (S-03).
- **Extensión documentada:** función `onDocumentWritten` sobre `productos` que envíe push vía Expo Push API.

### D-12 · Reglas de Firestore endurecidas — Propuesta (escrita en `firebase/firestore.rules`, NO desplegada)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /artifacts/{appId}/users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```
- Compatible con la web (solo accede a su propia ruta). Cierra R-01. Se acompaña de validación de tipos en `productos`, `ventas` y `deudas` en la Fase 4, probada con el emulador si el entorno lo permite.
- **No se despliega automáticamente**: afecta producción.

### D-13 · Dinero en céntimos en el dominio — Vigente
- Cálculos en enteros (`Math.round(soles * 100)`); se persiste `number` en soles (compatibilidad). Formato `S/ 1,234.50` con `Intl` `es-PE`.

### D-14 · Corrección de la semántica de abonos (B-01, B-02) — Vigente
- **Decisión:** la app nunca marca `pagado` al registrar un abono; calcula el estado de cada cargo con asignación FIFO de abonos (del más antiguo al más nuevo). "Liquidar" = abono por el pendiente. El saldo usa **la misma fórmula** que la web para que ambas muestren el mismo número.
- **Consecuencia:** los registros históricos con `pagado: true` se respetan tal cual. Los saldos ya distorsionados por B-01 no se corrigen automáticamente (R-05).

### D-15 · Testing — Vigente
- Jest + `jest-expo` + React Native Testing Library. Dominio con cobertura ≥ 70 % (objetivo 90 %).
- Integración: casos de uso + repositorios en memoria que implementan los mismos puertos.
- E2E: **Maestro** (YAML, funciona con Android en Windows). **Descartado Detox:** soporte en Windows frágil y mayor costo de configuración.

### D-16 · Gráficos: `react-native-gifted-charts` — Vigente
- Basado en `react-native-svg`, liviano, sin Skia. **Descartado:** `victory-native` (requiere Skia + Reanimated, más peso para gama baja).

### D-17 · Fuera de alcance explícito
- `dataconnect/` (esquema PostgreSQL de ejemplo no usado) y `functions/` (plantilla vacía): no se usan ni se modifican.

### D-18 · Sustitución de habilidades/herramientas
| Pedido | Usado | Motivo |
|---|---|---|
| `expo-barcode-scanner` | `expo-camera` | Deprecado (D-09) |
| Detox o Maestro | Maestro | Windows (D-15) |
| Simulador iOS | EAS Build en la nube + revisión manual | Host Windows (R-02) |
| Push notifications | Notificaciones locales | Sin backend (D-11) |

### D-19 · React Navigation en lugar de Expo Router — Vigente
- **Contexto:** la plantilla de Expo SDK 58 (`AGENTS.md`) recomienda Expo Router; el encargo exige React Navigation.
- **Decisión:** React Navigation 7 (native-stack + bottom-tabs) con tipos estrictos (`navigation/tipos.ts`). Expo Router está construido sobre React Navigation, por lo que migrar después es viable.

### D-20 · Rendimiento para gama media-baja — Vigente
- Un listener por colección para toda la app (no por pantalla ni por cliente).
- `FlatList` con `initialNumToRender`, `windowSize` reducido y `removeClippedSubviews`; filas memoizadas.
- Pestañas `lazy`; la cámara solo se monta con la pantalla enfocada.
- Solo se empaqueta la fuente `MaterialCommunityIcons` (import por subruta): de 18 fuentes a 1.
- Gráfico sin animación (`isAnimated={false}`).
- Hermes (por defecto en Expo).

### D-21 · Pruebas de UI con RNTL v14 — Vigente
- RNTL 14 es asíncrono (`await render`, `await fireEvent`). Los iconos y la háptica se simulan en `jest.setup.tsx`.

### D-22 · Anulación de ventas por contraasiento — Vigente
- **Problema:** un cobro equivocado era permanente y descuadraba caja, stock y reportes.
- **Decisión:** anular = crear OTRA venta (contraasiento) con los mismos ítems en negativo, total negativo y el campo aditivo `anulaA`. Su id es `{venta}-anulada`: una venta solo se puede anular una vez (escritura idempotente, como las ventas). La misma transacción devuelve el stock y elimina el cargo fiado de la venta original. Los abonos ya hechos se conservan y quedan como saldo a favor.
- **Por qué no borrar ni marcar:** las ventas son un registro histórico inmutable (reglas D-12: solo `create`). La web comparte la base y solo suma `total`, así que con un contraasiento negativo cuadra sin conocer el concepto de "anulada". Un campo `anulada: true` la habría dejado contando la venta.
- **Reportes:** una venta y su contraasiento en el mismo rango se cancelan y no cuentan como venta. Un contraasiento de una venta de otro día resta el monto (como en la web) pero no cuenta como venta.
- **Reglas propuestas:** el contraasiento debe tener id `{anulaA}-anulada` y total ≤ 0, para que no se disfrace un ingreso de anulación. Probado en el emulador (`firebase/reglas.test.mjs`).
- **"Deshacer" tras cobrar:** si la venta sigue en el teléfono, se quita de la cola; si ya se sincronizó, se anula (motivo "Deshecha al momento"). En ambos casos los productos vuelven al carrito.
- **Límite:** anular una venta sincronizada requiere conexión.

### D-23 · Inicio de sesión con Google — Vigente
- **Librería:** `react-native-nitro-google-signin` (Credential Manager de Android, la opción que recomienda Expo). Solo entrega el `idToken`; Firebase Auth inicia sesión con `GoogleAuthProvider.credential`. Aislada en `data/google/proveedorGoogle.ts`.
- **Opcional por configuración:** el botón aparece solo si `.env` tiene `GOOGLE_WEB_CLIENT_ID`. Sin él, la app sigue funcionando solo con correo.
- **Misma cuenta:** con la vinculación por defecto de Firebase ("una cuenta por correo"), entrar con Google usando el mismo correo verificado lleva al mismo usuario y a los mismos datos de la bodega.
- **Requisito nativo:** la huella SHA-1 del certificado que firma el APK debe estar registrada en la app Android de Firebase. Sin ella, Google devuelve `DEVELOPER_ERROR`, que se muestra en español.

### D-24 · Fiado sin conexión (outbox de movimientos) — Vigente
- **Problema:** los cargos y abonos manuales usaban `addDoc`, cuya promesa solo termina cuando el servidor confirma. Sin señal, el formulario se bloqueaba y lo escrito se perdía si se cerraba la app (el SDK web en RN solo cachea en memoria).
- **Solución:** mismo patrón que las ventas (D-05). El id se genera en el teléfono, el movimiento se guarda en un outbox propio (`bodega:outbox-fiado:{uid}`) y se confirma con una transacción idempotente (`deudas/{id}` solo si no existe). `ColaPersistente<T>` y `SincronizadorCola<T>` son genéricos y los comparten ventas y fiado.
- **Lecturas:** `FiadoOffline` decora el repositorio. Une lo confirmado con lo pendiente, incluidos los cargos de ventas fiadas aún en el outbox de ventas, así el saldo es correcto sin red. Si un id ya llegó al servidor, gana la versión del servidor. Los pendientes se marcan "Por enviar".
- **Orden:** primero se sincronizan las ventas y luego el fiado, porque un abono puede imputarse al cargo de una venta fiada pendiente.
- **Borrar:** lo que aún no se envió se quita del teléfono sin red. Lo confirmado sigue requiriendo conexión. El cargo de una venta pendiente no se borra suelto: se anula la venta (D-22).
- **Web:** sin cambios. Los documentos tienen el mismo formato (`origen: 'movil'`).

### D-25 · Monto libre — Vigente
- **Qué:** vender un monto sin elegir un producto ("S/ 2.50 de pan suelto"), con el botón junto al escáner del POS. Tiene montos rápidos (0.50, 1, 2, 5, 10) y una descripción opcional ("Varios" si no se escribe).
- **Cómo se guarda:** como un item más de `ventas.items`, con id `libre-…`. La web solo suma `total`, así que lo ve sin cambios.
- **Reglas:** no descuenta stock, no se devuelve al anular y no entra al ranking de más vendidos. Sí suma en ingresos, en la cantidad de ventas y en el fiado. Tope de S/ 9,999 por item para evitar errores de tipeo.
- **Textos:** al anular o deshacer una venta que solo tiene montos libres, no se menciona el stock.

### D-26 · Fecha real de las ventas sin conexión (`creadaEn`) — Vigente
- **Problema:** `fecha` es `serverTimestamp()` al sincronizar. Una venta cobrada a las 23:50 sin señal y sincronizada a la mañana siguiente caía en el día equivocado en reportes y en "vendido hoy".
- **Solución (aditiva):** la venta, el cargo fiado que genera y los movimientos de fiado del outbox guardan además `creadaEn` (Timestamp con la hora del teléfono). `fecha` no cambia: las reglas exigen `fecha == request.time`. La web ignora el campo.
- **Fecha efectiva:** `fechaEfectiva = creadaEn ?? fecha` (`rules/reportes.ts`). Si `creadaEn` es posterior a `fecha` (reloj adelantado) o más de 3 días anterior (reloj atrasado u outbox muy viejo), manda `fecha`. Así cada documento cae en un solo día.
- **Consultas:** se sigue filtrando por `fecha` (índice simple, sin índices nuevos) pero desde el inicio del rango hasta fin + 3 días (`rangoConsulta`), y luego se filtra en memoria por fecha efectiva (`enRangoEfectivo`). El margen de 3 días es el mismo que acota `fechaEfectiva`, por lo que nada queda fuera. Costo: el reporte lee hasta 3 días extra de documentos.
- **Día:** se agrupa por día local del teléfono (B-04), que en Perú es America/Lima.
- **Compatibilidad:** documentos de la web y antiguos no tienen `creadaEn` y siguen usando `fecha`. Desde D-29 la web usa la misma `fechaEfectiva` del core (con los resguardos) y el mismo `rangoConsulta`.

### D-27 · Cobranza y recordatorio por WhatsApp (`clientes.ultimoRecordatorio`) — Vigente
- **Qué:** pantalla **Cobranza** (botón en la pestaña Fiado) con los clientes de saldo > 0, primero quien debe desde hace más tiempo. Cada fila: saldo, "debe desde hace N días", "último recordatorio hace N días" y **Recordar por WhatsApp**. Arriba: total por cobrar y **recuperado este mes**.
- **Orden:** el cargo "más antiguo" es el primero que los abonos aún no cubren (FIFO de D-14, el mismo que muestra el detalle), con su **fecha efectiva** (D-26). Empates: mayor saldo, luego nombre. Los días son de calendario local (hoy = 0, ayer = 1).
- **Recuperado este mes:** suma de abonos (cualquier medio) con fecha efectiva en el mes calendario local del teléfono (America/Lima en Perú, B-04), incluidos los que esperan en el teléfono.
- **Mensaje:** el armado del texto y del enlace `wa.me` vive en un solo lugar: `rules/recordatorio.ts` del core (D-29); `rules/cobranza.ts` solo lo reexpone. Web, Cobranza y detalle del cliente mandan el mismo texto. Tono de IDENTIDAD_VISUAL §9: saluda por el nombre, dice el saldo, agradece; nunca "deuda", "moroso" ni urgencias. Firma con el nombre del negocio si se configuró ("tu bodega" si no).
- **Pausa de 3 días (`DIAS_PAUSA_RECORDATORIO`):** si se recordó hace menos de 72 h, el botón pasa a un estilo de texto discreto ("Recordado ayer · volver a escribir"). **No bloquea**: el dueño decide.
- **Dato:** campo aditivo `clientes.ultimoRecordatorio` (Timestamp, hora del teléfono). Se escribe con `updateDoc` **sin esperar** al servidor: el listener lo muestra al instante (compensación de latencia del SDK) y un error solo se registra en consola, porque el WhatsApp ya salió. La web lo ignora y, al editar un cliente con `updateDoc`, lo conserva.
- **Reglas:** `ultimoRecordatorio` entra a la lista cerrada de claves de `clientes`; debe ser `timestamp` y no más de 1 día en el futuro (`horaTelefono`).
- **Límite:** sin outbox propio. Sin señal, la anotación vive en la cola en memoria del SDK y se pierde si se cierra la app antes de reconectar (solo se pierde la marca, no el mensaje). Se aceptó por ser una pista de UX, no un dato contable.

### D-28 · Caja: apertura, movimientos y cierre con arqueo — Vigente
- **Qué:** **Ajustes → Caja**. Abrir con monto inicial, registrar ingresos/egresos de efectivo con motivo, cerrar contando el efectivo: esperado vs. contado y diferencia (sobrante/faltante). Historial de cierres.
- **Esperado** (`resumenCaja`, en céntimos): inicial + ventas `Efectivo` + abonos `Efectivo` + ingresos − egresos. Ventana: desde la apertura hasta el cierre (o ahora), por **fecha efectiva** (D-26). Los contraasientos (D-22) tienen total negativo y restan solos, también si anulan una venta de otra sesión. Las ventas del outbox cuentan una sola vez aunque ya hayan llegado al servidor. Al cerrar se recalcula al instante y se guardan `contado`, `esperado` y `diferencia` (el historial no se recalcula).
- **Firestore (aditivo):** `cajas/{cajaId}` `{ estado: 'abierta'|'cerrada', apertura: {monto, fecha, creadaEn}, cierre?: {contado, esperado, diferencia, fecha, creadaEn}, origen }` y `cajas/{cajaId}/movimientos/{id}` `{ tipo: 'ingreso'|'egreso', monto, motivo, fecha, creadaEn }`. Soles en Firestore, céntimos en el dominio (D-13). `fecha` = `serverTimestamp` (las reglas exigen `request.time`), `creadaEn` = hora del teléfono.
- **¿Subcolección o arreglo para los movimientos?** Subcolección: (1) cada movimiento es un documento de **solo creación** con id del teléfono, así el reenvío del outbox es idempotente igual que ventas y fiado; un arreglo exigiría leer-modificar-escribir y dos reenvíos podrían duplicar o pisarse; (2) las reglas validan **cada** movimiento (tipo, monto, motivo, fecha del servidor); en un arreglo no se puede validar elemento por elemento; (3) "caja cerrada inmutable" queda en una regla simple: se crean movimientos solo si la caja padre está `abierta` (`get()`), y la caja solo admite el cambio `abierta → cerrada` agregando `cierre`. Costo: un listener extra mientras la pantalla de Caja está abierta y una lectura `get()` por movimiento en las reglas.
- **Sin conexión (mismo patrón que D-05/D-24):** cada operación (abrir, movimiento, cerrar) se guarda primero en un outbox propio (`bodega:outbox-caja:{uid}`, `ColaPersistente` + `SincronizadorCola` genéricos) y se confirma con una transacción idempotente (`cajas/{id}` o `movimientos/{id}` solo si no existen; el cierre no hace nada si ya está cerrada). El outbox es FIFO, así que apertura → movimientos → cierre llegan en orden. `CajaOffline` une lo confirmado con lo pendiente (marcado "Por enviar") y guarda la última copia en `CacheCatalogo` para abrir la pantalla sin red tras reiniciar. Se sincroniza con ventas y fiado (al iniciar sesión, al volver la red y al volver a primer plano), en paralelo porque no dependen entre sí.
- **Una caja abierta por usuario:** se valida en el dominio (`armarApertura`) contra las cajas confirmadas **y** las pendientes. Las reglas no pueden consultar "¿hay otra abierta?" sin un documento puntero; dos teléfonos de la misma cuenta abriendo sin conexión podrían crear dos. Si pasa, la pantalla usa la más reciente y la otra puede cerrarse después. Pendiente si se habilita multiusuario (D-10): documento `cajas/actual` con transacción.
- **Reglas:** dueño únicamente; apertura con claves conocidas, `monto` 0–100 000, `fecha == request.time`; cierre con `contado` 0–100 000, `diferencia == contado − esperado` (± medio céntimo), solo `estado` y `cierre` cambian; sin borrar; movimientos solo `create`, `monto` > 0, `motivo` 1–80, `tipo` válido, caja padre abierta.
- **Web (2026-11):** pantalla Caja con las mismas reglas del core (`resumenCaja`, `arqueo`, `armar*`). Solo en línea, como las ventas web: cada operación es una transacción idempotente con id generado en el navegador (un reintento reutiliza el id). Escribe las mismas formas que la app **sin `origen`** (las reglas solo aceptan `'movil'` o nada); `web/src/mappersCaja.ts` + prueba de reglas "flujo de la web". Sin ventas del outbox en el esperado (la web no tiene outbox).
- **Plan Pro:** Cobranza y Caja son candidatas al plan de pago; no hay control de plan en esta versión (no existe aún un campo de suscripción).


### D-29 · Monorepo con un solo núcleo de negocio (`@bodegon/core`) — Vigente
- **Problema:** la web (JS propio) y la app (dominio TS) calculaban saldos, FIFO, reportes y fechas por separado y se podían contradecir (la web agrupaba por `creadaEn || fecha` sin resguardos, ofrecía "Pagar" en cargos ya cubiertos por abonos y sumaba en coma flotante).
- **Decisión:** npm workspaces en la raíz: `packages/*`, `web`, `mobile`. `mobile/src/domain` pasó a `packages/core/src` (`git mv`) como paquete `@bodegon/core`: TS puro, sin React ni Firebase, con su propio `tsconfig` y Jest (babel-jest). La web (Vite + TS) lo importa como `@bodegon/core`; la app lo sigue importando como `@/domain/...`.
- **Alias en móvil:** `tsconfig.json` `paths` (`@/domain/*` → `../packages/core/src/*`, antes que `@/*`) y Jest `moduleNameMapper` en el mismo orden. Metro: **sin** `watchFolders`/`nodeModulesPaths` manuales; la guía de Expo (SDK 52+) los configura solos en monorepos y pide no fijarlos. Metro resuelve el alias con los `paths` de tsconfig. Verificado con `npx expo export --platform android`.
- **Por qué `mobile` entra en workspaces:** probado sin romper Metro, Jest (127 pruebas: 57 en móvil + 70 movidas al core) ni ESLint. Un solo `node_modules` en la raíz sin duplicados de `react`, `react-native`, `firebase` ni `typescript` (`npm ls`). Se eliminó `mobile/package-lock.json`.
- **Agregado al core:** `rules/recordatorio.ts` (mensaje y enlace de WhatsApp, antes armado dentro de `ClienteDetalleScreen`; ahora lo usan web y app) y `rules/fechasLima.ts` (día de Lima independiente de la zona del navegador). `generarReporte` acepta la función de clave de día (móvil: día local; web: `claveDiaLima`).
- **Cobertura:** el umbral ≥ 70 % del dominio se mide en `packages/core` (`npm run test:coverage -w @bodegon/core`). Los casos de uso del core se ejercitan en `mobile/src/__tests__/integracion`.
- **Consecuencia:** `npm install` va en la raíz. Las builds locales de Android en Windows deben copiar el repo completo a la ruta corta (README móvil).

### D-30 · Disposición adaptable: teléfonos chicos, plegables, tablets, POS de mostrador y letra al 200 % — Vigente
- **Problema:** con `orientation: 'default'` y `supportsTablet: true` la app ya rotaba y ya tenía topes de ancho (`ANCHO_CONTENIDO`), pero todo seguía siendo "teléfono estirado": en un POS de 1280×800 la barra inferior y el encabezado se comían el alto, el carrito solo se veía en una barra flotante, Fiado/Inventario obligaban a entrar y salir de cada detalle, el gráfico de Reportes se medía contra la ventana (mal con riel o Split View), los diálogos de Paper ocupaban todo el ancho de una tablet y a letra 200 % en 320dp los precios y totales se salían de su tarjeta.
- **Base:** `presentation/hooks/useDisposicion.ts`. `useDisposicion()` lee `useWindowDimensions` y devuelve `disposicion` (`compacta` < 600dp, `media` 600–839, `expandida` ≥ 840 — clases de ventana de Material 3, por **ancho de ventana**, no por tipo de equipo: rotar, desplegar o dividir pantalla la cambia en caliente), `horizontal`, `escalaFuente`, `conPanelLateral` (media+) y `dosPaneles` (expandida). Constantes: `ANCHO_RIEL` 80, `ANCHO_PANEL_TICKET` 300/360, `ANCHO_PANEL_LISTA` 400, `MULTIPLICADOR_MONTO` 1.6. `columnasPorAncho()` y `useEstiloDialogo()` (tope 560dp). Convive con `theme/ventana.ts` (`useVentana`: alto compacto, teléfono angosto), que sigue gobernando el encabezado.
- **Navegación:** barra inferior en compacta/media; en expandida **riel lateral** con `tabBarPosition: 'left'` de `@react-navigation/bottom-tabs` v7 (verificado en sus docs 7.x y en el código instalado 7.22: el contenedor pasa a fila). Seguimos con nuestra `BarraPestanas` (prop `riel`), así no se usa `tabBarVariant: 'material'`. El riel absorbe insets superior/inferior/izquierdo; con `screenLayout` las pestañas ven inset izquierdo 0 para no sumarlo dos veces. En riel `altoPestanas` = 0 (los avisos bajan al borde).
- **POS:** desde media, catálogo + **ticket persistente** (`PanelTicket`: ítems con −/+ que respetan stock, vaciar con deshacer, total, "Cobrar" → Cobro, que sigue siendo donde se elige método y se confirma). La barra flotante solo existe en compacta. Columnas por el **ancho real del catálogo** (`onLayout`; antes de medir se estima restando riel/ticket) y la letra: tarjeta mínima 140dp × min(escala, 1.5) → 2 col. en 390dp, 5 en 1280×800, 1 en 320dp al 200 %.
- **Lista–detalle (solo expandida):** Fiado y Cobranza muestran a la derecha `DetalleCliente` (extraído de `ClienteDetalleScreen`, que lo reutiliza como pantalla apilada); Inventario muestra `FichaProducto` (solo lectura + "Editar producto" que abre el formulario de siempre: no se duplicó el formulario con sus efectos de foco/escáner). Siempre hay algo elegido (el primero visible). En media sigue una columna: 400dp de lista + detalle no entran bien en 600–839dp.
- **Reportes:** KPIs 4 en fila desde media, 1 por fila en compacta con letra ≥ 1.5×; ancho del gráfico desde `onLayout` de su tarjeta. **Caja:** dos columnas en expandida (caja actual | cierres anteriores), tope 1200dp.
- **Letra:** `allowFontScaling` se mantiene en todo. `maxFontSizeMultiplier = 1.6` solo en montos protagonistas que rompían el diseño (total POS/ticket, precio de tarjeta y ficha, saldo de cliente, totales de Fiado/Cobranza/Reportes/KPIs, esperado de Caja), además de `adjustsFontSizeToFit` donde el monto vive en una sola línea. Apilado con letra grande: métricas de Cobranza, botones Fiar/Registrar pago, desglose de Caja con `flexShrink`.
- **Táctil:** botones `compact` de Paper (40dp) que se usaban como acción (Llamar/Recordar, "volver a escribir", Vaciar) pasan a `minHeight` 48.
- **Alternativas descartadas:** `expo-screen-orientation` para bloquear vertical (rompe POS horizontales y tablets); breakpoints por `Platform.isPad`/tamaño de pantalla (falla en Split View y plegables); embebir Cobro dentro del ticket (duplicaba la lógica de venta; Cobro como hoja sigue siendo un solo camino).
- **Pruebas:** `__tests__/ui/disposicion.test.tsx` (18) simula ventanas con `Dimensions.set` (`test-utils/ventana.ts`). Bundle verificado con `npx expo export --platform android`. Pendiente en equipos reales: QA_REPORT §7.
