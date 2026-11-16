import { defineConfig } from '@playwright/test';

/**
 * Regresión responsive (`npm run test:responsive -w web`). Necesita Chromium de Playwright:
 * `npx playwright install chromium` (una vez por máquina). No forma parte de `npm run verify`
 * porque el CI no siempre puede descargar navegadores. Ver docs/ux-web.md § Responsive.
 *
 * Corre contra el servidor de desarrollo porque el modo demo (`/?demo=1`) solo existe en
 * desarrollo: el build de producción lo elimina.
 */
const PUERTO = 5397;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PUERTO}`,
    browserName: 'chromium',
    deviceScaleFactor: 1,
  },
  webServer: {
    command: `npx vite --port ${PUERTO} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PUERTO}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
