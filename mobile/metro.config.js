// Metro para el monorepo (npm workspaces: packages/*, web, mobile).
//
// Según https://docs.expo.dev/guides/monorepos/ (SDK 52+, aquí SDK 58), `expo/metro-config`
// configura el monorepo AUTOMÁTICAMENTE: agrega la raíz del repo a `watchFolders` y su
// `node_modules` a la resolución. La guía pide expresamente NO fijar a mano `watchFolders`,
// `resolver.nodeModulesPaths`, `resolver.extraNodeModules` ni `resolver.disableHierarchicalLookup`
// (esos ajustes eran para SDK < 52 y hoy rompen la detección automática).
//
// El core compartido (packages/core/src) se importa con las rutas de siempre `@/domain/...`:
// Metro las resuelve con los `paths` de tsconfig.json (soporte nativo de Expo), y el archivo
// queda dentro de la raíz del monorepo que Expo ya vigila.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
