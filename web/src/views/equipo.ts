import {
  cambiarActivoCajero,
  cuposCajeros,
  ErrorDominio,
  formatearCodigo,
  hoyLima,
  invitarCajero,
  MAX_CAJEROS_ACTIVOS,
  mensajeInvitacion,
  quitarCajero,
  rangoDiasLima,
  type Invitacion,
  type Miembro,
} from '@bodegon/core';

import { datos, fuente, type EstadoDatos } from '../datos';
import { avisar, confirmarEnLinea, esc, esqueletoFilas, estadoBoton, soles } from '../dom';
import { repoEquipo } from '../equipo';
import { icono } from '../icons';
import type { Cancelar } from '../listeners';
import { iniciales } from '../logic/cobranza';
import {
  enlaceWhatsAppTexto,
  invitacionesVigentes,
  mensajeErrorEquipo,
  ocupanCupo,
  textoVence,
  ventasPorAutor,
  type VentasDeAutor,
} from '../logic/equipo';
import type { VentaWeb } from '../mappers';
import { permite, sesionActual } from '../sesion';

/**
 * Ajustes → Equipo (solo el dueño, `gestionarEquipo`): invitar cajeros con un código que se
 * comparte por WhatsApp, ver las invitaciones sin usar, y activar, pausar o quitar a cada
 * cajero, con lo que vendió hoy. Hasta 3 activos (la app lo controla; docs/roles.md).
 */
let raiz: HTMLElement | null = null;
let miembros: Miembro[] | null = null;
let invitaciones: Invitacion[] | null = null;
let ventasHoy: VentaWeb[] | null = null;
let diaVentas = '';
let cancelarVentas: Cancelar | null = null;
let observando = false;
let errorCarga = '';
let recien: { invitacion: Invitacion; mensaje: string } | null = null;
let invitando = false;

const $e = <T extends HTMLElement = HTMLElement>(sel: string): T | null => raiz?.querySelector<T>(sel) ?? null;

function observar(): void {
  const sesion = sesionActual();
  if (!sesion || !permite('gestionarEquipo')) return;
  if (!observando) {
    observando = true;
    errorCarga = '';
    const repo = repoEquipo();
    const alError = (e: Error) => {
      errorCarga = e.message;
      pintar();
    };
    // Quedan en el registro global (listeners.ts): se cierran al salir.
    repo.observarMiembros(
      sesion.bodega,
      (m) => {
        miembros = m;
        pintar();
      },
      alError,
    );
    repo.observarInvitaciones(
      sesion.uid,
      (i) => {
        invitaciones = i;
        pintar();
      },
      alError,
    );
  }
  // Lo que vendió hoy cada cajero (las ventas de hoy, como en la pantalla Hoy).
  const hoy = hoyLima();
  if (cancelarVentas && diaVentas === hoy) return;
  cancelarVentas?.();
  diaVentas = hoy;
  ventasHoy = null;
  try {
    cancelarVentas = fuente().observarRango(
      rangoDiasLima(hoy, hoy),
      (v) => {
        ventasHoy = v;
        pintar();
      },
      () => {
        ventasHoy = [];
        pintar();
      },
    );
  } catch (e) {
    console.error('Error al observar las ventas de hoy:', e);
  }
}

// ---------- HTML ----------

export function textoVentasHoy(v: VentasDeAutor | undefined, cargando: boolean): string {
  if (cargando) return '';
  if (!v || v.cantidad === 0) return 'Hoy no vendió';
  return `Hoy vendió ${soles(v.total)} en ${v.cantidad === 1 ? '1 venta' : `${v.cantidad} ventas`}`;
}

function htmlInvitar(cupos: number): string {
  if (recien) {
    const { invitacion, mensaje } = recien;
    return `
      <div class="bloque" id="invitacion-nueva">
        <span class="etiqueta">Código de invitación</span>
        <p class="codigo-grande" id="codigo-nuevo">${esc(formatearCodigo(invitacion.codigo))}</p>
        <p class="texto-sec">${esc(textoVence(invitacion, new Date()))}. Sirve una sola vez.</p>
        <span class="etiqueta">Mensaje para tu cajero</span>
        <p class="recordatorio-preview">${esc(mensaje)}</p>
        <div class="fila-botones">
          <a class="btn btn-primario" href="${esc(enlaceWhatsAppTexto(mensaje))}" target="_blank" rel="noopener noreferrer">${icono('message', 18)} Enviar por WhatsApp</a>
          <button type="button" class="btn btn-secundario" data-copiar>${icono('copy', 18)} Copiar mensaje</button>
          <button type="button" class="btn btn-fantasma" data-listo>Listo</button>
        </div>
      </div>`;
  }
  const lleno = cupos === 0;
  return `
    <p class="texto-sec" id="equipo-cupos">${
      lleno
        ? `Ya tienes ${MAX_CAJEROS_ACTIVOS} cajeros activos, contando las invitaciones sin usar. Pausa a uno o cancela una invitación para invitar a otro.`
        : `Puedes tener hasta ${MAX_CAJEROS_ACTIVOS} cajeros activos. ${cupos === 1 ? 'Te queda 1 cupo.' : `Te quedan ${cupos} cupos.`}`
    }</p>
    <div><button type="button" class="btn btn-primario" data-invitar ${lleno ? 'disabled' : ''}>${icono('user-plus', 18)} Invitar cajero</button></div>`;
}

function htmlInvitaciones(vigentes: readonly Invitacion[]): string {
  if (vigentes.length === 0) return '';
  const ahora = new Date();
  return `
    <section class="equipo-seccion" aria-labelledby="t-invitaciones">
      <h2 class="titulo-seccion" id="t-invitaciones">Invitaciones sin usar</h2>
      <ul class="equipo-lista">${vigentes
        .map((i) => {
          const mensaje = mensajeInvitacion({ nombreBodega: i.nombreBodega, codigo: i.codigo });
          return `
          <li class="equipo-fila" data-fila-invitacion="${esc(i.codigo)}">
            <span class="monograma" aria-hidden="true">${icono('key', 18)}</span>
            <div>
              <p class="equipo-nombre">${esc(formatearCodigo(i.codigo))}</p>
              <p class="equipo-meta">${esc(textoVence(i, ahora))}</p>
            </div>
            <div class="equipo-acciones">
              <a class="btn btn-secundario btn-sm" href="${esc(enlaceWhatsAppTexto(mensaje))}" target="_blank" rel="noopener noreferrer" aria-label="Enviar el código ${esc(formatearCodigo(i.codigo))} por WhatsApp">${icono('message', 18)} Enviar</a>
              <button type="button" class="btn btn-fantasma btn-sm" data-revocar="${esc(i.codigo)}">Cancelar</button>
            </div>
            <div class="equipo-confirmar" hidden></div>
          </li>`;
        })
        .join('')}</ul>
    </section>`;
}

function htmlCajeros(lista: readonly Miembro[]): string {
  const porAutor = new Map((ventasHoy ? ventasPorAutor(ventasHoy) : []).map((v) => [v.uid, v]));
  const cuerpo = lista.length
    ? `<ul class="equipo-lista">${lista
        .map((m) => {
          const nombre = m.nombre || 'Cajero';
          const meta = [m.email, m.activo ? textoVentasHoy(porAutor.get(m.uid), ventasHoy === null) : 'En pausa: no puede entrar']
            .filter(Boolean)
            .join(' · ');
          return `
          <li class="equipo-fila" data-fila-cajero="${esc(m.uid)}">
            <span class="monograma${m.activo ? '' : ' pausa'}" aria-hidden="true">${esc(iniciales(nombre))}</span>
            <div>
              <p class="equipo-nombre">${esc(nombre)}</p>
              <p class="equipo-meta">${esc(meta)}</p>
            </div>
            <div class="equipo-acciones">
              <button type="button" class="interruptor" role="switch" aria-checked="${m.activo}" data-activo="${esc(m.uid)}" aria-label="Acceso de ${esc(nombre)}">
                <span class="interruptor-pista" aria-hidden="true"></span><span>${m.activo ? 'Activo' : 'En pausa'}</span>
              </button>
              <button type="button" class="btn btn-fantasma btn-sm" data-quitar="${esc(m.uid)}">${icono('user-minus', 18)} Quitar</button>
            </div>
            <div class="equipo-confirmar" hidden></div>
          </li>`;
        })
        .join('')}</ul>`
    : `<p class="texto-sec">Todavía no tienes cajeros. Invita a quien te ayuda en la tienda: vende desde su celular o su compu, y tú ves quién vendió cada cosa.</p>`;
  return `
    <section class="equipo-seccion" aria-labelledby="t-cajeros">
      <h2 class="titulo-seccion" id="t-cajeros">Cajeros</h2>
      ${cuerpo}
    </section>`;
}

function pintar(): void {
  const cuerpo = $e('#equipo-cuerpo');
  if (!cuerpo) return;
  // Una confirmación abierta no se pisa con los datos que llegan.
  if (cuerpo.querySelector('.confirmacion')) return;
  if (errorCarga && (miembros === null || invitaciones === null)) {
    cuerpo.innerHTML = `<p class="mensaje-error">${icono('alert', 18)}<span>${esc(errorCarga)}</span></p>`;
    return;
  }
  if (miembros === null || invitaciones === null) {
    cuerpo.innerHTML = esqueletoFilas(3);
    return;
  }
  const vigentes = invitacionesVigentes(invitaciones, new Date());
  const cupos = cuposCajeros(ocupanCupo(miembros, vigentes));
  cuerpo.innerHTML = `
    <section class="equipo-seccion" aria-labelledby="t-invitar">
      <h2 class="titulo-seccion" id="t-invitar">Invitar cajero</h2>
      ${htmlInvitar(cupos)}
      <p class="mensaje-error" id="error-equipo" role="alert" hidden></p>
    </section>
    ${htmlInvitaciones(vigentes)}
    ${htmlCajeros(miembros)}`;
}

function mostrarError(texto: string): void {
  const el = $e('#error-equipo');
  if (!el) return avisar(texto, 'error');
  el.textContent = texto;
  el.hidden = !texto;
}

// ---------- Acciones ----------

async function invitar(btn: HTMLButtonElement): Promise<void> {
  const sesion = sesionActual();
  if (!sesion || invitando || miembros === null || invitaciones === null) return;
  invitando = true;
  estadoBoton(btn, 'cargando', 'Creando el código…');
  try {
    const vigentes = invitacionesVigentes(invitaciones, new Date());
    recien = await invitarCajero(repoEquipo(), {
      sesion,
      nombreBodega: datos().nombreBodega ?? 'Mi Bodega',
      miembros: ocupanCupo(miembros, vigentes),
      ahora: new Date(),
      rng: azarSeguro,
    });
    invitando = false;
    pintar();
    $e<HTMLElement>('#codigo-nuevo')?.focus();
  } catch (error) {
    invitando = false;
    console.error('Error al crear la invitación:', error);
    estadoBoton(btn, 'normal');
    mostrarError(mensajeErrorEquipo(error, 'No pudimos crear la invitación. Revisa tu conexión e intenta otra vez.'));
  }
}

/** Número en [0, 1) con `crypto.getRandomValues` (el código no debe ser adivinable). */
function azarSeguro(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 2 ** 32;
}

async function confirmarEnFila(boton: HTMLElement, opciones: Parameters<typeof confirmarEnLinea>[1]): Promise<boolean> {
  const zona = boton.closest('li')?.querySelector<HTMLElement>('.equipo-confirmar');
  if (!zona) return false;
  zona.hidden = false;
  const ok = await confirmarEnLinea(zona, opciones);
  zona.hidden = true;
  return ok;
}

async function revocar(boton: HTMLElement, codigo: string): Promise<void> {
  const ok = await confirmarEnFila(boton, {
    pregunta: `¿Cancelar la invitación ${formatearCodigo(codigo)}?`,
    detalle: 'El código dejará de servir. Si ya lo enviaste, nadie podrá usarlo.',
    accion: 'Sí, cancelar',
  });
  if (!ok) return pintar();
  try {
    await repoEquipo().borrarInvitacion(codigo);
    if (recien?.invitacion.codigo === codigo) recien = null;
    avisar('Invitación cancelada');
  } catch (error) {
    console.error('Error al cancelar la invitación:', error);
    avisar(mensajeErrorEquipo(error, 'No pudimos cancelarla. Intenta otra vez.'), 'error');
  }
  pintar();
}

async function cambiarActivo(boton: HTMLButtonElement, uid: string): Promise<void> {
  const sesion = sesionActual();
  const m = miembros?.find((x) => x.uid === uid);
  if (!sesion || !m || !miembros || !invitaciones) return;
  const activar = !m.activo;
  if (activar && cuposCajeros(ocupanCupo(miembros, invitacionesVigentes(invitaciones, new Date()))) === 0) {
    mostrarError(new ErrorDominio('LIMITE_CAJEROS').message);
    return;
  }
  boton.disabled = true;
  try {
    await cambiarActivoCajero(repoEquipo(), sesion, uid, activar);
    avisar(activar ? `${m.nombre || 'El cajero'} puede volver a vender` : `${m.nombre || 'El cajero'} quedó en pausa`);
  } catch (error) {
    console.error('Error al cambiar el acceso:', error);
    boton.disabled = false;
    mostrarError(mensajeErrorEquipo(error, 'No pudimos cambiar su acceso. Revisa tu conexión e intenta otra vez.'));
  }
}

async function quitar(boton: HTMLElement, uid: string): Promise<void> {
  const sesion = sesionActual();
  const m = miembros?.find((x) => x.uid === uid);
  if (!sesion || !m) return;
  const nombre = m.nombre || 'este cajero';
  const ok = await confirmarEnFila(boton, {
    pregunta: `¿Quitar a ${nombre} del equipo?`,
    detalle: 'Pierde el acceso al instante. Sus ventas quedan registradas. Para que vuelva necesitará una invitación nueva.',
    accion: 'Sí, quitar',
  });
  if (!ok) return pintar();
  try {
    await quitarCajero(repoEquipo(), sesion, uid);
    avisar(`${m.nombre || 'El cajero'} ya no está en tu equipo`);
  } catch (error) {
    console.error('Error al quitar al cajero:', error);
    avisar(mensajeErrorEquipo(error, 'No pudimos quitarlo. Intenta otra vez.'), 'error');
  }
  pintar();
}

export function montarEquipo(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista equipo">
      <a class="enlace equipo-volver" href="#ajustes">${icono('chevron-right', 16)} Ajustes</a>
      <h1 class="titulo-pagina">Equipo</h1>
      <p class="hoy-fecha">Tus cajeros venden, fían y cobran con su propia cuenta. No ven reportes ni ganancias, no cambian precios y no pueden borrar nada.</p>
      <div id="equipo-cuerpo"></div>
    </div>`;
  contenedor.addEventListener('click', (e) => {
    const t = e.target as Element;
    const inv = t.closest<HTMLButtonElement>('[data-invitar]');
    if (inv) return void invitar(inv);
    if (t.closest('[data-listo]')) {
      recien = null;
      pintar();
      $e<HTMLButtonElement>('[data-invitar]')?.focus();
      return;
    }
    if (t.closest('[data-copiar]') && recien) {
      const texto = recien.mensaje;
      void navigator.clipboard
        ?.writeText(texto)
        .then(() => avisar('Mensaje copiado. Pégalo en WhatsApp o donde quieras.'))
        .catch(() => avisar('No se pudo copiar. Mantén presionado el mensaje para copiarlo.', 'error'));
      return;
    }
    const rev = t.closest<HTMLElement>('[data-revocar]');
    if (rev?.dataset.revocar) return void revocar(rev, rev.dataset.revocar);
    const act = t.closest<HTMLButtonElement>('[data-activo]');
    if (act?.dataset.activo) return void cambiarActivo(act, act.dataset.activo);
    const q = t.closest<HTMLElement>('[data-quitar]');
    if (q?.dataset.quitar) void quitar(q, q.dataset.quitar);
  });
}

export function mostrarEquipo(): void {
  observar();
  pintar();
}

export const renderEquipo = (_e: EstadoDatos): void => pintar();

/** Logout: el registro global ya cerró los listeners; aquí se olvida el estado. */
export function reiniciarEquipo(): void {
  cancelarVentas = null;
  observando = false;
  miembros = null;
  invitaciones = null;
  ventasHoy = null;
  diaVentas = '';
  errorCarga = '';
  recien = null;
  invitando = false;
  const c = raiz?.querySelector('#equipo-cuerpo');
  if (c) c.innerHTML = '';
}
