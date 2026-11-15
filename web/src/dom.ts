import { formatearSoles } from '@bodegon/core';

import { icono } from './icons';

// --- Seguridad: escapar texto de usuario antes de insertarlo con innerHTML (evita XSS) ---
const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

/** Dinero: siempre con las reglas del core (céntimos, `S/ 1,234.50`). */
export const soles = (n: unknown): string => formatearSoles(Number(n) || 0);

export const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

/** Lanza si falta (solo para el HTML propio de cada vista). */
export function req<T extends HTMLElement = HTMLElement>(raiz: ParentNode, sel: string): T {
  const el = raiz.querySelector<T>(sel);
  if (!el) throw new Error(`Falta ${sel}`);
  return el;
}

export const reduceMovimiento = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Puntero preciso (mouse): ahí sí conviene mantener el foco en la búsqueda. */
export const punteroFino = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(pointer: fine)').matches;

// --- Botones con 8 estados (normal/hover/focus/active por CSS; aquí cargando/error/éxito) ---
export type EstadoBoton = 'normal' | 'cargando' | 'error' | 'exito';
const textosOriginales = new WeakMap<HTMLButtonElement, string>();

export function estadoBoton(btn: HTMLButtonElement | null, estado: EstadoBoton, texto?: string): void {
  if (!btn) return;
  if (!textosOriginales.has(btn)) textosOriginales.set(btn, btn.innerHTML);
  btn.dataset.estado = estado;
  btn.setAttribute('aria-busy', String(estado === 'cargando'));
  btn.disabled = estado === 'cargando';
  if (estado === 'normal') {
    btn.innerHTML = textosOriginales.get(btn) ?? btn.innerHTML;
    textosOriginales.delete(btn);
    return;
  }
  const pre =
    estado === 'cargando'
      ? '<span class="spinner" aria-hidden="true"></span>'
      : estado === 'exito'
        ? icono('check', 18)
        : icono('alert', 18);
  btn.innerHTML = `${pre}<span>${esc(texto ?? '')}</span>`;
  if (estado !== 'cargando') setTimeout(() => estadoBoton(btn, 'normal'), 1600);
}

// --- Aviso (toast) con aria-live ---
let timerAviso: ReturnType<typeof setTimeout> | null = null;
export function avisar(mensaje: string, tipo: 'ok' | 'error' = 'ok'): void {
  const el = $('aviso');
  if (!el) return;
  el.dataset.tipo = tipo;
  el.innerHTML = `${icono(tipo === 'ok' ? 'circle-check' : 'alert', 18)}<span>${esc(mensaje)}</span>`;
  el.hidden = false;
  if (timerAviso) clearTimeout(timerAviso);
  timerAviso = setTimeout(() => {
    el.hidden = true;
  }, tipo === 'error' ? 6000 : 3200);
}

// --- Panel lateral (editor de producto, detalle de cliente, recordatorio) ---
let alCerrarPanel: (() => void) | null = null;
let focoPrevio: HTMLElement | null = null;

export function abrirPanel(titulo: string, cuerpo: string, alCerrar?: () => void): HTMLElement {
  const panel = $('panel');
  const fondo = $('panel-fondo');
  if (!panel || !fondo) throw new Error('Falta #panel');
  // Si ya había un panel (p. ej. detalle → recordatorio), se da por cerrado el anterior.
  const previo = alCerrarPanel;
  alCerrarPanel = null;
  previo?.();
  if (panel.hidden) focoPrevio = document.activeElement as HTMLElement | null;
  alCerrarPanel = alCerrar ?? null;
  panel.innerHTML = `
    <header class="panel-cabecera">
      <h2 id="panel-titulo" class="panel-titulo">${esc(titulo)}</h2>
      <button type="button" class="btn-icono" data-cerrar-panel aria-label="Cerrar">${icono('x', 20)}</button>
    </header>
    <div class="panel-cuerpo">${cuerpo}</div>`;
  panel.hidden = false;
  fondo.hidden = false;
  document.body.classList.add('con-panel');
  requestAnimationFrame(() => panel.classList.add('abierto'));
  const primero = panel.querySelector<HTMLElement>('[autofocus], input, button:not([data-cerrar-panel])');
  primero?.focus();
  return panel;
}

export function cerrarPanel(): void {
  const panel = $('panel');
  const fondo = $('panel-fondo');
  if (!panel || panel.hidden) return;
  panel.classList.remove('abierto');
  panel.hidden = true;
  if (fondo) fondo.hidden = true;
  document.body.classList.remove('con-panel');
  panel.innerHTML = '';
  const fn = alCerrarPanel;
  alCerrarPanel = null;
  fn?.();
  focoPrevio?.focus?.();
  focoPrevio = null;
}

export const panelAbierto = (): boolean => !!$('panel') && !$('panel')!.hidden;

/**
 * Confirmación destructiva DENTRO de la página (nunca window.confirm): reemplaza el
 * contenido de `contenedor` por la pregunta y dos botones; resuelve true/false.
 */
export function confirmarEnLinea(
  contenedor: HTMLElement,
  opciones: { pregunta: string; detalle?: string; accion: string },
): Promise<boolean> {
  const previo = contenedor.innerHTML;
  contenedor.innerHTML = `
    <div class="confirmacion" role="alertdialog" aria-labelledby="conf-p">
      <p id="conf-p" class="confirmacion-pregunta">${esc(opciones.pregunta)}</p>
      ${opciones.detalle ? `<p class="texto-sec">${esc(opciones.detalle)}</p>` : ''}
      <div class="fila-botones">
        <button type="button" class="btn btn-peligro" data-si>${esc(opciones.accion)}</button>
        <button type="button" class="btn btn-secundario" data-no>Cancelar</button>
      </div>
    </div>`;
  const no = contenedor.querySelector<HTMLButtonElement>('[data-no]');
  no?.focus();
  return new Promise((resolve) => {
    const fin = (r: boolean) => {
      contenedor.innerHTML = previo;
      resolve(r);
    };
    contenedor.querySelector('[data-si]')?.addEventListener('click', () => fin(true), { once: true });
    no?.addEventListener('click', () => fin(false), { once: true });
  });
}

const escAtributo = (v: string): string => v.replace(/["\\]/g, '\\$&');

/**
 * Repinta `cont` sin perder el foco del teclado: si el foco estaba en un botón con data-*
 * (p. ej. "+" de stock), se devuelve al botón equivalente del HTML nuevo.
 */
export function repintar(cont: Element, html: string): void {
  const activo = document.activeElement as HTMLElement | null;
  let selector: string | null = null;
  if (activo && activo !== document.body && cont.contains(activo)) {
    const datosAttr = Object.entries(activo.dataset)
      .map(([k, v]) => `[data-${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}="${escAtributo(v ?? '')}"]`)
      .join('');
    if (datosAttr) selector = `${activo.tagName.toLowerCase()}${datosAttr}`;
    else if (activo.id) selector = `[id="${escAtributo(activo.id)}"]`;
  }
  cont.innerHTML = html;
  if (selector) cont.querySelector<HTMLElement>(selector)?.focus();
}

/** Esqueleto con la forma real de una lista. */
export const esqueletoFilas = (n: number, clase = 'esq-fila'): string =>
  Array.from({ length: n }, () => `<div class="esqueleto ${clase}" aria-hidden="true"></div>`).join('');

/** Estado vacío con salida: qué hacer y un botón. */
export function vacio(opc: {
  icono: Parameters<typeof icono>[0];
  titulo: string;
  texto: string;
  accion?: { etiqueta: string; atributo: string };
}): string {
  return `
    <div class="vacio">
      <span class="vacio-ico">${icono(opc.icono, 28)}</span>
      <p class="vacio-titulo">${esc(opc.titulo)}</p>
      <p class="texto-sec">${esc(opc.texto)}</p>
      ${opc.accion ? `<button type="button" class="btn btn-primario" ${opc.accion.atributo}>${esc(opc.accion.etiqueta)}</button>` : ''}
    </div>`;
}
