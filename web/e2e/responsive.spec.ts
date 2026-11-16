import { expect, test, type Page } from '@playwright/test';

/**
 * Matriz de dispositivos de una bodega peruana (docs/ux-web.md § Responsive).
 * `tactil`: el contexto emula pantalla táctil (pointer: coarse).
 */
interface Dispositivo {
  nombre: string;
  width: number;
  height: number;
  tactil: boolean;
}

const MATRIZ: Dispositivo[] = [
  { nombre: 'Android 320', width: 320, height: 568, tactil: true },
  { nombre: 'Android 360', width: 360, height: 640, tactil: true },
  { nombre: 'Android 360 alto', width: 360, height: 800, tactil: true },
  { nombre: 'iPhone 375', width: 375, height: 667, tactil: true },
  { nombre: 'iPhone 390', width: 390, height: 844, tactil: true },
  { nombre: 'iPhone 430', width: 430, height: 932, tactil: true },
  { nombre: 'Celular echado 640', width: 640, height: 360, tactil: true },
  { nombre: 'Celular echado 844', width: 844, height: 390, tactil: true },
  { nombre: 'Celular echado 932', width: 932, height: 430, tactil: true },
  { nombre: 'Tablet 600', width: 600, height: 960, tactil: true },
  { nombre: 'Tablet 768', width: 768, height: 1024, tactil: true },
  { nombre: 'Tablet 820', width: 820, height: 1180, tactil: true },
  { nombre: 'Tablet 960 echada', width: 960, height: 600, tactil: true },
  { nombre: 'Tablet 1024 echada', width: 1024, height: 768, tactil: true },
  { nombre: 'Tablet 1180 echada', width: 1180, height: 820, tactil: true },
  { nombre: 'POS 1280', width: 1280, height: 800, tactil: true },
  { nombre: 'POS 1024', width: 1024, height: 600, tactil: true },
  { nombre: 'Laptop 1280', width: 1280, height: 720, tactil: false },
  { nombre: 'Laptop 1366', width: 1366, height: 768, tactil: false },
  { nombre: 'Escritorio 1920', width: 1920, height: 1080, tactil: false },
  { nombre: 'Monitor 2560', width: 2560, height: 1440, tactil: false },
  // Zoom del navegador al 200 % en una laptop de 1366×768 = viewport CSS de 683×384.
  { nombre: 'Laptop 1366 con zoom 200 %', width: 683, height: 384, tactil: false },
];

/** Escala de fuente de Android al 130 % (raíz de 20.8 px) en una muestra de la matriz. */
const LETRA_GRANDE = ['Android 320', 'Android 360', 'Celular echado 844', 'Tablet 768', 'POS 1024', 'Laptop 1366'];

const PANTALLAS: Array<{ nombre: string; ruta: string }> = [
  { nombre: 'Ingreso', ruta: '/?demo=1&pantalla=login' },
  { nombre: 'Hoy', ruta: '/?demo=1#hoy' },
  { nombre: 'Por cobrar', ruta: '/?demo=1#cobrar' },
  { nombre: 'Productos', ruta: '/?demo=1#productos' },
  { nombre: 'Caja abierta', ruta: '/?demo=1#caja' },
  { nombre: 'Caja cerrada', ruta: '/?demo=1&caja=cerrada#caja' },
  { nombre: 'Reportes', ruta: '/?demo=1#reportes' },
  { nombre: 'Ajustes', ruta: '/?demo=1#ajustes' },
];

async function desbordeHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.scrollingElement!;
    return d.scrollWidth - d.clientWidth;
  });
}

/** El elemento está completo dentro del viewport y nada lo tapa (barra, hoja, velo). */
async function aLaVista(page: Page, selector: string): Promise<boolean> {
  return page.evaluate((sel) => {
    const el = [...document.querySelectorAll<HTMLElement>(sel)].find((e) => e.getClientRects().length > 0);
    if (!el) return false;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) return false;
    if (b.top < -1 || b.left < -1 || b.bottom > innerHeight + 1 || b.right > innerWidth + 1) return false;
    const encima = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return !!encima && (el === encima || el.contains(encima));
  }, selector);
}

async function agregarProductos(page: Page, n: number): Promise<void> {
  await page.locator('#catalogo [data-producto]').first().waitFor();
  await page.evaluate((cuantos) => {
    // Cada clic repinta el catálogo: se vuelve a buscar el botón cada vez.
    for (let i = 0; i < cuantos; i++) {
      const botones = document.querySelectorAll<HTMLElement>('#catalogo [data-producto]');
      botones[i % botones.length]!.click();
    }
    window.scrollTo(0, 0);
  }, n);
}

async function esperarAnimaciones(page: Page): Promise<void> {
  await page.waitForTimeout(300);
}

for (const d of MATRIZ) {
  for (const letraGrande of [false, true]) {
    if (letraGrande && !LETRA_GRANDE.includes(d.nombre)) continue;
    const etiqueta = `${d.nombre} (${d.width}×${d.height})${letraGrande ? ' con letra al 130 %' : ''}`;

    test.describe(etiqueta, () => {
      test.use({ viewport: { width: d.width, height: d.height }, hasTouch: d.tactil });

      test.beforeEach(async ({ page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        if (letraGrande) {
          await page.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
              document.documentElement.style.fontSize = '20.8px';
            });
          });
        }
      });

      test('Vender: total y Cobrar a la vista, sin scroll horizontal', async ({ page }) => {
        await page.goto('/?demo=1#vender');
        for (const items of [4, 14]) {
          await agregarProductos(page, items === 4 ? 4 : 10);
          await esperarAnimaciones(page);
          expect(await desbordeHorizontal(page), `desborde con ${items} ítems`).toBeLessThanOrEqual(0);
          const hoja = await page.locator('#hoja-resumen').isVisible();
          if (hoja) {
            // Celular vertical: con la hoja cerrada, el resumen muestra el total y "Cobrar".
            expect(await aLaVista(page, '#hoja-cobrar'), 'Cobrar en el resumen de la hoja').toBe(true);
            expect(await aLaVista(page, '.hoja-total'), 'total en el resumen de la hoja').toBe(true);
            await page.locator('#hoja-resumen').click();
            await esperarAnimaciones(page);
          }
          expect(await aLaVista(page, '#btn-cobrar'), `Cobrar a la vista con ${items} ítems`).toBe(true);
          // Con la hoja abierta, el total grande sigue en su cabecera aunque el ticket ceda alto.
          const total = (await aLaVista(page, '#ticket-total')) || (hoja && (await aLaVista(page, '.hoja-total')));
          expect(total, `total a la vista con ${items} ítems`).toBe(true);
          if (hoja) {
            await page.locator('#hoja-resumen').click();
            await esperarAnimaciones(page);
          }
        }
      });

      test('Por cobrar: la vista previa de WhatsApp cabe y su botón queda a la vista', async ({ page }) => {
        await page.goto('/?demo=1#cobrar');
        await page.locator('[data-recordar]:visible').first().click();
        await esperarAnimaciones(page);
        expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
        expect(await aLaVista(page, '#abrir-wa'), 'Abrir WhatsApp a la vista').toBe(true);
      });

      for (const p of PANTALLAS) {
        test(`${p.nombre}: sin scroll horizontal`, async ({ page }) => {
          await page.goto(p.ruta);
          await page.waitForTimeout(900);
          expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
        });
      }
    });
  }
}
