/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

import { CSP_HEADER, CSP_POLICY } from './csp.config.ts';

export default defineConfig({
  // 404.html va en public/ y se copia tal cual (página estática de Firebase Hosting).
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Sin sourcemaps en el deploy: Firebase Hosting los publicaría (≈4 MB) sin beneficio.
    sourcemap: false,
    target: 'es2022',
    rolldownOptions: {
      output: {
        // Firebase y Chart.js en chunks propios: cambian poco y quedan en caché entre deploys.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/]@?firebase/ },
            { name: 'chart', test: /node_modules[\\/](chart\.js|@kurkle)/ },
          ],
        },
      },
    },
    // Auth + Firestore del SDK modular pesan ~580 kB minificados (~175 kB gzip) por sí solos.
    chunkSizeWarningLimit: 650,
  },
  // Mismo CSP que firebase.json en `vite preview`, para probar el login con Google en local.
  preview: { headers: { [CSP_HEADER]: CSP_POLICY } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      // El registro se hace desde main.ts (virtual:pwa-register): sin scripts inline (CSP).
      injectRegister: false,
      includeAssets: ['icons/favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Bodegón Digital',
        short_name: 'Bodegón',
        description: 'Punto de venta, inventario, fiado y reportes para tu bodega.',
        lang: 'es-PE',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FAF7F2',
        theme_color: '#0B6B4F',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo el "app shell". Los datos siguen viniendo de Firestore en vivo (sin caché propia).
        globPatterns: ['**/*.{js,css,html,png,svg,ico,webmanifest,woff2}'],
        navigateFallback: '/index.html',
        // CRÍTICO: las rutas reservadas de Firebase Hosting (/__/auth/handler, /__/auth/iframe,
        // /__/firebase/init.json) NUNCA deben responderse con index.html desde el service
        // worker: romperían el popup de inicio de sesión con Google.
        navigateFallbackDenylist: [/^\/__\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts'],
    restoreMocks: true,
  },
});
