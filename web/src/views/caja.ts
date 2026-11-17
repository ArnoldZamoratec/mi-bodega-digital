import { ErrorDominio, fechaEfectiva } from '@bodegon/core';
import {
  armarApertura,
  armarCierre,
  armarMovimientoCaja,
  LARGO_MAXIMO_MOTIVO,
  type OperacionCaja,
  type ResumenCaja,
  type TipoMovimientoCaja,
} from '@bodegon/core/rules/caja';

import { sincronizarCajaVivo } from '../cajaVivo';
import { datos, fuente, type EstadoDatos } from '../datos';
import { avisar, esc, esqueletoFilas, estadoBoton, soles } from '../dom';
import { icono } from '../icons';
import {
  ATAJOS_APERTURA,
  DENOMINACIONES,
  etiquetaDenominacion,
  leerMonto,
  mensajeArqueo,
  momentoCorto,
  periodoCaja,
  textoDiferencia,
  tonoArqueo,
  totalConteo,
  vistaCaja,
  type VistaCaja,
} from '../logic/caja';
import { hayVentasDeCajeros, ventasDelTurno, ventasPorAutor } from '../logic/equipo';
import type { VentaWeb } from '../mappers';
import type { CajaWeb, MovimientoCajaWeb } from '../mappersCaja';
import { esDeOtro, nombreDeAutor, sesionActual } from '../sesion';

/**
 * Caja (D-28): abrir con el sencillo, anotar ingresos y egresos, y cerrar contando el
 * efectivo. El esperado y el arqueo salen del core; la web solo pinta y guarda (en línea,
 * una transacción idempotente por operación, como las ventas).
 *
 * Los formularios no se repintan con cada dato que llega: solo cambian las zonas de números
 * (esperado, desglose, movimientos, historial, arqueo), así no se pierde lo que se escribe.
 */
let raiz: HTMLElement | null = null;
let modo = '';
let guardando: 'abrir' | 'mov' | 'cerrar' | null = null;

// Formulario de ingreso/egreso
let movAbierto = false;
let tipoMov: TipoMovimientoCaja = 'egreso';
// Cierre
let cierreAbierto = false;
let conteo: Record<string, number> = {};

/**
 * Id generado en este equipo para la operación en curso. Se reutiliza si se reintenta lo
 * mismo (p. ej. la red cortó tras escribir): la transacción ve que ya existe y no duplica.
 */
let idEnCurso: { clave: string; id: string } | null = null;
function idPara(clave: string, nuevo: () => string): string {
  if (idEnCurso?.clave !== clave) idEnCurso = { clave, id: nuevo() };
  return idEnCurso.id;
}

const sinInternet = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

const msj = (error: unknown, porDefecto: string): string =>
  error instanceof ErrorDominio ? error.message : porDefecto;

const $c = <T extends HTMLElement = HTMLElement>(sel: string): T | null =>
  raiz?.querySelector<T>(sel) ?? null;

function mostrarError(sel: string, texto: string): void {
  const el = $c(sel);
  if (!el) return;
  el.innerHTML = texto ? `${icono('alert', 18)}<span>${esc(texto)}</span>` : '';
  el.hidden = !texto;
}

// ---------- HTML ----------
function htmlApertura(): string {
  return `
    <section class="caja-apertura" aria-labelledby="caja-apertura-titulo">
      <span class="vacio-ico" aria-hidden="true">${icono('vault', 28)}</span>
      <h2 class="caja-apertura-titulo" id="caja-apertura-titulo">Abre la caja con el efectivo con el que empiezas</h2>
      <p class="texto-sec">Cuenta el sencillo del cajón. Al cerrar te diremos cuánto debería haber, sumando las ventas en efectivo, los pagos de fiado y lo que saques o metas.</p>
      <form class="formulario caja-apertura-form" id="form-apertura" novalidate>
        <label class="campo"><span>Efectivo inicial</span>
          <span class="entrada-soles">
            <span aria-hidden="true">S/</span>
            <input class="entrada entrada-monto" id="monto-inicial" name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-describedby="ayuda-inicial">
          </span>
        </label>
        <div class="billetes caja-atajos" role="group" aria-label="Montos rápidos">
          ${ATAJOS_APERTURA.map((m) => `<button type="button" data-atajo="${m}" aria-label="Empezar con ${m} soles">${m}</button>`).join('')}
        </div>
        <p class="texto-sec caja-ayuda" id="ayuda-inicial">Si empiezas sin sencillo, déjalo vacío.</p>
        <p class="mensaje-error" id="error-apertura" role="alert" hidden></p>
        <button type="submit" class="btn btn-primario btn-ancho" id="btn-abrir">${icono('vault', 18)} Abrir caja</button>
      </form>
    </section>`;
}

function htmlAbierta(caja: CajaWeb): string {
  return `
    <div class="caja-layout">
      <section class="caja-principal" aria-labelledby="caja-esperado-etiqueta">
        <p class="chip chip-caja" id="caja-desde">${icono('vault', 14)}<span></span></p>
        <div class="caja-esperado-bloque">
          <p class="caja-etiqueta" id="caja-esperado-etiqueta">Debería haber</p>
          <p class="caja-esperado monto-grande" id="caja-esperado" aria-live="polite"></p>
          <p class="caja-etiqueta-pie">en efectivo en el cajón</p>
        </div>
        <dl class="desglose" id="caja-desglose" aria-label="Cómo se calcula"></dl>
        <div id="caja-autores"></div>
        <div class="fila-botones caja-acciones" id="caja-acciones">
          <button type="button" class="btn btn-primario" data-abrir-cierre>${icono('lock', 18)} Cerrar caja</button>
          <button type="button" class="btn btn-secundario" data-abrir-mov aria-expanded="false" aria-controls="caja-zona-mov">${icono('plus', 18)} Registrar ingreso o egreso</button>
        </div>
        <div id="caja-zona-mov"></div>
        <div id="caja-zona-cierre"></div>
      </section>
      <section class="caja-lateral" aria-labelledby="t-movs-caja">
        <h2 class="titulo-seccion" id="t-movs-caja">Movimientos de esta caja</h2>
        <div id="caja-movs" data-caja="${esc(caja.id)}"></div>
        <div id="caja-ventas"></div>
      </section>
    </div>`;
}

function htmlFormMov(): string {
  const boton = (t: TipoMovimientoCaja, ico: 'plus' | 'minus', txt: string) =>
    `<button type="button" data-tipo-mov="${t}" aria-pressed="${tipoMov === t}">${icono(ico, 18)}${txt}</button>`;
  return `
    <form class="bloque formulario caja-form-mov" id="form-mov" novalidate aria-labelledby="t-form-mov">
      <h3 class="titulo-seccion" id="t-form-mov">Registrar ingreso o egreso</h3>
      <div class="segmentado segmentado-grande" role="group" aria-label="Tipo de movimiento">
        ${boton('egreso', 'minus', 'Egreso: saco dinero')}
        ${boton('ingreso', 'plus', 'Ingreso: meto dinero')}
      </div>
      <div class="dos-col">
        <label class="campo"><span>Monto (S/)</span>
          <input class="entrada entrada-monto" name="monto" inputmode="decimal" autocomplete="off" placeholder="0.00">
        </label>
        <label class="campo"><span>Motivo</span>
          <input class="entrada" name="motivo" maxlength="${LARGO_MAXIMO_MOTIVO}" autocomplete="off" placeholder="${tipoMov === 'egreso' ? 'Pago al proveedor de pan' : 'Sencillo del banco'}">
        </label>
      </div>
      <p class="mensaje-error" id="error-mov" role="alert" hidden></p>
      <div class="fila-botones">
        <button type="submit" class="btn btn-primario" id="btn-mov">${tipoMov === 'egreso' ? 'Guardar egreso' : 'Guardar ingreso'}</button>
        <button type="button" class="btn btn-secundario" data-cancelar-mov>Cancelar</button>
      </div>
    </form>`;
}

function htmlCierre(): string {
  return `
    <section class="bloque caja-cierre" id="caja-cierre" aria-labelledby="t-cierre">
      <h3 class="titulo-seccion" id="t-cierre">Cerrar caja</h3>
      <p class="texto-sec">Cuenta el efectivo del cajón y escribe el total. Lo comparamos con lo que debería haber.</p>
      <label class="campo"><span>Efectivo contado</span>
        <span class="entrada-soles">
          <span aria-hidden="true">S/</span>
          <input class="entrada entrada-monto" id="contado" inputmode="decimal" autocomplete="off" placeholder="0.00">
        </span>
      </label>
      <details class="ayuda-conteo" id="ayuda-conteo">
        <summary>${icono('coins', 18)} Ayúdame a contar billetes y monedas</summary>
        <div class="conteo-grid">
          ${DENOMINACIONES.map(
            (d) => `
            <label class="conteo-fila">
              <span>${esc(etiquetaDenominacion(d))}</span>
              <input class="entrada" data-denom="${d}" inputmode="numeric" autocomplete="off" placeholder="0" aria-label="Cantidad de ${esc(etiquetaDenominacion(d))}" value="${conteo[String(d)] ? conteo[String(d)] : ''}">
            </label>`,
          ).join('')}
        </div>
        <p class="texto-sec">El total se escribe solo en "Efectivo contado".</p>
      </details>
      <div class="arqueo" id="arqueo" aria-live="polite"></div>
      <p class="mensaje-error" id="error-cierre" role="alert" hidden></p>
      <div class="fila-botones">
        <button type="button" class="btn btn-primario" id="btn-confirmar-cierre" disabled>${icono('lock', 18)} Cerrar caja</button>
        <button type="button" class="btn btn-secundario" data-cancelar-cierre>Volver</button>
      </div>
      <p class="texto-sec caja-ayuda">Una caja cerrada ya no se modifica.</p>
    </section>`;
}

function htmlDesglose(r: ResumenCaja | null): string {
  if (!r) return esqueletoFilas(5, 'esq-linea');
  const fila = (etiqueta: string, monto: string, clase = '') =>
    `<div class="desglose-fila${clase}"><dt>${esc(etiqueta)}</dt><dd>${esc(monto)}</dd></div>`;
  return [
    fila('Monto inicial', soles(r.inicial)),
    fila('Ventas en efectivo', `+ ${soles(r.ventasEfectivo)}`),
    fila('Pagos de fiado en efectivo', `+ ${soles(r.abonosEfectivo)}`),
    fila('Ingresos', `+ ${soles(r.ingresos)}`),
    fila('Egresos', `− ${soles(r.egresos)}`),
    fila('Debería haber', soles(r.esperado), ' desglose-total'),
  ].join('');
}

function htmlMovimientos(movs: readonly MovimientoCajaWeb[], cargando: boolean): string {
  if (cargando) return esqueletoFilas(3, 'esq-fila');
  if (movs.length === 0)
    return `<p class="texto-sec caja-movs-vacio">Aún no hay ingresos ni egresos. Anótalos cuando saques plata para pagar al proveedor o metas sencillo.</p>`;
  const ahora = new Date();
  return `<ul class="caja-movs">${movs
    .map((m) => {
      const f = fechaEfectiva(m);
      const ingreso = m.tipo === 'ingreso';
      return `
      <li class="caja-mov">
        <span class="caja-mov-ico${ingreso ? ' ingreso' : ''}" aria-hidden="true">${icono(ingreso ? 'plus' : 'minus', 18)}</span>
        <span class="caja-mov-texto">
          <span class="caja-mov-motivo">${esc(m.motivo)}</span>
          <span class="caja-mov-meta">${ingreso ? 'Ingreso' : 'Egreso'}${f ? ` · ${esc(momentoCorto(f, ahora))}` : ''}${esDeOtro(m.autor) ? ` · ${esc(nombreDeAutor(m.autor))}` : ''}</span>
        </span>
        <span class="caja-mov-monto${ingreso ? ' ingreso' : ''}">${ingreso ? '+' : '−'} ${esc(soles(m.monto))}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

/**
 * "Quién vendió" en este turno (D-33): solo si vendió alguien que no es el dueño, para no
 * llenar de "Tú" la caja de una bodega sin cajeros. Montos totales (efectivo, Yape y fiado).
 */
function htmlAutores(ventas: readonly VentaWeb[]): string {
  const sesion = sesionActual();
  if (!sesion || !hayVentasDeCajeros(ventas, sesion.bodega)) return '';
  const filas = ventasPorAutor(ventas)
    .map((a) => {
      const nombre = a.uid ? nombreDeAutor({ uid: a.uid, nombre: a.nombre }) : 'Sin registrar';
      return `<div class="autores-fila"><dt>Vendió: ${esc(nombre)} (${a.cantidad === 1 ? '1 venta' : `${a.cantidad} ventas`})</dt><dd>${esc(soles(a.total))}</dd></div>`;
    })
    .join('');
  return `<h3 class="titulo-seccion" style="margin-top:8px">Quién vendió en este turno</h3><dl class="autores">${filas}</dl>`;
}

/** Ventas del turno, la más reciente primero, con "Vendió: Rosa" si la hizo otra persona. */
function htmlVentasTurno(ventas: readonly VentaWeb[]): string {
  const normales = ventas.filter((v) => !v.anulaA);
  if (normales.length === 0) return '';
  const anuladas = new Set(ventas.filter((v) => v.anulaA).map((v) => v.anulaA));
  const ahora = new Date();
  const recientes = [...normales]
    .sort((a, b) => (fechaEfectiva(b)?.getTime() ?? 0) - (fechaEfectiva(a)?.getTime() ?? 0))
    .slice(0, 15);
  return `
    <h2 class="titulo-seccion" id="t-ventas-caja" style="margin-top:16px">Ventas de este turno</h2>
    <ul class="caja-movs" aria-labelledby="t-ventas-caja">${recientes
      .map((v) => {
        const f = fechaEfectiva(v);
        const meta = [
          f ? momentoCorto(f, ahora) : '',
          v.metodoDePago,
          esDeOtro(v.autor) ? `Vendió: ${nombreDeAutor(v.autor)}` : '',
          anuladas.has(v.id) ? 'Anulada' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const detalle = v.items.map((i) => `${i.nombre} (x${i.cantidad})`).join(', ');
        return `
        <li class="caja-venta">
          <span class="caja-mov-ico" aria-hidden="true">${icono('receipt', 18)}</span>
          <span class="caja-mov-texto">
            <span class="caja-mov-motivo">${esc(detalle || 'Venta')}</span>
            <span class="caja-mov-meta">${esc(meta)}</span>
          </span>
          <span class="caja-mov-monto">${esc(soles(v.total))}</span>
        </li>`;
      })
      .join('')}</ul>${normales.length > recientes.length ? `<p class="texto-sec">Y ${normales.length - recientes.length} ventas más.</p>` : ''}`;
}

function htmlHistorial(historial: readonly CajaWeb[]): string {
  if (historial.length === 0)
    return '<p class="texto-sec">Aún no cerraste ninguna caja. Cuando lo hagas, verás aquí cada cierre con su diferencia.</p>';
  return `
    <table class="tabla-cierres">
      <thead><tr><th scope="col">Fecha</th><th scope="col">Debería haber</th><th scope="col">Contado</th><th scope="col">Diferencia</th></tr></thead>
      <tbody>${historial
        .map((c) => {
          const ci = c.cierre;
          const tono = ci ? tonoArqueo(ci.diferencia) : 'cuadra';
          return `<tr>
            <th scope="row">${esc(periodoCaja(c))}${esDeOtro(c.cerradaPor) ? `<span class="autor-linea">Cerró: ${esc(nombreDeAutor(c.cerradaPor))}</span>` : ''}</th>
            <td data-etiqueta="Debería haber">${ci ? esc(soles(ci.esperado)) : '—'}</td>
            <td data-etiqueta="Contado">${ci ? esc(soles(ci.contado)) : '—'}</td>
            <td data-etiqueta="Diferencia"><span class="dif dif-${tono}">${ci ? esc(textoDiferencia(ci.diferencia)) : 'Sin datos'}</span></td>
          </tr>`;
        })
        .join('')}</tbody>
    </table>`;
}

// ---------- Pintado ----------
function pintarArqueo(v: VistaCaja): void {
  const zona = $c('#arqueo');
  const btn = $c<HTMLButtonElement>('#btn-confirmar-cierre');
  if (!zona) return;
  const texto = $c<HTMLInputElement>('#contado')?.value ?? '';
  const contado = leerMonto(texto);
  const esperado = v.resumen?.esperado ?? null;
  const valido = Number.isFinite(contado) && contado >= 0;
  if (btn && guardando !== 'cerrar') btn.disabled = !valido || esperado === null;
  const filaEsperado = `<div class="arqueo-fila"><span>Debería haber</span><strong>${esperado === null ? '…' : esc(soles(esperado))}</strong></div>`;
  if (!valido || esperado === null) {
    zona.className = 'arqueo';
    zona.innerHTML = `${filaEsperado}<p class="texto-sec">${texto.trim() && !valido ? 'Escribe un monto como 230 o 230.50.' : 'Escribe lo que contaste para ver la diferencia.'}</p>`;
    return;
  }
  const m = mensajeArqueo(contado, esperado);
  zona.className = `arqueo arqueo-${m.tono}`;
  zona.innerHTML = `
    ${filaEsperado}
    <div class="arqueo-fila"><span>Contaste</span><strong>${esc(soles(contado))}</strong></div>
    <div class="arqueo-resultado">
      <p class="arqueo-titulo">${icono(m.tono === 'cuadra' ? 'circle-check' : 'scale', 20)}<span>${esc(m.titulo)}</span></p>
      <p class="arqueo-detalle">${esc(m.detalle)}</p>
    </div>`;
}

function pintarAbierta(v: VistaCaja): void {
  const caja = v.abierta;
  if (!caja) return;
  const inicio = fechaEfectiva(caja.apertura);
  const desde = $c('#caja-desde span');
  const quien = esDeOtro(caja.abiertaPor) ? ` · abrió ${nombreDeAutor(caja.abiertaPor)}` : '';
  if (desde) desde.textContent = `${inicio ? `Abierta desde ${momentoCorto(inicio, new Date())}` : 'Abierta'}${quien}`;
  const esp = $c('#caja-esperado');
  if (esp) {
    esp.textContent = v.resumen ? soles(v.resumen.esperado) : '…';
    esp.setAttribute('aria-busy', String(!v.resumen));
  }
  const des = $c('#caja-desglose');
  if (des) des.innerHTML = htmlDesglose(v.resumen);
  const movs = $c('#caja-movs');
  const vivo = datos().cajaVivo;
  if (movs) movs.innerHTML = htmlMovimientos(v.movimientos, vivo?.cajaId !== caja.id || vivo.movimientos === null);
  const turno = vivo?.cajaId === caja.id && vivo.ventas ? ventasDelTurno(vivo.ventas, caja) : [];
  const autores = $c('#caja-autores');
  if (autores) autores.innerHTML = htmlAutores(turno);
  const ventasEl = $c('#caja-ventas');
  if (ventasEl) ventasEl.innerHTML = htmlVentasTurno(turno);
  if (cierreAbierto) pintarArqueo(v);
}

function pintar(): void {
  const cuerpo = $c('#caja-cuerpo');
  const hist = $c('#caja-historial');
  if (!cuerpo || !hist) return;
  const v = vistaCaja(datos(), new Date());
  const nuevoModo = v.cargando ? 'cargando' : v.abierta ? `abierta:${v.abierta.id}` : 'vacia';
  if (nuevoModo !== modo) {
    modo = nuevoModo;
    movAbierto = false;
    cierreAbierto = false;
    conteo = {};
    if (v.cargando) {
      cuerpo.innerHTML = `<div class="caja-esqueleto">${esqueletoFilas(1, 'esq-linea')}<div class="esqueleto" style="height:64px;width:50%;margin:8px 0"></div>${esqueletoFilas(4, 'esq-linea')}</div>`;
    } else if (v.abierta) {
      cuerpo.innerHTML = htmlAbierta(v.abierta);
    } else {
      cuerpo.innerHTML = htmlApertura();
    }
  }
  if (v.abierta) pintarAbierta(v);
  hist.innerHTML = v.cargando ? esqueletoFilas(2) : htmlHistorial(v.historial);
}

// ---------- Acciones ----------
function abrirFormMov(): void {
  movAbierto = true;
  const zona = $c('#caja-zona-mov');
  if (!zona) return;
  zona.innerHTML = htmlFormMov();
  $c('[data-abrir-mov]')?.setAttribute('aria-expanded', 'true');
  $c<HTMLInputElement>('#form-mov [name="monto"]')?.focus();
}

function cerrarFormMov(): void {
  movAbierto = false;
  const zona = $c('#caja-zona-mov');
  if (zona) zona.innerHTML = '';
  $c('[data-abrir-mov]')?.setAttribute('aria-expanded', 'false');
}

function cambiarTipoMov(t: TipoMovimientoCaja): void {
  tipoMov = t;
  raiz?.querySelectorAll<HTMLElement>('[data-tipo-mov]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tipoMov === t)));
  const btn = $c<HTMLButtonElement>('#btn-mov');
  if (btn && guardando !== 'mov') btn.textContent = t === 'egreso' ? 'Guardar egreso' : 'Guardar ingreso';
  const motivo = $c<HTMLInputElement>('#form-mov [name="motivo"]');
  if (motivo) motivo.placeholder = t === 'egreso' ? 'Pago al proveedor de pan' : 'Sencillo del banco';
}

function abrirCierre(): void {
  cierreAbierto = true;
  cerrarFormMov();
  const acciones = $c('#caja-acciones');
  if (acciones) acciones.hidden = true;
  const zona = $c('#caja-zona-cierre');
  if (!zona) return;
  zona.innerHTML = htmlCierre();
  pintarArqueo(vistaCaja(datos(), new Date()));
  $c<HTMLInputElement>('#contado')?.focus();
}

function cerrarPanelCierre(): void {
  cierreAbierto = false;
  conteo = {};
  const zona = $c('#caja-zona-cierre');
  if (zona) zona.innerHTML = '';
  const acciones = $c('#caja-acciones');
  if (acciones) acciones.hidden = false;
  $c<HTMLButtonElement>('[data-abrir-cierre]')?.focus();
}

async function guardar(
  op: OperacionCaja,
  btn: HTMLButtonElement | null,
  tipo: 'abrir' | 'mov' | 'cerrar',
  textos: { cargando: string; fallo: string },
): Promise<boolean> {
  guardando = tipo;
  estadoBoton(btn, 'cargando', textos.cargando);
  try {
    await fuente().guardarCaja(op);
    idEnCurso = null;
    estadoBoton(btn, 'normal');
    return true;
  } catch (error) {
    console.error('Error al guardar la caja:', error);
    estadoBoton(btn, 'error', textos.fallo);
    return false;
  } finally {
    guardando = null;
  }
}

const MSJ_SIN_INTERNET = {
  abrir: 'Sin internet no se puede abrir la caja. Ábrela cuando vuelva la conexión.',
  mov: 'Sin internet no se puede anotar el movimiento. Lo escrito sigue aquí; guárdalo cuando vuelva la conexión.',
  cerrar: 'Sin internet no se puede cerrar la caja. Tu conteo sigue aquí; ciérrala cuando vuelva la conexión.',
};

async function abrir(form: HTMLFormElement): Promise<void> {
  if (guardando) return;
  mostrarError('#error-apertura', '');
  if (sinInternet()) return mostrarError('#error-apertura', MSJ_SIN_INTERNET.abrir);
  const input = form.querySelector<HTMLInputElement>('#monto-inicial');
  const monto = leerMonto(input?.value ?? '', true);
  if (!Number.isFinite(monto) || monto < 0) {
    input?.setAttribute('aria-invalid', 'true');
    return mostrarError('#error-apertura', 'Escribe un monto como 50 o 50.50.');
  }
  input?.removeAttribute('aria-invalid');
  let op: OperacionCaja;
  try {
    const id = idPara(`abrir:${monto}`, () => fuente().nuevoIdCaja());
    op = armarApertura(datos().cajas ?? [], id, monto, Date.now());
  } catch (error) {
    return mostrarError('#error-apertura', msj(error, 'No pudimos preparar la apertura.'));
  }
  const ok = await guardar(op, form.querySelector('#btn-abrir'), 'abrir', { cargando: 'Abriendo…', fallo: 'No se abrió' });
  if (ok) avisar(`Caja abierta con ${soles(op.tipo === 'abrir' ? op.monto : 0)}`);
  else mostrarError('#error-apertura', 'No pudimos abrir la caja. Revisa tu conexión e intenta otra vez.');
}

async function registrarMov(form: HTMLFormElement): Promise<void> {
  if (guardando) return;
  mostrarError('#error-mov', '');
  if (sinInternet()) return mostrarError('#error-mov', MSJ_SIN_INTERNET.mov);
  const fd = new FormData(form);
  const montoTxt = String(fd.get('monto') ?? '');
  const motivo = String(fd.get('motivo') ?? '');
  const monto = leerMonto(montoTxt);
  if (!Number.isFinite(monto) || monto <= 0) return mostrarError('#error-mov', 'Escribe un monto mayor a cero, como 12 o 12.50.');
  const v = vistaCaja(datos(), new Date());
  let op: OperacionCaja;
  try {
    const cajaId = v.abierta?.id ?? '';
    const id = idPara(`mov:${cajaId}:${tipoMov}:${monto}:${motivo.trim()}`, () => fuente().nuevoIdMovimientoCaja(cajaId));
    op = armarMovimientoCaja(v.abierta, id, tipoMov, monto, motivo, Date.now());
  } catch (error) {
    return mostrarError('#error-mov', msj(error, 'No pudimos preparar el movimiento.'));
  }
  const tipo = tipoMov;
  const ok = await guardar(op, form.querySelector('#btn-mov'), 'mov', { cargando: 'Guardando…', fallo: 'No se guardó' });
  if (ok) {
    avisar(tipo === 'ingreso' ? 'Ingreso anotado' : 'Egreso anotado');
    cerrarFormMov();
    $c<HTMLButtonElement>('[data-abrir-mov]')?.focus();
  } else {
    mostrarError('#error-mov', 'No pudimos guardar el movimiento. Revisa tu conexión e intenta otra vez.');
  }
}

async function confirmarCierre(btn: HTMLButtonElement): Promise<void> {
  if (guardando) return;
  mostrarError('#error-cierre', '');
  if (sinInternet()) return mostrarError('#error-cierre', MSJ_SIN_INTERNET.cerrar);
  const contado = leerMonto($c<HTMLInputElement>('#contado')?.value ?? '');
  // El esperado se recalcula en este instante: lo que se guarda es lo que se ve.
  const v = vistaCaja(datos(), new Date());
  if (!v.resumen) return mostrarError('#error-cierre', 'Todavía estamos sumando las ventas. Intenta en un momento.');
  let op: OperacionCaja;
  try {
    op = armarCierre(v.abierta, contado, v.resumen.esperado, Date.now());
  } catch (error) {
    return mostrarError('#error-cierre', msj(error, 'Escribe un monto como 230 o 230.50.'));
  }
  const ok = await guardar(op, btn, 'cerrar', { cargando: 'Cerrando…', fallo: 'No se cerró' });
  if (ok && op.tipo === 'cerrar') {
    const m = mensajeArqueo(op.cierre.contado, op.cierre.esperado);
    avisar(`Caja cerrada · ${m.titulo}`);
  } else if (!ok) {
    mostrarError('#error-cierre', 'No pudimos cerrar la caja. Revisa tu conexión e intenta otra vez.');
  }
}

function alEscribirConteo(input: HTMLInputElement): void {
  const d = input.dataset.denom;
  if (!d) return;
  const n = Number.parseInt(input.value.replace(/\D/g, ''), 10);
  conteo[d] = Number.isFinite(n) && n > 0 ? n : 0;
  const total = totalConteo(conteo);
  const contado = $c<HTMLInputElement>('#contado');
  if (contado) contado.value = total > 0 ? total.toFixed(2) : '';
  pintarArqueo(vistaCaja(datos(), new Date()));
}

export function montarCaja(contenedor: HTMLElement): void {
  raiz = contenedor;
  modo = '';
  contenedor.innerHTML = `
    <div class="vista caja">
      <h1 class="titulo-pagina">Caja</h1>
      <p class="hoy-fecha">El efectivo del cajón, de la apertura al cierre.</p>
      <div id="caja-cuerpo"></div>
      <section class="caja-historial" aria-labelledby="t-cierres">
        <h2 class="titulo-seccion" id="t-cierres">Cierres anteriores</h2>
        <div id="caja-historial"></div>
      </section>
    </div>`;

  contenedor.addEventListener('click', (e) => {
    const t = e.target as Element;
    const atajo = t.closest<HTMLElement>('[data-atajo]');
    if (atajo?.dataset.atajo) {
      const input = $c<HTMLInputElement>('#monto-inicial');
      if (input) {
        input.value = atajo.dataset.atajo;
        input.removeAttribute('aria-invalid');
        input.focus();
      }
      return;
    }
    if (t.closest('[data-abrir-mov]')) return movAbierto ? cerrarFormMov() : abrirFormMov();
    if (t.closest('[data-cancelar-mov]')) {
      cerrarFormMov();
      $c<HTMLButtonElement>('[data-abrir-mov]')?.focus();
      return;
    }
    const tipo = t.closest<HTMLElement>('[data-tipo-mov]');
    if (tipo?.dataset.tipoMov) return cambiarTipoMov(tipo.dataset.tipoMov as TipoMovimientoCaja);
    if (t.closest('[data-abrir-cierre]')) return abrirCierre();
    if (t.closest('[data-cancelar-cierre]')) return cerrarPanelCierre();
    const conf = t.closest<HTMLButtonElement>('#btn-confirmar-cierre');
    if (conf) void confirmarCierre(conf);
  });

  contenedor.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    e.preventDefault();
    if (form.id === 'form-apertura') void abrir(form);
    else if (form.id === 'form-mov') void registrarMov(form);
  });

  contenedor.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.denom) return alEscribirConteo(t);
    if (t.id === 'contado') pintarArqueo(vistaCaja(datos(), new Date()));
  });

  contenedor.addEventListener('keydown', (e) => {
    // Enter en el contado = confirmar (si se puede); Escape cierra el panel de cierre.
    const t = e.target as HTMLElement;
    if (e.key === 'Enter' && t.id === 'contado') {
      e.preventDefault();
      const btn = $c<HTMLButtonElement>('#btn-confirmar-cierre');
      if (btn && !btn.disabled) void confirmarCierre(btn);
    } else if (e.key === 'Escape' && cierreAbierto && !guardando) {
      cerrarPanelCierre();
    }
  });

  pintar();
}

export function mostrarCaja(): void {
  sincronizarCajaVivo();
  pintar();
}

export function renderCaja(_e: EstadoDatos): void {
  pintar();
}

export function reiniciarCaja(): void {
  modo = '';
  guardando = null;
  movAbierto = false;
  cierreAbierto = false;
  conteo = {};
  idEnCurso = null;
  tipoMov = 'egreso';
  const c = raiz?.querySelector('#caja-cuerpo');
  if (c) c.innerHTML = '';
}
