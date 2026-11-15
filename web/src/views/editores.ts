import type { Cliente, Producto } from '@bodegon/core';

import { fuente, type DatosProducto } from '../datos';
import { abrirPanel, avisar, cerrarPanel, confirmarEnLinea, esc, estadoBoton, req } from '../dom';
import { icono } from '../icons';

/** Valores del formulario → documento `productos` (mismo formato que la v5.3). */
export function leerFormularioProducto(valores: {
  nombre: string;
  precio: string;
  stock: string;
}): DatosProducto {
  return {
    nombre: valores.nombre.trim(),
    precio: parseFloat(valores.precio.replace(',', '.')),
    stock: valores.stock.trim() ? parseInt(valores.stock, 10) : null,
  };
}

/** Mensaje de validación (o null): nombre, precio ≥ 0 y stock entero. */
export function validarProducto(p: DatosProducto): string | null {
  if (!p.nombre) return 'Escribe el nombre del producto.';
  if (!Number.isFinite(p.precio) || p.precio < 0) return 'El precio debe ser un número, por ejemplo 3.50.';
  if (p.stock !== null && !Number.isFinite(p.stock)) return 'El stock debe ser un número entero, o déjalo vacío.';
  return null;
}

/** Editor de producto en panel lateral (no modal a pantalla completa, ux-web §3). */
export function abrirEditorProducto(producto: Producto | null): void {
  const panel = abrirPanel(
    producto ? 'Editar producto' : 'Nuevo producto',
    `
    <form class="formulario" id="form-producto" novalidate>
      <label class="campo"><span>Nombre</span>
        <input class="entrada" name="nombre" required maxlength="120" autocomplete="off" value="${esc(producto?.nombre ?? '')}" autofocus>
      </label>
      <div class="dos-col">
        <label class="campo"><span>Precio (S/)</span>
          <input class="entrada entrada-monto" name="precio" inputmode="decimal" required value="${producto ? esc(producto.precio.toFixed(2)) : ''}" placeholder="0.00">
        </label>
        <label class="campo"><span>Stock</span>
          <input class="entrada" name="stock" inputmode="numeric" value="${producto && producto.stock !== null ? esc(producto.stock) : ''}" placeholder="Sin control">
        </label>
      </div>
      <p class="texto-sec">Deja el stock vacío si no quieres llevar la cuenta de ese producto.</p>
      <p class="mensaje-error" id="error-producto" role="alert" hidden></p>
      <div class="panel-pie fila-botones">
        <button type="submit" class="btn btn-primario">${producto ? 'Guardar cambios' : 'Agregar producto'}</button>
        <button type="button" class="btn btn-secundario" data-cerrar-panel>Cancelar</button>
      </div>
    </form>
    ${
      producto
        ? `<div id="zona-borrar-producto"><button type="button" class="btn btn-fantasma" data-borrar>${icono('trash', 18)} Eliminar producto</button></div>`
        : ''
    }`,
  );

  const form = req<HTMLFormElement>(panel, '#form-producto');
  const error = req(panel, '#error-producto');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = leerFormularioProducto({
      nombre: String(fd.get('nombre') ?? ''),
      precio: String(fd.get('precio') ?? ''),
      stock: String(fd.get('stock') ?? ''),
    });
    const invalido = validarProducto(datos);
    if (invalido) {
      error.textContent = invalido;
      error.hidden = false;
      return;
    }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    estadoBoton(btn, 'cargando', 'Guardando…');
    try {
      await fuente().guardarProducto(producto?.id ?? null, datos);
      cerrarPanel();
      avisar(producto ? 'Producto actualizado' : `${datos.nombre} agregado`);
    } catch (err) {
      console.error('Error al guardar producto:', err);
      estadoBoton(btn, 'error', 'No se guardó');
      error.textContent = 'No pudimos guardar el producto. Revisa tu conexión e intenta otra vez.';
      error.hidden = false;
    }
  });

  // Delegado: la confirmación en línea reemplaza y restaura el HTML de la zona.
  panel.addEventListener('click', async (ev) => {
    if (!producto || !(ev.target as Element).closest('[data-borrar]')) return;
    const zona = req(panel, '#zona-borrar-producto');
    const ok = await confirmarEnLinea(zona, {
      pregunta: `¿Eliminar ${producto.nombre}?`,
      detalle: 'Las ventas pasadas no cambian; solo deja de aparecer en el catálogo.',
      accion: 'Sí, eliminar',
    });
    if (!ok) return;
    try {
      await fuente().eliminarProducto(producto.id);
      cerrarPanel();
      avisar(`${producto.nombre} eliminado`);
    } catch (err) {
      console.error('Error al eliminar producto:', err);
      avisar('No pudimos eliminar el producto. Intenta otra vez.', 'error');
    }
  });
}

/** Alta/edición de cliente. `alGuardar` recibe el id (p. ej. para elegirlo en Vender). */
export function abrirEditorCliente(
  cliente: Cliente | null,
  opciones: { nombreInicial?: string; alGuardar?: (id: string) => void } = {},
): void {
  const panel = abrirPanel(
    cliente ? 'Editar cliente' : 'Nuevo cliente',
    `
    <form class="formulario" id="form-cliente" novalidate>
      <label class="campo"><span>Nombre</span>
        <input class="entrada" name="nombre" required maxlength="120" autocomplete="off" value="${esc(cliente?.nombre ?? opciones.nombreInicial ?? '')}" autofocus>
      </label>
      <label class="campo"><span>Celular (para recordarle por WhatsApp)</span>
        <input class="entrada" name="telefono" type="tel" inputmode="tel" maxlength="30" autocomplete="off" value="${esc(cliente?.telefono ?? '')}" placeholder="987 654 321">
      </label>
      <p class="mensaje-error" id="error-cliente" role="alert" hidden></p>
      <div class="panel-pie fila-botones">
        <button type="submit" class="btn btn-primario">${cliente ? 'Guardar cambios' : 'Agregar cliente'}</button>
        <button type="button" class="btn btn-secundario" data-cerrar-panel>Cancelar</button>
      </div>
    </form>`,
  );
  const form = req<HTMLFormElement>(panel, '#form-cliente');
  const error = req(panel, '#error-cliente');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const datos = {
      nombre: String(fd.get('nombre') ?? '').trim(),
      telefono: String(fd.get('telefono') ?? '').trim(),
    };
    if (!datos.nombre) {
      error.textContent = 'Escribe el nombre del cliente.';
      error.hidden = false;
      return;
    }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    estadoBoton(btn, 'cargando', 'Guardando…');
    try {
      const id = await fuente().guardarCliente(cliente?.id ?? null, datos);
      cerrarPanel();
      avisar(cliente ? 'Cliente actualizado' : `${datos.nombre} agregado`);
      opciones.alGuardar?.(id);
    } catch (err) {
      console.error('Error al guardar cliente:', err);
      estadoBoton(btn, 'error', 'No se guardó');
      error.textContent = 'No pudimos guardar el cliente. Revisa tu conexión e intenta otra vez.';
      error.hidden = false;
    }
  });
}
