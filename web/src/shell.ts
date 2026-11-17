import { productosConStockBajo, type Permiso } from '@bodegon/core';

import { iniciarCajaVivo, reiniciarCajaVivo } from './cajaVivo';
import { datos, suscribirDatos, type EstadoDatos } from './datos';
import { $, cerrarPanel, esc, panelAbierto } from './dom';
import { icono, type NombreIcono } from './icons';
import { aplicarPermisos, permite } from './sesion';
import { alternarTema, alCambiarTema, temaActual } from './theme';
import { montarAjustes, mostrarAjustes, renderAjustes } from './views/ajustes';
import { montarCaja, mostrarCaja, reiniciarCaja, renderCaja } from './views/caja';
import { montarCobrar, mostrarCobrar, renderCobrar } from './views/cobrar';
import { abrirEditorProducto } from './views/editores';
import { montarEquipo, mostrarEquipo, reiniciarEquipo, renderEquipo } from './views/equipo';
import { montarHoy, mostrarHoy, reiniciarHoy, renderHoy } from './views/hoy';
import { montarProductos, mostrarProductos, reiniciarProductos, renderProductos } from './views/productos';
import { montarReportes, mostrarReportes, reiniciarReportes } from './views/reportes';
import { montarVender, mostrarVender, reiniciarVender, renderVender, teclaVender } from './views/vender';

/** App shell: riel lateral (escritorio), barra inferior (celular), rutas por hash. */
export type IdVista = 'hoy' | 'vender' | 'cobrar' | 'productos' | 'caja' | 'reportes' | 'ajustes' | 'equipo';

interface Destino {
  id: IdVista;
  etiqueta: string;
  icono: NombreIcono;
  montar: (c: HTMLElement) => void;
  mostrar: () => void;
  render?: (e: EstadoDatos) => void;
  /** Solo para quien tiene este permiso del core (D-33): el cajero no ve Reportes ni Equipo. */
  permiso?: Permiso;
  /** Sin entrada en el riel ni en la barra (se llega desde otra pantalla). */
  oculto?: boolean;
  /** Destino que se marca como actual en la navegación (Equipo vive dentro de Ajustes). */
  marca?: IdVista;
}

const DESTINOS: Destino[] = [
  { id: 'hoy', etiqueta: 'Hoy', icono: 'house', montar: montarHoy, mostrar: mostrarHoy, render: renderHoy },
  { id: 'vender', etiqueta: 'Vender', icono: 'receipt', montar: montarVender, mostrar: mostrarVender, render: renderVender },
  { id: 'cobrar', etiqueta: 'Por cobrar', icono: 'notebook', montar: montarCobrar, mostrar: mostrarCobrar, render: renderCobrar },
  { id: 'productos', etiqueta: 'Productos', icono: 'package', montar: montarProductos, mostrar: mostrarProductos, render: renderProductos },
  { id: 'caja', etiqueta: 'Caja', icono: 'vault', montar: montarCaja, mostrar: mostrarCaja, render: renderCaja },
  { id: 'reportes', etiqueta: 'Reportes', icono: 'chart', montar: montarReportes, mostrar: mostrarReportes, permiso: 'verReportes' },
  { id: 'ajustes', etiqueta: 'Ajustes', icono: 'settings', montar: montarAjustes, mostrar: mostrarAjustes, render: renderAjustes },
  {
    id: 'equipo',
    etiqueta: 'Equipo',
    icono: 'users',
    montar: montarEquipo,
    mostrar: mostrarEquipo,
    render: renderEquipo,
    permiso: 'gestionarEquipo',
    oculto: true,
    marca: 'ajustes',
  },
];

/** En el celular, Caja y Ajustes van arriba a la derecha: la barra inferior tiene 5 destinos. */
const EN_BARRA_MOVIL: IdVista[] = ['hoy', 'vender', 'cobrar', 'productos', 'reportes'];

let actual: IdVista | null = null;
let montado = false;

const esVista = (v: string): v is IdVista => DESTINOS.some((d) => d.id === v);

const permitido = (d: Destino | undefined): boolean => !d?.permiso || permite(d.permiso);

function navItem(d: Destino, conInsignia = true): string {
  return `<a class="nav-item" href="#${d.id}" data-nav="${d.id}"${d.permiso ? ` data-permiso="${d.permiso}"` : ''}>
    ${icono(d.icono, 22)}<span>${esc(d.etiqueta)}</span>${conInsignia && d.id === 'productos' ? '<span class="nav-insignia" data-insignia hidden></span>' : ''}
  </a>`;
}

function htmlShell(): string {
  const riel = DESTINOS.filter((d) => d.id !== 'ajustes' && !d.oculto).map((d) => navItem(d));
  return `
    <a href="#contenido" class="sr-only">Saltar al contenido</a>
    <nav class="riel" aria-label="Secciones">
      <span class="riel-marca" aria-hidden="true">${icono('store', 22)}</span>
      ${riel.join('')}
      <div class="riel-pie">
        <button type="button" class="nav-item" data-alternar-tema aria-label="Cambiar a modo noche">${icono('moon', 22)}<span>Tema</span></button>
        ${navItem(DESTINOS.find((d) => d.id === 'ajustes')!)}
      </div>
    </nav>
    <header class="cabecera-movil">
      <span class="riel-marca" aria-hidden="true">${icono('store', 20)}</span>
      <span class="cabecera-movil-nombre" id="nombre-movil">Bodegón Digital</span>
      <button type="button" class="btn-icono" data-alternar-tema aria-label="Cambiar a modo noche">${icono('moon', 22)}</button>
      <a class="btn-icono" href="#caja" data-nav="caja" aria-label="Caja">${icono('vault', 22)}</a>
      <a class="btn-icono" href="#ajustes" data-nav="ajustes" aria-label="Ajustes">${icono('settings', 22)}</a>
    </header>
    <main class="contenido" id="contenido" tabindex="-1">
      ${DESTINOS.map((d) => `<section id="vista-${d.id}" data-vista="${d.id}" hidden></section>`).join('')}
    </main>
    <nav class="barra-movil" aria-label="Secciones">
      ${DESTINOS.filter((d) => EN_BARRA_MOVIL.includes(d.id)).map((d) => navItem(d)).join('')}
    </nav>`;
}

function pintarBotonTema(): void {
  const oscuro = temaActual() === 'oscuro';
  document.querySelectorAll<HTMLElement>('[data-alternar-tema]').forEach((b) => {
    b.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo noche');
    const ico = b.querySelector('svg');
    if (ico) ico.outerHTML = icono(oscuro ? 'sun' : 'moon', 22);
  });
}

function pintarComun(e: EstadoDatos): void {
  const n = $('nombre-movil');
  if (n) n.textContent = e.nombreBodega ?? 'Bodegón Digital';
  // Insignia ámbar = productos que se acaban (único otro uso permitido del ámbar).
  const bajos = e.productos ? productosConStockBajo(e.productos).length : 0;
  document.querySelectorAll<HTMLElement>('[data-insignia]').forEach((s) => {
    s.hidden = bajos === 0;
    s.textContent = String(bajos);
    s.setAttribute('aria-label', `${bajos} se acaban`);
  });
}

export function navegar(destino: IdVista, enfocar = true): void {
  if (panelAbierto()) cerrarPanel();
  // Una ruta que el rol no puede ver (p. ej. #reportes para el cajero) lleva a Hoy.
  let id = destino;
  if (!permitido(DESTINOS.find((x) => x.id === id))) {
    id = 'hoy';
    if (location.hash !== '#hoy') history.replaceState(null, '', '#hoy');
  }
  actual = id;
  for (const d of DESTINOS) {
    const sec = $(`vista-${d.id}`);
    if (sec) sec.hidden = d.id !== id;
  }
  const marca = DESTINOS.find((x) => x.id === id)?.marca ?? id;
  document.querySelectorAll<HTMLElement>('[data-nav]').forEach((a) => {
    if (a.dataset.nav === marca) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const d = DESTINOS.find((x) => x.id === id);
  document.title = `${d?.etiqueta ?? 'Hoy'} · Bodegón Digital`;
  d?.mostrar();
  if (enfocar && id !== 'vender') {
    // Lectores de pantalla: el foco va al título de la nueva vista.
    $(`vista-${id}`)?.querySelector<HTMLElement>('h1')?.setAttribute('tabindex', '-1');
    $(`vista-${id}`)?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }
  window.scrollTo({ top: 0 });
}

function rutaDelHash(): IdVista {
  const h = location.hash.replace('#', '');
  return esVista(h) ? h : 'hoy';
}

function actualizarSinRed(): void {
  const b = $('sin-red');
  if (b) b.hidden = navigator.onLine;
}

/** Monta el shell una sola vez (DOM + eventos globales). */
export function montarShell(): void {
  if (montado) return;
  montado = true;
  const app = $('app');
  if (!app) return;
  app.insertAdjacentHTML('afterbegin', htmlShell());
  for (const d of DESTINOS) {
    const sec = $(`vista-${d.id}`);
    if (sec) d.montar(sec);
  }
  iniciarCajaVivo();

  suscribirDatos((e) => {
    pintarComun(e);
    const d = DESTINOS.find((x) => x.id === actual);
    d?.render?.(e);
  });

  window.addEventListener('hashchange', () => {
    if (!$('app')?.hidden) navegar(rutaDelHash());
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    if (t.closest('[data-cerrar-panel]') || t.closest('#panel-fondo')) {
      cerrarPanel();
      return;
    }
    if (t.closest('[data-alternar-tema]')) {
      alternarTema();
      return;
    }
    const ir = t.closest<HTMLElement>('[data-ir]');
    if (ir?.dataset.ir && esVista(ir.dataset.ir)) {
      location.hash = ir.dataset.ir;
      if (ir.hasAttribute('data-nuevo-producto') && permite('editarProductos')) abrirEditorProducto(null);
      return;
    }
    if (t.closest('[data-nuevo-producto]') && permite('editarProductos')) abrirEditorProducto(null);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panelAbierto()) {
      cerrarPanel();
      return;
    }
    if (panelAbierto() || $('app')?.hidden) return;
    if (actual === 'vender') teclaVender(e);
    else if (e.key === '/' && !(e.target as HTMLElement).closest('input, textarea, select')) {
      // "/" desde cualquier pantalla lleva a vender con la búsqueda lista.
      e.preventDefault();
      location.hash = 'vender';
    }
  });

  window.addEventListener('online', actualizarSinRed);
  window.addEventListener('offline', actualizarSinRed);
  actualizarSinRed();
  alCambiarTema(pintarBotonTema);
  pintarBotonTema();
}

/** Tras iniciar sesión: muestra la app en la ruta del hash (por defecto, Hoy). */
export function entrarApp(): void {
  montarShell();
  const app = $('app');
  if (app) app.hidden = false;
  // El shell se monta una vez; lo que depende del rol se ajusta en cada ingreso.
  aplicarPermisos(app ?? document);
  pintarComun(datos());
  navegar(rutaDelHash(), false);
}

/** Logout: limpia el estado de las vistas (los listeners los cierra listeners.ts). */
export function salirApp(): void {
  if (panelAbierto()) cerrarPanel();
  reiniciarVender();
  reiniciarHoy();
  reiniciarReportes();
  reiniciarProductos();
  reiniciarCaja();
  reiniciarCajaVivo();
  reiniciarEquipo();
  const app = $('app');
  if (app) app.hidden = true;
  actual = null;
}
