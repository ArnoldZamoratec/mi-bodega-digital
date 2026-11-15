import { hoyLima, productosConStockBajo, type Venta } from '@bodegon/core';
import { listaCobranza, totalPorCobrar } from '@bodegon/core/rules/cobranza';

import { datos, fuente, type EstadoDatos } from '../datos';
import { esc, esqueletoFilas, soles } from '../dom';
import { icono } from '../icons';
import type { Cancelar } from '../listeners';
import { fraseComparacion, rangoResumenHoy, resumenHoy } from '../logic/hoy';
import { fechaLarga } from '../logic/periodos';

/**
 * Hoy (pantalla al iniciar sesión): lo vendido hoy contra el mismo día de la semana pasada a
 * la misma hora, lo que te deben y lo que se acaba. Solo datos reales, nada de vanidad.
 */
let raiz: HTMLElement | null = null;
let ventas: Venta[] | null = null;
let diaObservado = '';
let cancelar: Cancelar | null = null;
let errorVentas = '';

function observar(): void {
  const hoy = hoyLima();
  if (cancelar && diaObservado === hoy) return;
  cancelar?.();
  diaObservado = hoy;
  ventas = null;
  try {
    cancelar = fuente().observarRango(
      rangoResumenHoy(new Date()),
      (v) => {
        ventas = v;
        errorVentas = '';
        pintar();
      },
      (m) => {
        errorVentas = m;
        pintar();
      },
    );
  } catch (e) {
    console.error('Error al observar ventas de hoy:', e);
  }
}

function pintarPrincipal(): string {
  if (ventas === null) {
    if (errorVentas) return `<p class="mensaje-error">${icono('alert', 18)}<span>${esc(errorVentas)}</span></p>`;
    return `<div>${esqueletoFilas(1, 'esq-linea')}<div class="esqueleto" style="height:72px;width:60%;margin:8px 0"></div>${esqueletoFilas(1, 'esq-linea')}</div>`;
  }
  const r = resumenHoy(ventas, new Date());
  const tono = r.variacion === null ? '' : r.variacion >= 0 ? 'sube' : 'baja';
  const flecha =
    r.variacion === null ? '' : icono(r.variacion >= 0 ? 'arrow-up-right' : 'arrow-down-right', 18);
  const ventasTxt = r.ventasHoy === 1 ? '1 venta' : `${r.ventasHoy} ventas`;
  return `
    <div>
      <p class="hoy-etiqueta">Hoy vendiste</p>
      <p class="hoy-monto monto-grande">${esc(soles(r.hoy))}</p>
      <p class="hoy-comparacion ${tono}">${flecha}<span>${esc(fraseComparacion(r))}</span></p>
      <p class="texto-sec" style="margin-top:4px">${esc(ventasTxt)}, contando efectivo, Yape/Plin y fiado.</p>
    </div>`;
}

function pintar(): void {
  const cont = raiz?.querySelector('#hoy-cuerpo');
  if (!cont) return;
  const e = datos();
  const ahora = new Date();
  const principal = pintarPrincipal();

  let cobrar = esqueletoFilas(1);
  if (e.clientes && e.movimientos) {
    const filas = listaCobranza(e.clientes, e.movimientos, ahora);
    const total = totalPorCobrar(filas);
    cobrar = filas.length
      ? `
      <div class="hoy-fila">
        <span class="hoy-fila-ico">${icono('notebook', 22)}</span>
        <div>
          <p class="hoy-fila-titulo">Por cobrar</p>
          <p class="hoy-fila-dato monto-grande">${esc(soles(total))}</p>
          <p class="hoy-nombres">${filas.length === 1 ? '1 cliente te debe' : `${filas.length} clientes te deben`}</p>
        </div>
        <button type="button" class="btn btn-secundario" data-ir="cobrar">Ver quién debe ${icono('chevron-right', 18)}</button>
      </div>`
      : `
      <div class="hoy-fila">
        <span class="hoy-fila-ico">${icono('notebook', 22)}</span>
        <div>
          <p class="hoy-fila-titulo">Por cobrar</p>
          <p class="hoy-fila-dato monto-grande">${esc(soles(0))}</p>
          <p class="hoy-nombres">Nadie te debe. Tu cuaderno está al día.</p>
        </div>
      </div>`;
  }

  let acaban = esqueletoFilas(1);
  if (e.productos) {
    const bajos = productosConStockBajo(e.productos);
    const nombres = bajos.slice(0, 4).map((p) => p.nombre);
    const resto = bajos.length - nombres.length;
    acaban = bajos.length
      ? `
      <div class="hoy-fila">
        <span class="hoy-fila-ico acaba">${icono('package', 22)}</span>
        <div>
          <p class="hoy-fila-titulo">Se acaban</p>
          <p class="hoy-fila-dato monto-grande">${bajos.length === 1 ? '1 producto' : `${bajos.length} productos`}</p>
          <p class="hoy-nombres">${esc(nombres.join(', '))}${resto > 0 ? ` y ${resto} más` : ''}</p>
        </div>
        <button type="button" class="btn btn-secundario" data-ir="productos">Ver lista de compras ${icono('chevron-right', 18)}</button>
      </div>`
      : `
      <div class="hoy-fila">
        <span class="hoy-fila-ico">${icono('package', 22)}</span>
        <div>
          <p class="hoy-fila-titulo">Se acaban</p>
          <p class="hoy-fila-dato monto-grande">Nada por ahora</p>
          <p class="hoy-nombres">Ningún producto tiene 5 unidades o menos.</p>
        </div>
      </div>`;
  }

  cont.innerHTML = `
    <div class="hoy-principal">
      ${principal}
      <button type="button" class="btn btn-primario" data-ir="vender">${icono('receipt', 18)} Vender</button>
    </div>
    ${cobrar}
    ${acaban}`;
}

export function montarHoy(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista hoy">
      <h1 class="titulo-pagina" id="hoy-saludo">Hoy</h1>
      <p class="hoy-fecha" id="hoy-fecha"></p>
      <div id="hoy-cuerpo"></div>
    </div>`;
}

export function mostrarHoy(): void {
  const f = raiz?.querySelector('#hoy-fecha');
  if (f) f.textContent = fechaLarga(hoyLima());
  const s = raiz?.querySelector('#hoy-saludo');
  if (s) s.textContent = datos().nombreBodega ?? 'Hoy en tu bodega';
  observar();
  pintar();
}

export function renderHoy(_e: EstadoDatos): void {
  if (!raiz) return;
  const s = raiz.querySelector('#hoy-saludo');
  if (s) s.textContent = datos().nombreBodega ?? 'Hoy en tu bodega';
  pintar();
}

export function reiniciarHoy(): void {
  cancelar = null; // el registro global ya cerró el listener
  diaObservado = '';
  ventas = null;
  errorVentas = '';
}
