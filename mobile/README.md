# 🏪 Mi Bodega Digital — App móvil (Android / iOS)

App nativa en **React Native + Expo (SDK 58) + TypeScript estricto** para dueños de bodegas:
POS táctil con escáner de códigos, inventario, fiado (clientes, deudas y abonos), reportes en
tiempo real, tema claro/oscuro, notificaciones y **ventas sin conexión**.

Usa **el mismo Firebase que la web v5.3** (`bodega-difital`), con las mismas colecciones y
campos: la web y la app pueden usarse a la vez sobre los mismos datos.

> Documentos relacionados: [ARCHITECTURE.md](ARCHITECTURE.md) · [DECISIONS.md](DECISIONS.md) · [QA_REPORT.md](QA_REPORT.md)

---

## 1. Requisitos

| Herramienta | Versión | Para qué |
|---|---|---|
| Node.js | 20 LTS o superior (probado con 24) | Todo |
| Java JDK | 17 | Compilar Android localmente |
| Android Studio + SDK (API 34+) + un emulador | — | Probar en Android |
| Cuenta Expo (gratis) + `eas-cli` | ≥ 16 | Builds en la nube (APK / IPA) |
| Mac con Xcode | — | Solo si compilas iOS **localmente** (en la nube no hace falta) |
| Maestro CLI | ≥ 1.39 | Pruebas E2E (opcional) |

## 2. Instalación

```bash
git clone https://github.com/ArnoldZamoratec/mi-bodega-digital.git
cd mi-bodega-digital
npm install               # en la RAÍZ: npm workspaces (packages/core, web, mobile)
cd mobile
cp .env.example .env      # en Windows: copy .env.example .env
```

> **Monorepo.** Las reglas de negocio (`@/domain/...`) viven en `../packages/core/src`
> (paquete `@bodegon/core`, compartido con la web). El alias está en `tsconfig.json` (`paths`)
> y en Jest (`moduleNameMapper`); Metro lo resuelve con los `paths` de tsconfig, y
> `metro.config.js` usa la configuración automática de monorepos de Expo (SDK 52+). Las
> dependencias se instalan una sola vez en la raíz (ya no hay `mobile/package-lock.json`).

## 3. Configuración de Firebase

1. Consola de Firebase → ⚙️ *Configuración del proyecto* → *Tus apps* → app **Web** → copia
   el objeto `firebaseConfig`.
2. Completa `mobile/.env`:

   ```dotenv
   FIREBASE_API_KEY=...
   FIREBASE_AUTH_DOMAIN=bodega-difital.firebaseapp.com
   FIREBASE_PROJECT_ID=bodega-difital
   FIREBASE_STORAGE_BUCKET=bodega-difital.firebasestorage.app
   FIREBASE_MESSAGING_SENDER_ID=...
   FIREBASE_APP_ID=...
   FIREBASE_DATA_APP_ID=mi-bodega-app   # igual que appId en js/firebase.js de la web
   ```

3. En *Authentication → Método de inicio de sesión*, debe estar habilitado **Correo/contraseña**
   (ya lo está para la web).

`.env` está en `.gitignore`. Las variables entran a la app vía `app.config.ts` →
`expo-constants`. Si falta alguna, la app muestra una pantalla indicando cuáles.

> 💡 **Recomendado:** usa un proyecto Firebase de **desarrollo** para pruebas y E2E, y deja
> `bodega-difital` solo para producción.

Para builds en la nube, crea las mismas variables en EAS (no subas `.env`):

```bash
npx eas-cli@latest env:create --environment preview --name FIREBASE_API_KEY --value "..." --visibility plaintext
# …repite para cada variable y para los entornos development / production
```

## 4. Scripts

| Comando | Qué hace |
|---|---|
| `npm start` | Servidor de desarrollo (development build) |
| `npm run start:go` | Abrir en **Expo Go** (sin escáner nativo garantizado; útil para UI) |
| `npm run android` | Compila e instala en el emulador/dispositivo Android (`expo run:android`) |
| `npm run ios` | Igual para iOS (requiere macOS + Xcode) |
| `npm run typecheck` | TypeScript estricto |
| `npm run lint` / `lint:fix` | ESLint + Prettier |
| `npm test` | Pruebas unitarias, de integración y de UI (Jest + RNTL) |
| `npm run test:coverage` | Igual con cobertura (umbral 70 % en `src/domain`) |
| `npm run verify` | typecheck + lint + cobertura (lo que debe pasar antes de cada commit) |
| `npm run test:e2e` | Flujos E2E con Maestro (ver §7) |
| `npm run build:apk` | APK instalable en la nube (EAS, perfil `preview`) |
| `npm run build:ios` | IPA en la nube (EAS, perfil `production`) |

## 5. Ejecutar en desarrollo

```bash
# Android (emulador abierto o teléfono con depuración USB)
npm run android        # la primera vez genera /android y compila (5-15 min)
# Siguientes veces basta con:
npm start              # y presiona "a"
```

## 6. Generar instalables

### APK Android (para instalar directo en el teléfono)

**Opción A – en la nube (recomendada):**
```bash
npx eas-cli@latest login
npx eas-cli@latest init          # vincula el proyecto (escribe EAS_PROJECT_ID)
npm run build:apk                # al terminar entrega un enlace/QR para descargar el APK
```

**Opción B – local (Windows/Linux/macOS con Android SDK y JDK 17):**
```bash
npx expo prebuild --platform android --clean
cd android
./gradlew assembleRelease        # Windows: gradlew.bat assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
adb install -r app/build/outputs/apk/release/app-release.apk
```
> El APK local queda firmado con la llave de *debug*; sirve para pruebas internas, no para
> Play Store. Para la tienda usa `eas build --profile production` (genera `.aab` firmado).

> ⚠️ **Windows: "Filename longer than 260 characters"** al compilar C++ (CMake/ninja).
> Windows limita las rutas a 260 caracteres y React Native genera rutas muy largas.
> `subst` **no** sirve (las dependencias se resuelven con la ruta real). Lo probado y que funciona:
> 1. El plugin `plugins/rutasCortasWindows.js` (ya activo en `app.config.ts`) mueve el
>    directorio de trabajo de CMake a `C:/r` (lo más corto posible: el límite de carpetas de ninja es 248).
> 2. Además, el proyecto debe estar en una ruta corta, por ejemplo `C:\mb`. Copia el **repo
>    completo** (la app usa `packages/core` y el `package-lock.json` de la raíz):
> ```powershell
> robocopy "C:\ruta\larga\mi-bodega-digital" C:\mb /E /XD node_modules android coverage .expo .git dist /XF *.log
> cd C:\mb; npm ci; cd mobile; npx expo prebuild --platform android --clean
> cd android
> .\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a   # teléfonos modernos (más rápido)
> .\gradlew.bat assembleRelease                                        # todas las arquitecturas
> ```
> Alternativas: clonar el repo directamente en una ruta corta (`C:\src\mbd`), habilitar
> `LongPathsEnabled` en Windows, o compilar en la nube con `npm run build:apk` (EAS).

### iOS (IPA)
Requiere una cuenta de **Apple Developer** (de pago). Desde cualquier sistema operativo:
```bash
npm run build:ios                # EAS pide las credenciales de Apple y firma en la nube
npx eas-cli@latest submit -p ios # opcional: subir a TestFlight
```
Para el simulador de iOS (solo en Mac): `npx eas-cli@latest build -p ios --profile development` con
`"ios": { "simulator": true }` en el perfil, o `npm run ios`.

## 7. Pruebas

```bash
npm run verify          # 127 pruebas + cobertura de dominio (~99 %)
```

**E2E (Maestro)** — con la app instalada en un emulador y una **cuenta de prueba**:
```bash
# Instalar Maestro: https://docs.maestro.dev/getting-started/installing-maestro
maestro test .maestro -e EMAIL=prueba@tudominio.pe -e PASSWORD=********
```
Los flujos (`.maestro/flujos`) cubren login, inventario, venta en efectivo, fiado con abono,
venta **sin conexión** (modo avión) con sincronización posterior, reportes y tema. Están
pensados para una cuenta vacía: crean el producto `E2E Gaseosa` y el cliente `E2E Cliente`.

## 8. Seguridad

- Ningún secreto en el código. La config web de Firebase no es secreta; la protección real
  son las **reglas de Firestore**.
- ⚠️ **Las reglas actuales del repo (`firestore.rules`) permiten a cualquier usuario
  autenticado leer/escribir los datos de TODAS las bodegas** (y el registro es libre).
  La propuesta corregida está en [`firebase/firestore.rules`](firebase/firestore.rules): cada
  usuario solo accede a `artifacts/{appId}/users/{su uid}`, con validación de tipos. Es
  compatible con la web y con la app. Para aplicarla (decisión del dueño del proyecto):
  ```bash
  # desde la raíz del repo, tras revisar el archivo
  cp mobile/firebase/firestore.rules firestore.rules
  firebase deploy --only firestore:rules
  ```

## 9. Guía de usuario

### Vender (POS)
1. Pestaña **Vender**: toca un producto para sumar 1 unidad (vibra al agregar). Busca por
   nombre (sin importar tildes) o por código de barras.
2. **📷 Escanear**: apunta al código; cada lectura suma 1 al carrito. Si el código no existe,
   la app ofrece crear el producto con ese código.
3. **Cobrar** → ajusta cantidades con − / + → elige **Efectivo**, **Yape/Plin** o **Fiado**
   (en fiado elige o crea el cliente) → **Confirmar venta**. El stock se descuenta solo.
4. Si se vende más de lo que hay en stock, la app lo advierte pero lo permite (igual que la web).

### Sin internet
- Puedes **seguir vendiendo**. Verás una franja amarilla “Sin conexión · n venta(s) guardada(s)”.
- Las ventas quedan guardadas en el teléfono y se envían solas al volver la señal (también al
  reabrir la app). Nunca se registran dos veces.
- Crear/editar productos, clientes o pagos de fiado requiere conexión.
- En **Ajustes → Ventas pendientes** ves lo que falta enviar y puedes reintentar.

### Inventario
- **+ Producto**: nombre, precio, stock (déjalo vacío para no controlarlo, p. ej. pan a granel)
  y código de barras (puedes escanearlo).
- Los productos con **stock ≤ 5** se resaltan en amarillo; los agotados, en rojo. Usa el filtro
  **Stock bajo** para hacer tu lista de compras.

### Fiado
- Arriba ves el **total por cobrar**. Cada cliente muestra su saldo (rojo = debe).
- En el detalle: **Fiar** (nueva deuda), **Registrar pago** (se propone la deuda más antigua),
  **Liquidar** una deuda puntual, **Llamar** o **Recordar por WhatsApp**.
- Estados de cada deuda: *Pendiente*, *Pago parcial*, *Cubierto* (pagada con abonos) o
  *Pagado* (marcada así desde la web).

### Reportes
- Hoy, ayer, 7 días, este mes o un rango. Muestra ingresos (efectivo + Yape/Plin, incluyendo
  cobros de fiado), lo fiado en el periodo, lo pendiente por cobrar, ingresos por día y el top 5
  de productos. Se actualiza en tiempo real.

### Ajustes
- Datos del negocio (nombre, RUC, dirección, días para considerar un fiado vencido), tema
  claro/oscuro/sistema, notificaciones de **stock bajo** y **recordatorio diario de fiados
  vencidos**, y cerrar sesión.

### Usar la web y la app a la vez
Funciona sobre los mismos datos. Recomendación: registra los **cobros de fiado** desde la app.
El botón “Pagar” de la web marca la deuda como pagada sin registrar el ingreso (no aparece en
reportes) — ver ARCHITECTURE.md §5, hallazgos B-01/B-02.

## 10. Estructura

```
mobile/
├── app.config.ts            # Config Expo (lee .env)
├── eas.json                 # Perfiles de build
├── firebase/firestore.rules # Reglas propuestas (no desplegadas)
├── .maestro/                # E2E
└── src/
    ├── domain/              # Reglas de negocio puras (sin React ni Firebase) + casos de uso
    ├── data/                # Firebase, mappers, outbox offline, caché
    ├── presentation/        # Pantallas, navegación, stores Zustand, tema
    ├── shared/              # Variables de entorno
    └── __tests__/           # Integración y UI
```
