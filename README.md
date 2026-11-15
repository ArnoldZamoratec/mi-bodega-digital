# 🏪 Mi Bodega Digital

Sistema de gestión integral para bodegas y pequeños negocios, desarrollado con Firebase y JavaScript vanilla.

[![Firebase](https://img.shields.io/badge/Firebase-Hosting-orange)](https://bodega-difital.web.app)
[![Version](https://img.shields.io/badge/Version-5.3-green)](https://github.com/ArnoldZamoratec/mi-bodega-digital)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

## 🌐 Demo en Vivo

**URL**: [https://bodega-difital.web.app](https://bodega-difital.web.app)

## 🧱 Estructura (monorepo, npm workspaces)

| Carpeta | Qué es |
|---|---|
| `packages/core` | **`@bodegon/core`**: reglas de negocio en TypeScript puro (dinero en céntimos, saldo y FIFO de fiado, reportes con fecha efectiva `creadaEn ?? fecha`, ventas/anulaciones, recordatorio de WhatsApp). Lo usan la web y la app: **una sola fuente de verdad**. |
| `web/` | App web: Vite + TypeScript, Tailwind v3 compilado, Firebase y Chart.js por npm, PWA. Se publica `web/dist`. |
| `mobile/` | App Expo (React Native). Importa el core como `@/domain/...` (alias a `packages/core/src`). |

```bash
npm install            # una vez, en la raíz
npm run dev:web        # web en http://localhost:5173
npm run build:web      # genera web/dist (lo que publica Firebase Hosting)
npm test               # core (Jest) + web (Vitest) + móvil (Jest)
npm run verify         # typecheck + lint + pruebas + build (lo mismo que CI)
```

CI: `.github/workflows/ci.yml` corre lo mismo en cada push y pull request.

## ✨ Características

### 💰 Sistema de Ventas (POS)
- Búsqueda rápida de productos
- Carrito de compras interactivo
- Múltiples métodos de pago:
  - Efectivo
  - Yape/Plin
  - Fiado (crédito)
- Actualización automática de inventario

### 📦 Gestión de Inventario
- Agregar y editar productos
- Control de stock en tiempo real
- Alertas de stock bajo
- Gestión de precios

### 👥 Sistema de Fiado
- Registro de clientes
- Gestión de deudas
- Pagos parciales y totales
- Historial completo de transacciones

### 📊 Reportes Avanzados
- Actualización en tiempo real
- Gráficos interactivos de ventas
- Top 5 productos más vendidos
- Filtros por rango de fechas
- Resumen de ingresos por método de pago

## 🚀 Tecnologías

- **Frontend**: HTML5, CSS3, JavaScript (Vanilla)
- **Backend**: Firebase
  - Authentication (Email/Password + Google)
  - Cloud Firestore (Database)
  - Hosting
- **UI Framework**: Tailwind CSS (CDN)
- **Charts**: Chart.js

## 📋 Requisitos Previos

- Navegador web moderno
- Cuenta de Firebase (para deployment)
- Node.js y npm (para Firebase CLI)

## 🛠️ Instalación

### 1. Clonar el repositorio
```bash
git clone https://github.com/ArnoldZamoratec/mi-bodega-digital.git
cd mi-bodega-digital
```

### 2. Configurar Firebase

1. Crea un proyecto en [Firebase Console](https://console.firebase.google.com)
2. Habilita Authentication (Email/Password y Google)
3. Crea una base de datos Firestore
4. Copia la configuración de Firebase

### 3. Actualizar configuración

Edita `js/firebase.js` con tu configuración de Firebase:

```javascript
const firebaseConfig = {
    apiKey: "TU_API_KEY",
    authDomain: "TU_AUTH_DOMAIN",
    projectId: "TU_PROJECT_ID",
    storageBucket: "TU_STORAGE_BUCKET",
    messagingSenderId: "TU_MESSAGING_SENDER_ID",
    appId: "TU_APP_ID",
    measurementId: "TU_MEASUREMENT_ID"
};
```

### 4. Desplegar en Firebase

```bash
# Instalar Firebase CLI
npm install -g firebase-tools

# Login
firebase login

# Inicializar (si es necesario)
firebase init hosting

# Desplegar (el predeploy de firebase.json ejecuta `npm run build:web` y publica web/dist)
firebase deploy --only hosting
```

> La cabecera `Content-Security-Policy-Report-Only` (fuente: `web/csp.config.ts`) solo informa.
> Tras verificar en producción que el login con Google no muestra violaciones en la consola,
> cambiarla a `Content-Security-Policy` en ambos archivos.

## 📱 Uso

### Primer Acceso

1. Visita la URL de tu aplicación
2. Crea una cuenta con email/password o Google
3. Inicia sesión

### Flujo de Trabajo

1. **Agregar Productos**: Ve a "Inventario" y agrega tus productos
2. **Registrar Clientes**: En "Fiado", registra clientes para ventas a crédito
3. **Realizar Ventas**: Usa el POS para vender productos
4. **Ver Reportes**: Consulta estadísticas en la pestaña "Reportes"

## 🏗️ Estructura del Proyecto

```
mi-bodega-digital/
├── index.html              # Página principal
├── css/
│   └── style.css          # Estilos personalizados
├── js/
│   ├── main.js            # Punto de entrada
│   ├── firebase.js        # Configuración Firebase
│   ├── handlers.js        # Event handlers
│   ├── store.js           # Estado global
│   ├── ui.js              # Funciones UI
│   └── modules/
│       ├── pos.js         # Sistema de ventas
│       ├── inventory.js   # Gestión de inventario
│       ├── clients.js     # Gestión de clientes
│       └── reports.js     # Reportes y gráficos
├── firebase.json          # Configuración hosting
└── .firebaserc           # Proyecto Firebase
```

## 🔒 Seguridad

- Autenticación requerida para acceder
- Datos separados por usuario
- Firestore Security Rules implementadas
- Sesión persistente en el navegador

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📝 Changelog

### v5.3 (2026-02-11)
- 🌙 **Modo Oscuro/Claro**: Toggle entre temas con persistencia en localStorage
- 🕐 **Reloj en Header**: Fecha y hora en tiempo real (DD/MM/YYYY HH:MM:SS)
- 🔕 **Alertas Optimizadas**: Reducción de toasts excesivos para mejor UX
- 🎨 **Dark Mode CSS**: Variables de tema y transiciones suaves
- ⚡ **Mejor Feedback**: Feedback visual sin interrupciones constantes

### v5.2 (2026-02-11)
- 🟢 **Verde + Blanco**: Nueva paleta de confianza y cercanía
- 🌿 **Color Principal**: Verde esmeralda (#059669) en lugar de azul
- ✨ **Fondo Suave**: Gradiente verde claro (#ecfdf5 → #d1fae5)
- 💚 **Psicología del Color**: Verde transmite confianza, crecimiento y cercanía
- 🎨 **Diseño Fresco**: Perfecto para aplicaciones de bodega y comercio local

### v5.1 (2026-02-11)
- 🎨 **Paleta Profesional**: Cambio de colores morados a azules/grises sobrios
- 🔧 **Corrección de Versiones**: Actualización de imports a v5.1 para evitar caché
- 💎 **Colores Corporativos**: Azul (#2563eb), Verde (#059669), Rojo (#dc2626)
- ✅ **Estabilidad**: Correcciones en módulos POS y Reportes

### v5.0 (2026-02-11)
- ✨ **Diseño Moderno Premium**: Sistema completo de diseño con gradientes vibrantes
- 🎨 **Glassmorphism**: Efectos de vidrio translúcido en tarjetas y modales
- ⚡ **Animaciones Suaves**: Transiciones y micro-interacciones en toda la app
- 🎯 **Iconos SVG**: Iconografía moderna en todos los módulos
- 💎 **Paleta de Colores**: Gradientes púrpura-azul, verde esmeralda, y más
- 🚀 **Mejoras UX**: Botones con hover lift, loading spinners, mejor jerarquía visual
- 📱 **Optimización Visual**: Cards mejoradas, sombras dinámicas, tipografía premium

### v4.0 (2026-02-10)
- ✅ Removido panel de depuración
- ✅ Código optimizado para producción
- ✅ Actualización de todos los módulos
- ✅ Mejoras de rendimiento

### v3.1
- Reportes en tiempo real
- Gráficos interactivos
- Sistema de fiado mejorado

## 📄 Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo `LICENSE` para más detalles.

## 👨‍💻 Autor

**Arnold Zamora**
- GitHub: [@ArnoldZamoratec](https://github.com/ArnoldZamoratec)
- Email: arnoldzamoratec@gmail.com

## 🙏 Agradecimientos

- Firebase por la infraestructura
- Tailwind CSS por el framework de estilos
- Chart.js por las visualizaciones

---

**Desarrollado con ❤️ por ARNOLD CODE**
