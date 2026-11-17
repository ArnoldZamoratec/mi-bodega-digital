import { expect, test, type Page } from '@playwright/test';

/**
 * Cajeros y roles (D-33) en modo demo: Ajustes → Equipo del dueño, la interfaz del cajero
 * (`?rol=cajero`) y la pantalla de acceso en pausa (`?acceso=desactivado`). La demo trae a Rosa
 * (activa), a Pedro (en pausa) y una invitación sin usar.
 */
async function desbordeHorizontal(page: Page): Promise<number> {
  return page.evaluate(() => {
    const d = document.scrollingElement!;
    return d.scrollWidth - d.clientWidth;
  });
}

for (const vp of [
  { nombre: 'celular 360', width: 360, height: 740 },
  { nombre: 'laptop 1366', width: 1366, height: 768 },
]) {
  test.describe(`Equipo (${vp.nombre})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test('el dueño invita, ve el tope de 3 y quita a un cajero', async ({ page }) => {
      await page.goto('/?demo=1#equipo');
      const vista = page.locator('#vista-equipo');
      await expect(vista.getByRole('heading', { name: 'Equipo', level: 1 })).toBeVisible();
      await expect(vista.locator('[data-fila-cajero="cajero-rosa"]')).toContainText('Rosa');
      await expect(vista.locator('[data-fila-cajero="cajero-pedro"]')).toContainText('En pausa');
      await expect(vista.locator('[data-fila-invitacion="KPMX7QRT"]')).toContainText('KPMX-7QRT');
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);

      // Rosa activa + 1 invitación sin usar: queda 1 cupo. Se invita y aparece el código.
      await expect(vista.locator('#equipo-cupos')).toContainText('Te queda 1 cupo');
      await vista.locator('[data-invitar]').click();
      const codigo = vista.locator('#codigo-nuevo');
      await expect(codigo).toHaveText(/^[A-HJKMNP-Z2-9]{4}-[A-HJKMNP-Z2-9]{4}$/);
      const wa = vista.getByRole('link', { name: 'Enviar por WhatsApp' });
      await expect(wa).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=Hola%2C%20te%20invito/);
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
      await vista.locator('[data-listo]').click();

      // Sin cupos: activar a Pedro no se permite.
      await expect(vista.locator('[data-invitar]')).toBeDisabled();
      await vista.locator('[data-activo="cajero-pedro"]').click();
      await expect(vista.locator('#error-equipo')).toContainText('3 cajeros activos');

      // Quitar a Rosa con confirmación en la página.
      await vista.locator('[data-quitar="cajero-rosa"]').click();
      await vista.getByRole('button', { name: 'Sí, quitar' }).click();
      await expect(vista.locator('[data-fila-cajero="cajero-rosa"]')).toHaveCount(0);
    });

    test('el cajero no ve Reportes, Equipo ni la edición de productos', async ({ page }) => {
      await page.goto('/?demo=1&rol=cajero#reportes');
      // Una ruta prohibida lleva a Hoy.
      await expect(page).toHaveURL(/#hoy$/);
      await expect(page.locator('#vista-hoy')).toBeVisible();
      await expect(page.locator('[data-nav="reportes"]:visible')).toHaveCount(0);
      await expect(page.locator('#vista-hoy')).toContainText('registradas por ti');

      await page.goto('/?demo=1&rol=cajero#equipo');
      await expect(page).toHaveURL(/#hoy$/);

      await page.goto('/?demo=1&rol=cajero#productos');
      await expect(page.locator('#vista-productos [data-nuevo-producto]')).toBeHidden();
      await expect(page.locator('#vista-productos [data-editar]')).toHaveCount(0);

      await page.goto('/?demo=1&rol=cajero#ajustes');
      await expect(page.locator('#vista-ajustes')).toContainText('Bodega donde trabajas');
      await expect(page.locator('#vista-ajustes a[href="#equipo"]')).toHaveCount(0);
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
    });

    test('caja del dueño: "Quién vendió" y "Vendió: Rosa"', async ({ page }) => {
      await page.goto('/?demo=1#caja');
      const caja = page.locator('#vista-caja');
      await expect(caja.locator('.tabla-cierres')).toBeVisible();
      // La demo abre la caja de hoy a las 8:05 (Lima): antes de esa hora no hay turno que mirar.
      test.skip((await caja.locator('#form-apertura').count()) > 0, 'Sin caja abierta en la demo a esta hora');
      await expect(caja.locator('#caja-autores')).toContainText('Vendió: Rosa');
      await expect(caja.locator('#caja-ventas')).toContainText('Vendió: Rosa');
      await expect(caja.locator('.tabla-cierres')).toContainText('Cerró: Rosa');
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
    });

    test('cajero en pausa: mensaje claro y "Tengo un código" con el formato ABCD-EFGH', async ({ page }) => {
      await page.goto('/?demo=1&acceso=desactivado');
      await expect(page.getByRole('heading', { name: /está en pausa/ })).toBeVisible();
      expect(await desbordeHorizontal(page)).toBeLessThanOrEqual(0);
      await page.getByRole('button', { name: 'Tengo un código' }).click();
      const campo = page.locator('#codigo-invitacion');
      await campo.pressSequentially('kpmx7qrt');
      await expect(campo).toHaveValue('KPMX-7QRT');
    });
  });
}
