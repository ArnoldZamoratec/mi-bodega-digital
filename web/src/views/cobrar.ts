import {
  armarAbono,
  armarCargo,
  armarLiquidacion,
  calcularSaldo,
  cargoMasAntiguoPendiente,
  ErrorDominio,
  estadoDeCargos,
  fechaEfectiva,
  ordenarCronologico,
  parsearSoles,
  saldosPorCliente,
  ZONA_NEGOCIO,
  type Cliente,
  type MetodoPagoAbono,
  type MovimientoFiado,
} from '@bodegon/core';
import {
  enlaceRecordatorio,
  haceDias,
  listaCobranza,
  mensajeRecordatorio,
  recuperadoEnMes,
  totalPorCobrar,
  type FilaCobranza,
} from '@bodegon/core/rules/cobranza';

import { datos, fuente, type EstadoDatos } from '../datos';
import {
  abrirPanel,
  avisar,
  confirmarEnLinea,
  esc,
  esqueletoFilas,
  estadoBoton,
  panelAbierto,
  repintar,
  req,
  soles,
  vacio,
} from '../dom';
import { icono } from '../icons';
import { chipDias, iniciales } from '../logic/cobranza';
import type { MovimientoWeb } from '../mappers';
import { esDeOtro, nombreDeAutor, permite } from '../sesion';
import { abrirEditorCliente } from './editores';

/**
 * Por cobrar (antes "Fiado"): el cuaderno de fiados. Ordenado por el cargo pendiente más
 * antiguo (FIFO del core), con el recordatorio por WhatsApp que el dueño ve y aprueba antes
 * de enviarlo. Nunca "deudores"; el ladrillo solo aparece con atraso real (> 15 días).
 */
let raiz: HTMLElement | null = null;
let detalleId: string | null = null;

const movimientosDe = (clienteId: string): MovimientoWeb[] =>
  (datos().movimientos ?? []).filter((m) => m.clienteId === clienteId);

const msjError = (error: unknown, porDefecto: string): string =>
  error instanceof ErrorDominio ? error.message : porDefecto;

// ---------- Lista ----------
function htmlFila(f: FilaCobranza): string {
  const chip = chipDias(f.diasPendiente);
  const recordado =
    f.diasDesdeRecordatorio !== null ? `<span>Le recordaste ${esc(haceDias(f.diasDesdeRecordatorio))}</span>` : '';
  return `
    <li class="renglon">
      <button type="button" class="renglon-boton" data-cliente="${esc(f.cliente.id)}">
        <span class="monograma" aria-hidden="true">${esc(iniciales(f.cliente.nombre))}</span>
        <span>
          <span class="renglon-nombre">${esc(f.cliente.nombre)}</span>
          <span class="renglon-meta">
            <span class="chip${chip.atrasado ? ' chip-atraso' : ''}">${chip.atrasado ? icono('alert', 14) : ''}Debe ${esc(chip.texto)}</span>
            ${recordado}
          </span>
        </span>
        <span class="renglon-saldo">${esc(soles(f.saldo))}</span>
      </button>
      ${
        f.whatsapp
          ? `<button type="button" class="btn btn-secundario btn-sm" data-recordar="${esc(f.cliente.id)}">${icono('message', 18)} Recordar</button>`
          : '<span class="sin-celular">Sin celular</span>'
      }
    </li>`;
}

function pintarLista(): void {
  const cont = raiz?.querySelector('#cobrar-cuerpo');
  if (!cont) return;
  const e = datos();
  if (!e.clientes || !e.movimientos) {
    cont.innerHTML = `<div class="franja-totales">${esqueletoFilas(1, 'esq-linea')}</div>${esqueletoFilas(5)}`;
    return;
  }
  const ahora = new Date();
  const filas = listaCobranza(e.clientes, e.movimientos, ahora);
  const total = totalPorCobrar(filas);
  const recuperado = recuperadoEnMes(e.movimientos, ahora);
  const deudores = new Set(filas.map((f) => f.cliente.id));
  const saldos = saldosPorCliente(e.movimientos);
  const alDia = e.clientes.filter((c) => !deudores.has(c.id));

  const totales = `
    <div class="franja-totales">
      <div>
        <span class="etiqueta">Te deben en total</span>
        <p class="total-cobrar monto-grande">${esc(soles(total))}</p>
      </div>
      <div>
        <span class="etiqueta">Recuperado este mes</span>
        <p class="total-recuperado monto-grande">${esc(soles(recuperado))}</p>
      </div>
    </div>`;

  if (e.clientes.length === 0) {
    cont.innerHTML = vacio({
      icono: 'notebook',
      titulo: 'Tu cuaderno de fiados está vacío',
      texto: 'Agrega a los vecinos a quienes les fías. Aquí verás cuánto te debe cada uno y desde cuándo.',
      accion: { etiqueta: 'Agregar cliente', atributo: 'data-nuevo-cliente' },
    });
    return;
  }

  const lista = filas.length
    ? `<ul class="cuaderno" aria-label="Clientes que te deben, primero los más antiguos">${filas.map(htmlFila).join('')}</ul>`
    : vacio({
        icono: 'circle-check',
        titulo: 'Nadie te debe',
        texto: 'Cuando fíes una venta o registres un fiado, aparecerá aquí con los días que lleva.',
      });

  const alDiaHtml = alDia.length
    ? `
    <details class="seccion-al-dia">
      <summary>${icono('chevron-right', 18)} Al día (${alDia.length})</summary>
      <ul class="cuaderno">
        ${alDia
          .map((c) => {
            const s = saldos.get(c.id) ?? 0;
            return `<li class="renglon">
              <button type="button" class="renglon-boton" data-cliente="${esc(c.id)}">
                <span class="monograma" aria-hidden="true">${esc(iniciales(c.nombre))}</span>
                <span><span class="renglon-nombre">${esc(c.nombre)}</span>
                  <span class="renglon-meta">${esc(c.telefono || 'Sin celular')}</span></span>
                <span class="renglon-saldo texto-sec">${s < 0 ? `a favor ${esc(soles(-s))}` : esc(soles(0))}</span>
              </button>
            </li>`;
          })
          .join('')}
      </ul>
    </details>`
    : '';

  // El <details> "Al día" abierto se conserva entre repintados.
  const abierto = cont.querySelector('details.seccion-al-dia')?.hasAttribute('open');
  repintar(cont, totales + lista + alDiaHtml);
  if (abierto) cont.querySelector('details.seccion-al-dia')?.setAttribute('open', '');
}

// ---------- Recordatorio (vista previa antes de abrir WhatsApp) ----------
function abrirRecordatorio(clienteId: string): void {
  const e = datos();
  const cliente = e.clientes?.find((c) => c.id === clienteId);
  if (!cliente) return;
  const saldo = calcularSaldo(movimientosDe(clienteId));
  const mensaje = mensajeRecordatorio({
    nombreCliente: cliente.nombre,
    saldo,
    nombreNegocio: e.nombreBodega ?? undefined,
  });
  const enlace = enlaceRecordatorio(cliente.telefono, mensaje);
  if (!enlace) {
    avisar('Este cliente no tiene un celular válido. Agrégalo para recordarle por WhatsApp.', 'error');
    return;
  }
  const fila = listaCobranza([cliente], movimientosDe(clienteId), new Date())[0];
  const panel = abrirPanel(
    `Recordar a ${cliente.nombre}`,
    `
    ${
      fila?.recordadoHacePoco && fila.diasDesdeRecordatorio !== null
        ? `<p class="mensaje-ok">${icono('message', 18)}<span>Le recordaste ${esc(haceDias(fila.diasDesdeRecordatorio))}. Quizá conviene esperar unos días más.</span></p>`
        : ''
    }
    <div class="campo">
      <span class="etiqueta">Este es el mensaje que verá en WhatsApp</span>
      <p class="recordatorio-preview">${esc(mensaje)}</p>
    </div>
    <p class="texto-sec">Se abrirá WhatsApp con el texto listo. Tú decides si lo envías.</p>
    <div class="panel-pie fila-botones">
      <a class="btn btn-primario" id="abrir-wa" href="${esc(enlace)}" target="_blank" rel="noopener noreferrer">${icono('message', 18)} Abrir WhatsApp</a>
      <button type="button" class="btn btn-secundario" data-cerrar-panel>Ahora no</button>
    </div>`,
  );
  req(panel, '#abrir-wa').addEventListener('click', () => {
    // D-27: se anota la fecha del recordatorio (sin bloquear la apertura de WhatsApp).
    fuente()
      .marcarRecordatorio(clienteId)
      .catch((err: unknown) => console.error('Error al anotar el recordatorio:', err));
  });
}

// ---------- Detalle del cliente: historial como cuaderno ----------
const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: ZONA_NEGOCIO,
});

let metodoAbono: MetodoPagoAbono = 'Efectivo';

export function htmlHistorial(movimientos: readonly MovimientoWeb[]): string {
  if (movimientos.length === 0) return '<p class="texto-sec">Todavía no hay movimientos.</p>';
  // Borrar movimientos es solo del dueño (D-33); "Cobrar este" es un abono y sí lo hace el cajero.
  const borra = permite('borrarMovimientos');
  const estados = new Map(estadoDeCargos(movimientos).map((c) => [c.movimiento.id, c]));
  return `<ul class="historial" id="historial">${ordenarCronologico(movimientos)
    .map((m) => {
      const f = fechaEfectiva(m);
      const fecha = f ? formatoFecha.format(f) : '…';
      const esCargo = m.monto > 0;
      const estado = esCargo ? estados.get(m.id) : undefined;
      const saldado = estado?.estado === 'pagado' || estado?.estado === 'cubierto';
      let detalle = '';
      if (esCargo && saldado) detalle = estado?.estado === 'cubierto' ? 'Cubierto con abonos' : 'Pagado';
      else if (esCargo && estado?.estado === 'parcial') detalle = `Falta ${soles(estado.pendiente)}`;
      else if (!esCargo) detalle = `Abono en ${m.metodoPago ?? 'Efectivo'}`;
      // "Registró: Rosa" cuando lo anotó otra persona (en una bodega sin cajeros no aparece).
      const autor = esDeOtro(m.autor) ? `Registró: ${nombreDeAutor(m.autor)}` : '';
      return `
      <li class="mov${saldado ? ' saldado' : ''}" data-mov="${esc(m.id)}">
        <span class="mov-fecha">${esc(fecha)}</span>
        <span class="mov-desc">${esc(m.descripcion)}${detalle ? `<span class="mov-estado">${esc(detalle)}</span>` : ''}${autor ? `<span class="mov-estado">${esc(autor)}</span>` : ''}</span>
        <span class="mov-monto${esCargo ? '' : ' abono'}">${esc(esCargo ? `+ ${soles(m.monto)}` : `− ${soles(Math.abs(m.monto))}`)}</span>
        <span class="mov-acciones">
          ${
            esCargo && !saldado
              ? `<button type="button" class="btn btn-fantasma btn-sm marcar-pagado-btn" data-liquidar="${esc(m.id)}">Cobrar este</button>`
              : ''
          }
          ${borra ? `<button type="button" class="btn-icono eliminar-deuda-btn" data-eliminar="${esc(m.id)}" aria-label="Eliminar este movimiento">${icono('trash', 18)}</button>` : ''}
        </span>
      </li>`;
    })
    .join('')}</ul>`;
}

function htmlDetalle(cliente: Cliente, movimientos: readonly MovimientoFiado[]): string {
  const saldo = calcularSaldo(movimientos);
  const pendiente = cargoMasAntiguoPendiente(movimientos);
  const tieneWa = !!enlaceRecordatorio(cliente.telefono, 'x');
  const metodoBtn = (m: MetodoPagoAbono, ico: string) =>
    `<button type="button" data-metodo-abono="${m}" aria-pressed="${metodoAbono === m}">${ico}${m}</button>`;
  return `
    <div class="saldo-cliente">
      <div>
        <span class="etiqueta">${saldo > 0 ? 'Debe' : saldo < 0 ? 'Tiene a favor' : 'Está al día'}</span>
        <p class="monto-grande ${saldo > 0 ? 'debe' : 'a-favor'}" id="detalle-saldo">${esc(soles(Math.abs(saldo)))}</p>
        <p class="texto-sec">${esc(cliente.telefono || 'Sin celular')}</p>
      </div>
      <div class="fila-botones">
        ${saldo > 0 && tieneWa ? `<button type="button" class="btn-icono" data-recordar="${esc(cliente.id)}" aria-label="Recordar por WhatsApp">${icono('message', 20)}</button>` : ''}
        ${permite('editarClientes') ? `<button type="button" class="btn-icono" data-editar-cliente aria-label="Editar cliente">${icono('pencil', 20)}</button>` : ''}
      </div>
    </div>

    <form class="bloque bloque-abono formulario" id="form-abono" novalidate>
      <h3 class="titulo-seccion">Registrar abono</h3>
      <div class="segmentado segmentado-grande" role="group" aria-label="Cómo pagó">
        ${metodoBtn('Efectivo', icono('banknote', 18))}
        ${metodoBtn('Yape/Plin', '<span class="punto-yape" aria-hidden="true"></span>')}
      </div>
      <div class="dos-col">
        <label class="campo"><span>Monto (S/)</span>
          <input class="entrada entrada-monto" name="monto" inputmode="decimal" autocomplete="off" autofocus value="${pendiente ? esc(pendiente.pendiente.toFixed(2)) : ''}" placeholder="0.00">
        </label>
        <label class="campo"><span>Concepto</span>
          <input class="entrada" name="descripcion" maxlength="300" autocomplete="off" value="${pendiente ? esc(`Pago de: ${pendiente.movimiento.descripcion}`) : 'Abono'}">
        </label>
      </div>
      <input type="hidden" name="origen" value="${pendiente ? esc(pendiente.movimiento.id) : ''}">
      <p class="mensaje-error" id="error-abono" role="alert" hidden></p>
      <button type="submit" class="btn btn-primario btn-ancho">${icono('hand-coins', 18)} Registrar abono</button>
    </form>

    ${permite('fiarSinVenta') ? `<details class="fiar" id="bloque-fiar">
      <summary class="btn btn-secundario btn-sm" style="justify-self:start">${icono('plus', 18)} Fiar sin venta</summary>
      <form class="formulario" id="form-cargo" novalidate style="margin-top:12px">
        <div class="dos-col">
          <label class="campo"><span>Monto (S/)</span>
            <input class="entrada entrada-monto" name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00">
          </label>
          <label class="campo"><span>Qué se llevó</span>
            <input class="entrada" name="descripcion" maxlength="300" autocomplete="off" placeholder="Pan y leche">
          </label>
        </div>
        <p class="mensaje-error" id="error-cargo" role="alert" hidden></p>
        <button type="submit" class="btn btn-secundario">Anotar fiado</button>
      </form>
    </details>` : ''}

    <section aria-labelledby="titulo-historial">
      <h3 class="titulo-seccion" id="titulo-historial" style="margin-bottom:8px">Cuaderno</h3>
      <div id="historial-zona">${htmlHistorial(movimientos)}</div>
    </section>`;
}

function abrirDetalle(clienteId: string): void {
  const e = datos();
  const cliente = e.clientes?.find((c) => c.id === clienteId);
  if (!cliente) return;
  detalleId = clienteId;
  metodoAbono = 'Efectivo';
  const panel = abrirPanel(cliente.nombre, htmlDetalle(cliente, movimientosDe(clienteId)), () => {
    detalleId = null;
  });
  conectarDetalle(panel, cliente);
}

function mostrarErrorEn(panel: HTMLElement, sel: string, texto: string): void {
  const el = panel.querySelector<HTMLElement>(sel);
  if (!el) return;
  el.textContent = texto;
  el.hidden = false;
}

function conectarDetalle(panel: HTMLElement, cliente: Cliente): void {
  panel.addEventListener('click', async (ev) => {
    const t = ev.target as Element;
    const met = t.closest<HTMLElement>('[data-metodo-abono]');
    if (met?.dataset.metodoAbono) {
      metodoAbono = met.dataset.metodoAbono as MetodoPagoAbono;
      panel
        .querySelectorAll<HTMLElement>('[data-metodo-abono]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metodoAbono === metodoAbono)));
      return;
    }
    if (t.closest('[data-editar-cliente]') && permite('editarClientes')) {
      abrirEditorCliente(cliente);
      return;
    }
    const rec = t.closest<HTMLElement>('[data-recordar]');
    if (rec?.dataset.recordar) {
      abrirRecordatorio(rec.dataset.recordar);
      return;
    }
    const liq = t.closest<HTMLButtonElement>('[data-liquidar]');
    if (liq?.dataset.liquidar) {
      // "Cobrar este" (B-02): abono REAL por lo que falta del cargo, con el método elegido.
      estadoBoton(liq, 'cargando', 'Registrando…');
      try {
        const abono = armarLiquidacion(movimientosDe(cliente.id), liq.dataset.liquidar, metodoAbono);
        await fuente().registrarMovimiento(abono);
        avisar(`Abono de ${soles(Math.abs(abono.monto))} registrado`);
      } catch (error) {
        console.error('Error al liquidar cargo:', error);
        estadoBoton(liq, 'error', 'No se registró');
        avisar(msjError(error, 'No pudimos registrar el abono. Intenta otra vez.'), 'error');
      }
      return;
    }
    const del = t.closest<HTMLElement>('[data-eliminar]');
    if (del?.dataset.eliminar && permite('borrarMovimientos')) {
      const id = del.dataset.eliminar;
      const zona = del.closest('.mov')?.querySelector<HTMLElement>('.mov-acciones');
      if (!zona) return;
      const mov = movimientosDe(cliente.id).find((m) => m.id === id);
      const ok = await confirmarEnLinea(zona, {
        pregunta: '¿Borrar este movimiento del cuaderno?',
        detalle: mov ? `${mov.descripcion}: ${soles(Math.abs(mov.monto))}. El saldo se recalcula.` : undefined,
        accion: 'Sí, borrar',
      });
      if (!ok) return;
      try {
        await fuente().eliminarMovimiento(id);
        avisar('Movimiento borrado');
      } catch (error) {
        console.error('Error al eliminar movimiento:', error);
        avisar('No pudimos borrarlo. Intenta otra vez.', 'error');
      }
    }
  });

  req<HTMLFormElement>(panel, '#form-abono').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    try {
      // Abono negativo (B-01: no marca el cargo origen como pagado; el saldo ya baja).
      const abono = armarAbono(
        cliente.id,
        parsearSoles(String(fd.get('monto') ?? '')),
        String(fd.get('descripcion') ?? ''),
        metodoAbono,
        String(fd.get('origen') ?? '') || undefined,
      );
      estadoBoton(btn, 'cargando', 'Registrando…');
      await fuente().registrarMovimiento(abono);
      estadoBoton(btn, 'exito', 'Abono registrado');
      avisar(`Abono de ${soles(Math.abs(abono.monto))} registrado`);
    } catch (error) {
      console.error('Error al registrar abono:', error);
      if (btn?.dataset.estado === 'cargando') estadoBoton(btn, 'error', 'No se registró');
      mostrarErrorEn(panel, '#error-abono', msjError(error, 'No pudimos registrar el abono. Revisa tu conexión.'));
    }
  });

  panel.querySelector<HTMLFormElement>('#form-cargo')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.currentTarget as HTMLFormElement;
    const fd = new FormData(form);
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    try {
      const cargo = armarCargo(
        cliente.id,
        parsearSoles(String(fd.get('monto') ?? '')),
        String(fd.get('descripcion') ?? ''),
      );
      estadoBoton(btn, 'cargando', 'Anotando…');
      await fuente().registrarMovimiento(cargo);
      form.reset();
      estadoBoton(btn, 'exito', 'Anotado');
    } catch (error) {
      console.error('Error al anotar fiado:', error);
      if (btn?.dataset.estado === 'cargando') estadoBoton(btn, 'error', 'No se anotó');
      mostrarErrorEn(panel, '#error-cargo', msjError(error, 'No pudimos anotar el fiado. Revisa tu conexión.'));
    }
  });
}

/** Con el panel abierto, los datos en vivo actualizan saldo e historial sin cerrar nada. */
function refrescarDetalle(): void {
  if (!detalleId || !panelAbierto()) return;
  const panel = document.getElementById('panel');
  const movs = movimientosDe(detalleId);
  const saldo = calcularSaldo(movs);
  const s = panel?.querySelector('#detalle-saldo');
  if (s) s.textContent = soles(Math.abs(saldo));
  const h = panel?.querySelector('#historial-zona');
  if (h && !h.querySelector('.confirmacion')) h.innerHTML = htmlHistorial(movs);
  // Prellenado del próximo abono con lo que falta del cargo más antiguo (RN-09).
  const form = panel?.querySelector<HTMLFormElement>('#form-abono');
  const pendiente = cargoMasAntiguoPendiente(movs);
  if (form && !form.contains(document.activeElement)) {
    const monto = form.elements.namedItem('monto') as HTMLInputElement | null;
    const desc = form.elements.namedItem('descripcion') as HTMLInputElement | null;
    const origen = form.elements.namedItem('origen') as HTMLInputElement | null;
    if (monto) monto.value = pendiente ? pendiente.pendiente.toFixed(2) : '';
    if (desc) desc.value = pendiente ? `Pago de: ${pendiente.movimiento.descripcion}` : 'Abono';
    if (origen) origen.value = pendiente ? pendiente.movimiento.id : '';
  }
}

export function montarCobrar(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista">
      <div class="cabecera-vista">
        <h1 class="titulo-pagina">Por cobrar</h1>
        <button type="button" class="btn btn-secundario" data-nuevo-cliente>${icono('user-plus', 18)} Nuevo cliente</button>
      </div>
      <div id="cobrar-cuerpo"></div>
    </div>`;
  contenedor.addEventListener('click', (e) => {
    const t = e.target as Element;
    const rec = t.closest<HTMLElement>('[data-recordar]');
    if (rec?.dataset.recordar) return abrirRecordatorio(rec.dataset.recordar);
    const cli = t.closest<HTMLElement>('[data-cliente]');
    if (cli?.dataset.cliente) return abrirDetalle(cli.dataset.cliente);
    if (t.closest('[data-nuevo-cliente]')) abrirEditorCliente(null, { alGuardar: abrirDetalle });
  });
  pintarLista();
}

export function renderCobrar(_e: EstadoDatos): void {
  pintarLista();
  refrescarDetalle();
}

export const mostrarCobrar = (): void => pintarLista();

export { abrirDetalle as abrirDetalleCliente };
