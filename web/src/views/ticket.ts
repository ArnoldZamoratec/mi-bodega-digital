import {
  aSoles,
  subtotalCentimos,
  totalCarrito,
  unidadesEnCarrito,
  ZONA_NEGOCIO,
  type ItemCarrito,
  type MetodoPagoVenta,
} from '@bodegon/core';

import { esc, soles } from '../dom';
import { icono } from '../icons';

/**
 * El ticket de papel térmico: el único detalle "físico" de la interfaz (ux-web §2). Lo usan
 * Vender (en curso e impreso) y la vista previa del login.
 */
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONA_NEGOCIO,
});

export const fechaTicket = (d: Date): string => formatoFecha.format(d).replace(',', '');

const cabecera = (negocio: string, meta: string): string => `
  <header class="ticket-cabecera">
    <p class="ticket-negocio">${esc(negocio)}</p>
    <p class="ticket-meta">${esc(meta)}</p>
  </header>
  <hr class="ticket-corte">`;

const subtotal = (i: ItemCarrito): string => soles(aSoles(subtotalCentimos(i.precio, i.cantidad)));

export const resumenUnidades = (carrito: readonly ItemCarrito[]): string => {
  const n = unidadesEnCarrito(carrito);
  return n === 1 ? '1 producto' : `${n} productos`;
};

export interface OpcionesTicketEnCurso {
  negocio: string;
  ahora: Date;
  /** Ítem recién agregado: parpadea 120 ms. */
  destello?: string | null;
  /** Mensaje por ítem (p. ej. "Quedan 2"). */
  avisoStock?: (id: string, cantidad: number) => string | null;
}

export function ticketEnCurso(carrito: readonly ItemCarrito[], o: OpcionesTicketEnCurso): string {
  if (carrito.length === 0) {
    return `
      <div class="ticket">
        ${cabecera(o.negocio, 'Ticket nuevo')}
        <div class="ticket-vacio">
          <p>Toca un producto o búscalo para empezar.</p>
          <div class="atajos" aria-hidden="true">
            <span><kbd>/</kbd> buscar</span>
            <span><kbd>Enter</kbd> agregar</span>
            <span><kbd>Ctrl</kbd> + <kbd>Enter</kbd> cobrar</span>
          </div>
        </div>
        <hr class="ticket-corte">
        <div class="ticket-total">
          <span class="ticket-total-etiqueta">Total</span>
          <span class="ticket-total-monto monto-grande">${esc(soles(0))}</span>
        </div>
      </div>`;
  }
  const filas = carrito
    .map((i) => {
      const aviso = o.avisoStock?.(i.id, i.cantidad) ?? null;
      return `
      <li class="ticket-item${o.destello === i.id ? ' destello' : ''}">
        <span class="pasos" role="group" aria-label="Cantidad de ${esc(i.nombre)}">
          <button type="button" data-quitar="${esc(i.id)}" aria-label="Quitar uno de ${esc(i.nombre)}">${icono('minus', 16)}</button>
          <output aria-live="polite">${esc(i.cantidad)}</output>
          <button type="button" data-sumar="${esc(i.id)}" aria-label="Agregar uno de ${esc(i.nombre)}">${icono('plus', 16)}</button>
        </span>
        <span class="ticket-item-nombre">${esc(i.nombre)}
          <span class="ticket-item-precio">${esc(soles(i.precio))} c/u${aviso ? ` · ${esc(aviso)}` : ''}</span>
        </span>
        <span class="ticket-item-sub">${esc(subtotal(i))}</span>
      </li>`;
    })
    .join('');
  return `
    <div class="ticket">
      ${cabecera(o.negocio, `Ticket en curso · ${fechaTicket(o.ahora)}`)}
      <ul class="ticket-items" aria-label="Productos en el ticket">${filas}</ul>
      <hr class="ticket-corte">
      <div class="ticket-total">
        <span class="ticket-total-etiqueta">Total</span>
        <span class="ticket-total-monto monto-grande" id="ticket-total">${esc(soles(totalCarrito(carrito)))}</span>
      </div>
    </div>`;
}

export interface DatosTicketImpreso {
  negocio: string;
  fecha: Date;
  items: readonly ItemCarrito[];
  total: number;
  metodo: MetodoPagoVenta;
  recibido?: number | null;
  vuelto?: number | null;
  cliente?: string | null;
  /** Sello "Venta registrada" (no en la vista previa del login). */
  sello?: boolean;
}

export function ticketImpreso(t: DatosTicketImpreso): string {
  const filas = t.items
    .map(
      (i) => `
      <li class="ticket-item">
        <span class="ticket-item-precio">${esc(i.cantidad)} ×</span>
        <span class="ticket-item-nombre">${esc(i.nombre)}</span>
        <span class="ticket-item-sub">${esc(subtotal(i))}</span>
      </li>`,
    )
    .join('');
  const pago =
    t.metodo === 'Fiado'
      ? `<div class="ticket-linea"><span>Fiado a</span><strong>${esc(t.cliente ?? '')}</strong></div>`
      : `<div class="ticket-linea"><span>Pagó con</span><strong>${esc(t.metodo)}</strong></div>`;
  const efectivo =
    t.metodo === 'Efectivo' && t.recibido != null && t.vuelto != null
      ? `<div class="ticket-linea"><span>Recibido</span><span>${esc(soles(t.recibido))}</span></div>
         <div class="ticket-linea"><span>Vuelto</span><strong>${esc(soles(t.vuelto))}</strong></div>`
      : '';
  return `
    <div class="ticket${t.sello ? ' ticket-impreso' : ''}">
      ${cabecera(t.negocio, fechaTicket(t.fecha))}
      ${t.sello ? `<div class="ticket-sello" role="status">${icono('circle-check', 28)}<strong>Venta registrada</strong></div><hr class="ticket-corte">` : ''}
      <ul class="ticket-items">${filas}</ul>
      <hr class="ticket-corte">
      <div class="ticket-total">
        <span class="ticket-total-etiqueta">Total</span>
        <span class="ticket-total-monto monto-grande">${esc(soles(t.total))}</span>
      </div>
      ${pago}${efectivo}
    </div>`;
}
