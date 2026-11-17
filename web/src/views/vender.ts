import {
  advertenciasDeStock,
  armarOperacionVenta,
  ErrorDominio,
  filtrarProductos,
  normalizarTexto,
  parsearSoles,
  saldosPorCliente,
  totalCarrito,
  type Cliente,
  type MetodoPagoVenta,
  type OperacionVenta,
  type Producto,
} from '@bodegon/core';

import { datos, fuente, type EstadoDatos } from '../datos';
import { avisar, esc, esqueletoFilas, estadoBoton, punteroFino, repintar, req, soles, vacio } from '../dom';
import { icono } from '../icons';
import { crearVentanaDeshacer } from '../logic/deshacer';
import { permite } from '../sesion';
import { accionTecla, esCampoTexto } from '../logic/teclado';
import { billetes, estadoPago } from '../logic/vuelto';
import {
  addToCartState,
  clearCart,
  getCart,
  removeFromCartState,
  restaurarCarrito,
} from '../store';
import { abrirEditorCliente } from './editores';
import { resumenUnidades, ticketEnCurso, ticketImpreso } from './ticket';

/**
 * Vender (85 % del uso): catálogo de botones grandes + ticket de papel fijo a la derecha
 * (hoja inferior en el celular). Una sola acción principal: "Cobrar S/ X".
 */
type Fase = 'armando' | 'cobrando' | 'listo';

interface UltimaVenta {
  op: OperacionVenta;
  recibido: number | null;
  vuelto: number | null;
  cliente: string | null;
  fecha: Date;
}

let raiz: HTMLElement | null = null;
let fase: Fase = 'armando';
let metodo: MetodoPagoVenta = 'Efectivo';
let recibido = '';
let clienteId: string | null = null;
let buscaCliente = '';
let opcionActiva = 0;
let destello: string | null = null;
let ultima: UltimaVenta | null = null;
let errorCobro = '';
let tickDeshacer: ReturnType<typeof setInterval> | null = null;

const ventana = crearVentanaDeshacer(() => {
  pararTick();
  pintarCobro();
});

function pararTick(): void {
  if (tickDeshacer) clearInterval(tickDeshacer);
  tickDeshacer = null;
}

const negocio = (): string => datos().nombreBodega ?? 'Tu bodega';
const productos = (): Producto[] => datos().productos ?? [];
const clientes = (): Cliente[] => datos().clientes ?? [];

const busqueda = (): HTMLInputElement | null => raiz?.querySelector<HTMLInputElement>('#buscar') ?? null;

export function resultados(): Producto[] {
  return filtrarProductos(productos(), busqueda()?.value ?? '');
}

// ---------- Catálogo ----------
function stockHtml(p: Producto): string {
  if (p.stock === null) return '';
  if (p.stock <= 0) return '<span class="prod-stock agotado">Agotado</span>';
  if (p.stock <= 5) return `<span class="prod-stock acaba">Quedan ${esc(p.stock)}</span>`;
  return `<span class="prod-stock">${esc(p.stock)} en stock</span>`;
}

function pintarCatalogo(): void {
  const cont = raiz?.querySelector('#catalogo');
  if (!cont) return;
  if (datos().productos === null) {
    cont.innerHTML = Array.from({ length: 12 }, () => esqueletoFilas(1, 'esq-prod')).join('');
    return;
  }
  // El cajero no crea productos (D-33): sin el botón "Agregar producto".
  const agregar = permite('editarProductos')
    ? { accion: { etiqueta: 'Agregar producto', atributo: 'data-ir="productos" data-nuevo-producto' } }
    : {};
  if (productos().length === 0) {
    cont.innerHTML = `<div class="catalogo-vacio">${vacio({
      icono: 'package-plus',
      titulo: 'Tu catálogo está vacío',
      texto: permite('editarProductos')
        ? 'Agrega tu primer producto, toma 20 segundos. Después aparece aquí como un botón.'
        : 'El dueño agrega los productos desde su cuenta. Cuando lo haga, aparecerán aquí.',
      ...agregar,
    })}</div>`;
    return;
  }
  const lista = resultados();
  const termino = busqueda()?.value.trim() ?? '';
  if (lista.length === 0) {
    cont.innerHTML = `<div class="catalogo-vacio">${vacio({
      icono: 'search',
      titulo: `No hay "${termino}" en tu catálogo`,
      texto: permite('editarProductos')
        ? 'Revisa cómo se escribe, o agrégalo como producto nuevo.'
        : 'Revisa cómo se escribe. Si falta, avísale al dueño para que lo agregue.',
      ...agregar,
    })}</div>`;
    return;
  }
  const enTicket = new Map(getCart().map((i) => [i.id, i.cantidad]));
  const html = lista
    .map((p, i) => {
      const cant = enTicket.get(p.id);
      const primero = i === 0 && termino !== '';
      return `
      <button type="button" class="prod${primero ? ' primero' : ''}${destello === p.id ? ' destello' : ''}" data-producto="${esc(p.id)}"
        aria-label="${esc(p.nombre)}, ${esc(soles(p.precio))}${cant ? `, ${cant} en el ticket` : ''}">
        <span class="prod-nombre">${esc(p.nombre)}</span>
        ${cant ? `<span class="prod-en-ticket" aria-hidden="true">${esc(cant)}</span>` : ''}
        ${primero ? '<kbd class="prod-enter" aria-hidden="true">Enter</kbd>' : ''}
        <span class="prod-pie"><span class="prod-precio">${esc(soles(p.precio))}</span>${stockHtml(p)}</span>
      </button>`;
    })
    .join('');
  repintar(cont, html);
}

// ---------- Ticket ----------
function avisoStock(id: string): string | null {
  const adv = advertenciasDeStock(getCart(), productos()).find((a) => a.id === id);
  if (!adv) return null;
  return adv.disponible <= 0 ? 'sin stock registrado' : `solo quedan ${adv.disponible}`;
}

function pintarTicket(): void {
  const zona = raiz?.querySelector('#ticket-zona');
  if (!zona) return;
  if (fase === 'listo' && ultima) {
    zona.innerHTML = ticketImpreso({
      negocio: negocio(),
      fecha: ultima.fecha,
      items: ultima.op.venta.items,
      total: ultima.op.venta.total,
      metodo: ultima.op.venta.metodoDePago,
      recibido: ultima.recibido,
      vuelto: ultima.vuelto,
      cliente: ultima.cliente,
      sello: true,
    });
  } else {
    repintar(
      zona,
      ticketEnCurso(getCart(), {
        negocio: negocio(),
        ahora: new Date(),
        destello,
        avisoStock: (id) => avisoStock(id),
      }),
    );
  }
  pintarResumenHoja();
}

function pintarResumenHoja(): void {
  const r = raiz?.querySelector('#hoja-resumen-texto');
  if (!r) return;
  const cart = getCart();
  // El total va en grande también con la hoja cerrada: se ve sin abrir el ticket.
  r.innerHTML =
    fase === 'listo'
      ? 'Venta registrada<small>Toca para abrir o cerrar el ticket</small>'
      : cart.length
        ? `<span class="hoja-total">${esc(soles(totalCarrito(cart)))}</span><small>${esc(resumenUnidades(cart))} · ver ticket</small>`
        : 'Ticket vacío<small>Toca un producto para agregarlo</small>';
  const btn = raiz?.querySelector<HTMLButtonElement>('#hoja-cobrar');
  if (btn) {
    btn.hidden = fase === 'listo' || cart.length === 0;
  }
}

// ---------- Cobro ----------
function htmlVuelto(): string {
  const total = totalCarrito(getCart());
  return `
    <div class="vuelto">
      <label class="etiqueta" for="recibido">Paga con (opcional)</label>
      <div class="vuelto-fila">
        <input id="recibido" class="entrada entrada-monto" inputmode="decimal" autocomplete="off" placeholder="S/ 0.00" value="${esc(recibido)}">
        <div class="billetes" role="group" aria-label="Billetes">
          ${billetes(total)
            .map(
              (b) =>
                `<button type="button" data-billete="${b.monto}" ${b.alcanza ? '' : 'disabled'} aria-label="Paga con un billete de ${b.monto} soles">${b.monto}</button>`,
            )
            .join('')}
        </div>
      </div>
      <p class="vuelto-resultado" id="vuelto-res" aria-live="polite"></p>
    </div>`;
}

function pintarVueltoResultado(): void {
  const el = raiz?.querySelector('#vuelto-res');
  if (!el) return;
  const e = estadoPago(totalCarrito(getCart()), recibido);
  el.classList.toggle('falta', e.tipo === 'falta');
  el.innerHTML =
    e.tipo === 'vuelto'
      ? `<span>Vuelto</span><strong>${esc(soles(e.monto))}</strong>`
      : e.tipo === 'falta'
        ? `<span>Faltan</span><strong>${esc(soles(e.monto))}</strong>`
        : e.tipo === 'invalido'
          ? '<span>Escribe un monto como 20 o 20.50</span>'
          : '';
}

function clientesFiltrados(): Cliente[] {
  const t = normalizarTexto(buscaCliente);
  const lista = t ? clientes().filter((c) => normalizarTexto(c.nombre).includes(t)) : clientes();
  return lista.slice(0, 6);
}

function htmlOpcionesClientes(): string {
  const saldos = saldosPorCliente(datos().movimientos ?? []);
  const lista = clientesFiltrados();
  if (opcionActiva >= lista.length) opcionActiva = 0;
  const opciones = lista
    .map((c, i) => {
      const s = saldos.get(c.id) ?? 0;
      return `<li role="option" id="op-cli-${i}" data-cliente="${esc(c.id)}" aria-selected="${i === opcionActiva}">
        <span>${esc(c.nombre)}</span><span class="texto-sec">${s > 0 ? `debe ${esc(soles(s))}` : 'al día'}</span></li>`;
    })
    .join('');
  const nuevo = buscaCliente.trim()
    ? `<li role="option" data-cliente-nuevo aria-selected="false"><span>${icono('user-plus', 18)}</span><span>Agregar a "${esc(buscaCliente.trim())}"</span></li>`
    : '';
  return opciones + nuevo || '<li class="texto-sec" style="padding:12px">Aún no tienes clientes.</li>';
}

function htmlSelectorCliente(): string {
  const elegido = clientes().find((c) => c.id === clienteId);
  if (elegido) {
    return `
      <div class="cliente-elegido">
        <span>Fiado a ${esc(elegido.nombre)}</span>
        <button type="button" class="btn btn-fantasma btn-sm" data-cambiar-cliente>Cambiar</button>
      </div>`;
  }
  return `
    <div class="selector-cliente">
      <label class="etiqueta" for="buscar-cliente">¿A quién le fías?</label>
      <div class="busqueda">
        ${icono('search', 18)}
        <input id="buscar-cliente" class="entrada" role="combobox" aria-expanded="true" aria-controls="lista-clientes"
          aria-autocomplete="list" autocomplete="off" placeholder="Busca por nombre" value="${esc(buscaCliente)}">
      </div>
      <ul id="lista-clientes" class="opciones" role="listbox" aria-label="Clientes">${htmlOpcionesClientes()}</ul>
    </div>`;
}

function pintarCobro(): void {
  const zona = raiz?.querySelector('#cobro-zona');
  if (!zona) return;
  if (fase === 'listo') {
    // Deshacer = contraasiento (anular): solo quien puede anular ventas (el dueño, D-33).
    const anula = permite('anularVenta');
    const puede = anula && ventana.abierta();
    zona.innerHTML = `
      <div class="cobro-acciones">
        <button type="button" class="btn btn-primario" data-nueva-venta>${icono('receipt', 18)} Nueva venta</button>
        ${
          puede
            ? `<button type="button" class="btn btn-secundario deshacer" data-deshacer>${icono('undo', 18)}<span id="deshacer-texto">Deshacer (${ventana.segundosRestantes()} s)</span><span class="deshacer-barra" aria-hidden="true"></span></button>`
            : `<p class="texto-sec" style="align-self:center;font-size:13px">${
                anula
                  ? 'Para anular esta venta más tarde, usa la app móvil.'
                  : 'Si te equivocaste, avísale al dueño: él puede anular la venta.'
              }</p>`
        }
      </div>`;
    return;
  }
  const cart = getCart();
  const total = totalCarrito(cart);
  const metodoBtn = (m: MetodoPagoVenta, ico: string, texto: string) =>
    `<button type="button" data-metodo="${m}" aria-pressed="${metodo === m}">${ico}${texto}</button>`;
  zona.innerHTML = `
    <div class="cobro">
      <div class="segmentado segmentado-grande" role="group" aria-label="Forma de pago">
        ${metodoBtn('Efectivo', icono('banknote', 18), 'Efectivo')}
        ${metodoBtn('Yape/Plin', '<span class="punto-yape" aria-hidden="true"></span>', 'Yape/Plin')}
        ${metodoBtn('Fiado', icono('notebook', 18), 'Fiado')}
      </div>
      ${metodo === 'Efectivo' && cart.length ? htmlVuelto() : ''}
      ${metodo === 'Fiado' ? htmlSelectorCliente() : ''}
      <button type="button" class="btn btn-cobrar" id="btn-cobrar" ${cart.length ? '' : 'disabled'} aria-keyshortcuts="Control+Enter">
        <span>Cobrar ${esc(soles(total))}</span><kbd aria-hidden="true">Ctrl ↵</kbd>
      </button>
      <p class="mensaje-error" id="cobro-error" role="alert" ${errorCobro ? '' : 'hidden'}>${icono('alert', 18)}<span>${esc(errorCobro)}</span></p>
    </div>`;
  if (metodo === 'Efectivo') pintarVueltoResultado();
}

function pintarTodo(): void {
  pintarCatalogo();
  pintarTicket();
  pintarCobro();
}

// ---------- Acciones ----------
function enfocarBusqueda(seleccionar = false): void {
  const b = busqueda();
  if (!b) return;
  b.focus();
  if (seleccionar) b.select();
}

function salirDeListo(): void {
  if (fase !== 'listo') return;
  ventana.cerrar();
  pararTick();
  fase = 'armando';
  ultima = null;
  recibido = '';
}

export function agregarProducto(p: Producto): void {
  salirDeListo();
  errorCobro = '';
  addToCartState({ id: p.id, nombre: p.nombre, precio: p.precio });
  destello = p.id;
  // 0 ms: el total se actualiza al instante; solo la línea parpadea 120 ms.
  pintarTodo();
  destello = null;
}

function cambiarCantidad(id: string, delta: 1 | -1): void {
  const item = getCart().find((i) => i.id === id);
  if (!item) return;
  if (delta > 0) addToCartState(item);
  else removeFromCartState(id);
  pintarTodo();
}

async function cobrar(): Promise<void> {
  if (fase !== 'armando') return;
  const cart = getCart();
  if (cart.length === 0) return;
  errorCobro = '';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    errorCobro = 'Sin internet no se puede registrar la venta. El ticket sigue aquí; cobra cuando vuelva la conexión.';
    pintarCobro();
    return;
  }
  let op: OperacionVenta;
  try {
    op = armarOperacionVenta({
      carrito: cart,
      metodoDePago: metodo,
      clienteId: metodo === 'Fiado' ? clienteId : null,
      ventaId: fuente().nuevoIdVenta(),
      cargoId: fuente().nuevoIdCargo(),
      ahora: Date.now(),
    });
  } catch (error) {
    errorCobro =
      error instanceof ErrorDominio
        ? error.codigo === 'FIADO_SIN_CLIENTE'
          ? 'Elige a quién le fías antes de cobrar.'
          : error.message
        : 'No pudimos preparar la venta.';
    pintarCobro();
    if (metodo === 'Fiado') raiz?.querySelector<HTMLInputElement>('#buscar-cliente')?.focus();
    return;
  }

  fase = 'cobrando';
  const btn = raiz?.querySelector<HTMLButtonElement>('#btn-cobrar') ?? null;
  estadoBoton(btn, 'cargando', 'Registrando…');
  try {
    await fuente().cobrar(op);
  } catch (error) {
    console.error('Error al registrar venta:', error);
    fase = 'armando';
    errorCobro = 'No se pudo registrar la venta. Revisa tu conexión e intenta otra vez; el ticket sigue aquí.';
    pintarCobro();
    return;
  }

  const e = estadoPago(op.venta.total, recibido);
  ultima = {
    op,
    recibido: e.tipo === 'vuelto' ? parsearSoles(recibido) : null,
    vuelto: e.tipo === 'vuelto' ? e.monto : null,
    cliente: clientes().find((c) => c.id === op.venta.clienteId)?.nombre ?? null,
    fecha: new Date(op.creadaEn),
  };
  clearCart();
  fase = 'listo';
  clienteId = null;
  buscaCliente = '';
  if (busqueda()) busqueda()!.value = '';
  ventana.abrir();
  pararTick();
  tickDeshacer = setInterval(() => {
    const t = raiz?.querySelector('#deshacer-texto');
    if (t) t.textContent = `Deshacer (${ventana.segundosRestantes()} s)`;
  }, 250);
  pintarTodo();
  raiz?.querySelector<HTMLButtonElement>('[data-nueva-venta]')?.focus();
}

async function deshacer(): Promise<void> {
  if (!ultima || !permite('anularVenta') || !ventana.tomar()) return;
  pararTick();
  const btn = raiz?.querySelector<HTMLButtonElement>('[data-deshacer]') ?? null;
  estadoBoton(btn, 'cargando', 'Deshaciendo…');
  const venta = ultima;
  try {
    await fuente().deshacerVenta(venta.op);
  } catch (error) {
    console.error('Error al deshacer venta:', error);
    avisar('No se pudo deshacer: la venta sigue registrada. Revisa tu conexión.', 'error');
    pintarCobro();
    return;
  }
  // El ticket vuelve tal cual para corregirlo y volver a cobrar.
  restaurarCarrito(venta.op.venta.items);
  metodo = venta.op.venta.metodoDePago;
  clienteId = venta.op.venta.clienteId;
  fase = 'armando';
  ultima = null;
  pintarTodo();
  avisar('Venta deshecha. El ticket volvió para que lo corrijas.');
  enfocarBusqueda();
}

function nuevaVenta(): void {
  salirDeListo();
  metodo = 'Efectivo';
  pintarTodo();
  cerrarHoja();
  enfocarBusqueda();
}

function abrirHoja(): void {
  raiz?.querySelector('.vender')?.classList.add('hoja-abierta');
  raiz?.querySelector('#hoja-resumen')?.setAttribute('aria-expanded', 'true');
}
function cerrarHoja(): void {
  raiz?.querySelector('.vender')?.classList.remove('hoja-abierta');
  raiz?.querySelector('#hoja-resumen')?.setAttribute('aria-expanded', 'false');
}

function elegirCliente(id: string): void {
  clienteId = id;
  buscaCliente = '';
  errorCobro = '';
  pintarCobro();
  raiz?.querySelector<HTMLButtonElement>('#btn-cobrar')?.focus();
}

// ---------- Montaje ----------
export function montarVender(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista vender">
      <section class="catalogo-col" aria-labelledby="titulo-vender">
        <h1 id="titulo-vender" class="sr-only">Vender</h1>
        <div class="catalogo-cabecera">
          <label class="busqueda">
            <span class="sr-only">Buscar producto</span>
            ${icono('search', 20)}
            <input id="buscar" type="search" class="entrada" placeholder="Busca un producto" autocomplete="off"
              enterkeyhint="done" aria-keyshortcuts="/" aria-describedby="ayuda-buscar">
            <kbd aria-hidden="true">/</kbd>
          </label>
          <p id="ayuda-buscar" class="sr-only">Enter agrega el primer resultado. Control más Enter cobra.</p>
        </div>
        <div id="catalogo" class="catalogo"></div>
      </section>
      <aside class="ticket-col" aria-label="Ticket de venta">
        <button type="button" class="hoja-resumen" id="hoja-resumen" aria-expanded="false" aria-controls="ticket-zona">
          <span class="hoja-resumen-texto" id="hoja-resumen-texto"></span>
          <span class="btn btn-cobrar" id="hoja-cobrar" role="presentation">Cobrar</span>
        </button>
        <div class="ticket-sombra" id="ticket-zona"></div>
        <div id="cobro-zona"></div>
      </aside>
      <div class="hoja-velo" data-cerrar-hoja></div>
    </div>`;

  const input = req<HTMLInputElement>(contenedor, '#buscar');
  input.addEventListener('input', () => {
    if (fase === 'listo' && input.value) {
      salirDeListo();
      pintarTicket();
      pintarCobro();
    }
    pintarCatalogo();
  });

  contenedor.addEventListener('click', (e) => {
    const t = e.target as Element;
    const prod = t.closest<HTMLElement>('[data-producto]');
    if (prod) {
      const p = productos().find((x) => x.id === prod.dataset.producto);
      if (p) agregarProducto(p);
      // Con mouse, la búsqueda vuelve a tener el foco; con teclado, el foco queda en el botón.
      if (punteroFino() && e.detail > 0) enfocarBusqueda();
      return;
    }
    const sumar = t.closest<HTMLElement>('[data-sumar]');
    if (sumar?.dataset.sumar) return cambiarCantidad(sumar.dataset.sumar, 1);
    const quitar = t.closest<HTMLElement>('[data-quitar]');
    if (quitar?.dataset.quitar) return cambiarCantidad(quitar.dataset.quitar, -1);
    const met = t.closest<HTMLElement>('[data-metodo]');
    if (met?.dataset.metodo) {
      metodo = met.dataset.metodo as MetodoPagoVenta;
      errorCobro = '';
      pintarCobro();
      if (metodo === 'Fiado' && !clienteId) raiz?.querySelector<HTMLInputElement>('#buscar-cliente')?.focus();
      return;
    }
    const billete = t.closest<HTMLElement>('[data-billete]');
    if (billete?.dataset.billete) {
      recibido = billete.dataset.billete;
      const r = raiz?.querySelector<HTMLInputElement>('#recibido');
      if (r) r.value = recibido;
      pintarVueltoResultado();
      return;
    }
    if (t.closest('#btn-cobrar') || t.closest('#hoja-cobrar')) {
      if (t.closest('#hoja-cobrar') && !raiz?.querySelector('.hoja-abierta')) {
        e.stopPropagation();
        abrirHoja();
        return;
      }
      void cobrar();
      return;
    }
    if (t.closest('#hoja-resumen')) {
      if (raiz?.querySelector('.hoja-abierta')) cerrarHoja();
      else abrirHoja();
      return;
    }
    if (t.closest('[data-cerrar-hoja]')) return cerrarHoja();
    if (t.closest('[data-nueva-venta]')) return nuevaVenta();
    if (t.closest('[data-deshacer]')) return void deshacer();
    if (t.closest('[data-cambiar-cliente]')) {
      clienteId = null;
      pintarCobro();
      raiz?.querySelector<HTMLInputElement>('#buscar-cliente')?.focus();
      return;
    }
    const cli = t.closest<HTMLElement>('[data-cliente]');
    if (cli?.dataset.cliente) return elegirCliente(cli.dataset.cliente);
    if (t.closest('[data-cliente-nuevo]')) {
      abrirEditorCliente(null, { nombreInicial: buscaCliente.trim(), alGuardar: elegirCliente });
    }
  });

  contenedor.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'recibido') {
      recibido = t.value;
      pintarVueltoResultado();
    } else if (t.id === 'buscar-cliente') {
      buscaCliente = t.value;
      opcionActiva = 0;
      const lista = raiz?.querySelector('#lista-clientes');
      if (lista) lista.innerHTML = htmlOpcionesClientes();
    }
  });

  contenedor.addEventListener('keydown', (e) => {
    const t = e.target as HTMLElement;
    if (t.id !== 'buscar-cliente') return;
    const lista = clientesFiltrados();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!lista.length) return;
      opcionActiva = (opcionActiva + (e.key === 'ArrowDown' ? 1 : lista.length - 1)) % lista.length;
      const ul = raiz?.querySelector('#lista-clientes');
      if (ul) ul.innerHTML = htmlOpcionesClientes();
      t.setAttribute('aria-activedescendant', `op-cli-${opcionActiva}`);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const c = lista[opcionActiva];
      if (c) elegirCliente(c.id);
      else if (buscaCliente.trim())
        abrirEditorCliente(null, { nombreInicial: buscaCliente.trim(), alGuardar: elegirCliente });
    }
  });

  pintarTodo();
}

/** Teclado global mientras Vender está visible. true si la tecla se usó. */
export function teclaVender(e: KeyboardEvent): boolean {
  const activo = document.activeElement;
  const accion = accionTecla(e, {
    enCampoTexto: esCampoTexto(activo),
    enBusqueda: activo?.id === 'buscar',
  });
  switch (accion) {
    case 'enfocar-busqueda':
      e.preventDefault();
      enfocarBusqueda(true);
      return true;
    case 'agregar-primero': {
      const p = resultados()[0];
      if (!p || !(busqueda()?.value.trim() ?? '')) return false;
      e.preventDefault();
      agregarProducto(p);
      enfocarBusqueda(true);
      return true;
    }
    case 'cobrar':
      e.preventDefault();
      if (fase === 'listo') nuevaVenta();
      else void cobrar();
      return true;
    case 'cerrar':
      if (raiz?.querySelector('.hoja-abierta')) {
        cerrarHoja();
        return true;
      }
      if (activo?.id === 'buscar' && busqueda()?.value) {
        busqueda()!.value = '';
        pintarCatalogo();
        return true;
      }
      return false;
    default:
      return false;
  }
}

export function mostrarVender(): void {
  pintarTodo();
  if (punteroFino()) enfocarBusqueda();
}

export function renderVender(_e: EstadoDatos): void {
  if (!raiz) return;
  // No se repinta el ticket impreso ni se pierde el foco de la búsqueda.
  pintarCatalogo();
  if (fase !== 'cobrando') {
    pintarTicket();
    if (metodo === 'Fiado' && fase === 'armando') {
      const lista = raiz.querySelector('#lista-clientes');
      if (lista) lista.innerHTML = htmlOpcionesClientes();
      else if (!raiz.contains(document.activeElement) || document.activeElement === document.body) pintarCobro();
    }
  }
}

/** Logout. */
export function reiniciarVender(): void {
  ventana.cerrar();
  pararTick();
  clearCart();
  fase = 'armando';
  metodo = 'Efectivo';
  recibido = '';
  clienteId = null;
  buscaCliente = '';
  ultima = null;
  errorCobro = '';
  if (raiz) pintarTodo();
}

