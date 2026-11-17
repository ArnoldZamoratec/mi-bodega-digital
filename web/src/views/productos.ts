import { esStockBajo, filtrarProductos, type Producto } from '@bodegon/core';

import { datos, fuente, type EstadoDatos } from '../datos';
import { avisar, esc, esqueletoFilas, repintar, soles, vacio } from '../dom';
import { icono } from '../icons';
import { aplicarPermisos, permite } from '../sesion';
import { abrirEditorProducto } from './editores';

/**
 * Productos: primero "Se acaban" (la lista de compras), ajuste rápido de stock con −/+ y
 * edición en panel lateral.
 */
let raiz: HTMLElement | null = null;
let termino = '';
const stockVisible = (p: Producto): number | null => p.stock;

function htmlFila(p: Producto): string {
  const stock = stockVisible(p);
  // El cajero ve el stock, pero no lo ajusta ni edita productos (D-33, `editarProductos`).
  const edita = permite('editarProductos');
  const ctrl =
    stock === null
      ? `<span class="stock-sin-control">Sin control de stock</span>`
      : !edita
        ? `<span class="stock-sin-control">${esc(stock)} en stock</span>`
        : `<span class="stock-ctrl" role="group" aria-label="Stock de ${esc(p.nombre)}">
          <button type="button" class="btn-icono" data-stock="${esc(p.id)}" data-delta="-1" aria-label="Restar uno al stock de ${esc(p.nombre)}">${icono('minus', 18)}</button>
          <output aria-live="polite">${esc(stock)}</output>
          <button type="button" class="btn-icono" data-stock="${esc(p.id)}" data-delta="1" aria-label="Sumar uno al stock de ${esc(p.nombre)}">${icono('plus', 18)}</button>
        </span>`;
  const chip =
    stock !== null && stock <= 0
      ? '<span class="chip chip-agotado">Agotado</span>'
      : stock !== null && stock <= 5
        ? `<span class="chip chip-acaba">Quedan ${esc(stock)}</span>`
        : '';
  return `
    <li class="fila-prod">
      <div>
        <p class="fila-prod-nombre">${esc(p.nombre)}</p>
        ${chip}
      </div>
      <span class="fila-prod-precio">${esc(soles(p.precio))}</span>
      ${ctrl}
      ${edita ? `<button type="button" class="btn-icono" data-editar="${esc(p.id)}" aria-label="Editar ${esc(p.nombre)}">${icono('pencil', 18)}</button>` : '<span aria-hidden="true"></span>'}
    </li>`;
}

function pintar(): void {
  const cont = raiz?.querySelector('#productos-cuerpo');
  if (!cont) return;
  const lista = datos().productos;
  if (lista === null) {
    cont.innerHTML = esqueletoFilas(8);
    return;
  }
  if (lista.length === 0) {
    cont.innerHTML = permite('editarProductos')
      ? vacio({
          icono: 'package-plus',
          titulo: 'Todavía no tienes productos',
          texto: 'Agrega tu primer producto, toma 20 segundos: nombre, precio y, si quieres, cuántos tienes.',
          accion: { etiqueta: 'Agregar producto', atributo: 'data-nuevo-producto' },
        })
      : vacio({
          icono: 'package',
          titulo: 'La bodega aún no tiene productos',
          texto: 'El dueño los agrega desde su cuenta. Cuando lo haga, aparecerán aquí.',
        });
    return;
  }
  const filtrados = filtrarProductos(lista, termino);
  const bajos = filtrados
    .filter((p) => esStockBajo({ stock: stockVisible(p) }))
    .sort((a, b) => (stockVisible(a) ?? 0) - (stockVisible(b) ?? 0));
  const idsBajos = new Set(bajos.map((p) => p.id));
  const resto = filtrados.filter((p) => !idsBajos.has(p.id));

  const seAcaban = bajos.length
    ? `
    <section class="se-acaban" aria-labelledby="titulo-acaban">
      <h2 class="titulo-seccion se-acaban-titulo" id="titulo-acaban">${icono('alert', 20)} Se acaban (${bajos.length})</h2>
      <ul class="lista-productos">${bajos.map(htmlFila).join('')}</ul>
    </section>`
    : '';
  const todos = resto.length
    ? `<section aria-labelledby="titulo-todos">
        <h2 class="titulo-seccion" id="titulo-todos" style="margin-bottom:8px">${bajos.length ? 'Con stock' : 'Todos'} (${resto.length})</h2>
        <ul class="lista-productos">${resto.map(htmlFila).join('')}</ul>
      </section>`
    : '';
  repintar(
    cont,
    seAcaban + todos ||
      vacio({
        icono: 'search',
        titulo: `No hay "${termino}" en tus productos`,
        texto: permite('editarProductos') ? 'Revisa cómo se escribe o agrégalo.' : 'Revisa cómo se escribe.',
        ...(permite('editarProductos') ? { accion: { etiqueta: 'Agregar producto', atributo: 'data-nuevo-producto' } } : {}),
      }),
  );
}

async function ajustar(id: string, delta: number): Promise<void> {
  const p = datos().productos?.find((x) => x.id === id);
  if (!p || p.stock === null || !permite('editarProductos')) return;
  // Firestore aplica la escritura local al instante (el listener repinta en 0 ms).
  try {
    await fuente().ajustarStock(id, delta);
  } catch (error) {
    console.error('Error al ajustar stock:', error);
    avisar(`No se guardó el stock de ${p.nombre}. Revisa tu conexión.`, 'error');
  }
}

export function montarProductos(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista">
      <div class="cabecera-vista">
        <h1 class="titulo-pagina">Productos</h1>
      </div>
      <div class="barra-herramientas">
        <label class="busqueda">
          <span class="sr-only">Buscar en productos</span>
          ${icono('search', 20)}
          <input id="buscar-productos" type="search" class="entrada" placeholder="Busca un producto" autocomplete="off">
        </label>
        <button type="button" class="btn btn-primario" data-nuevo-producto data-permiso="editarProductos">${icono('plus', 18)} Nuevo producto</button>
      </div>
      <div id="productos-cuerpo"></div>
    </div>`;
  contenedor.querySelector('#buscar-productos')?.addEventListener('input', (e) => {
    termino = (e.target as HTMLInputElement).value;
    pintar();
  });
  contenedor.addEventListener('click', (e) => {
    const t = e.target as Element;
    const s = t.closest<HTMLElement>('[data-stock]');
    if (s?.dataset.stock) return void ajustar(s.dataset.stock, Number(s.dataset.delta));
    const ed = t.closest<HTMLElement>('[data-editar]');
    if (ed?.dataset.editar && permite('editarProductos')) {
      const p = datos().productos?.find((x) => x.id === ed.dataset.editar);
      if (p) abrirEditorProducto(p);
    }
  });
  pintar();
}

export const renderProductos = (_e: EstadoDatos): void => pintar();
export function mostrarProductos(): void {
  if (raiz) aplicarPermisos(raiz);
  pintar();
}
export function reiniciarProductos(): void {
  termino = '';
}
