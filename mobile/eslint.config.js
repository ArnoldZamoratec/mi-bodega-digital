// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', 'coverage/*', 'android/*', 'ios/*', '.expo/*'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // TypeScript ya valida los namespaces; el plugin no resuelve `export *` de enums en .d.ts.
      'import/namespace': 'off',
    },
  },
  {
    // firebase/ es un proyecto npm aparte (pruebas de reglas con el emulador) con sus propias
    // dependencias; no se instalan con el monorepo, así que no se resuelven desde aquí.
    files: ['firebase/**'],
    rules: { 'import/no-unresolved': 'off' },
  },
]);
