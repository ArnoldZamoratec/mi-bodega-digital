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
- **Compatibilidad:** documentos de la web y antiguos no tienen `creadaEn` y siguen usando `fecha`. Desde D-27 la web usa la misma `fechaEfectiva` del core (con los resguardos) y el mismo `rangoConsulta`.

### D-27 · Monorepo con un solo núcleo de negocio (`@bodegon/core`) — Vigente
- **Problema:** la web (JS propio) y la app (dominio TS) calculaban saldos, FIFO, reportes y fechas por separado y se podían contradecir (la web agrupaba por `creadaEn || fecha` sin resguardos, ofrecía "Pagar" en cargos ya cubiertos por abonos y sumaba en coma flotante).
- **Decisión:** npm workspaces en la raíz: `packages/*`, `web`, `mobile`. `mobile/src/domain` pasó a `packages/core/src` (`git mv`) como paquete `@bodegon/core`: TS puro, sin React ni Firebase, con su propio `tsconfig` y Jest (babel-jest). La web (Vite + TS) lo importa como `@bodegon/core`; la app lo sigue importando como `@/domain/...`.
- **Alias en móvil:** `tsconfig.json` `paths` (`@/domain/*` → `../packages/core/src/*`, antes que `@/*`) y Jest `moduleNameMapper` en el mismo orden. Metro: **sin** `watchFolders`/`nodeModulesPaths` manuales; la guía de Expo (SDK 52+) los configura solos en monorepos y pide no fijarlos. Metro resuelve el alias con los `paths` de tsconfig. Verificado con `npx expo export --platform android`.
- **Por qué `mobile` entra en workspaces:** probado sin romper Metro, Jest (127 pruebas: 57 en móvil + 70 movidas al core) ni ESLint. Un solo `node_modules` en la raíz sin duplicados de `react`, `react-native`, `firebase` ni `typescript` (`npm ls`). Se eliminó `mobile/package-lock.json`.
- **Agregado al core:** `rules/recordatorio.ts` (mensaje y enlace de WhatsApp, antes armado dentro de `ClienteDetalleScreen`; ahora lo usan web y app) y `rules/fechasLima.ts` (día de Lima independiente de la zona del navegador). `generarReporte` acepta la función de clave de día (móvil: día local; web: `claveDiaLima`).
- **Cobertura:** el umbral ≥ 70 % del dominio se mide en `packages/core` (`npm run test:coverage -w @bodegon/core`). Los casos de uso del core se ejercitan en `mobile/src/__tests__/integracion`.
- **Consecuencia:** `npm install` va en la raíz. Las builds locales de Android en Windows deben copiar el repo completo a la ruta corta (README móvil).
