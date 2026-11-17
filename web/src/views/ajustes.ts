import { datos, fuente, type EstadoDatos } from '../datos';
import { esc, estadoBoton } from '../dom';
import { icono } from '../icons';
import { accionesCuenta, esCajero, permite, sesionActual } from '../sesion';
import { fijarTema, preferenciaTema, type PreferenciaTema } from '../theme';

let raiz: HTMLElement | null = null;

function pintar(): void {
  const c = raiz?.querySelector('#ajustes-cuerpo');
  if (!c) return;
  const e = datos();
  const p = preferenciaTema();
  const op = (v: PreferenciaTema, ico: string, t: string) =>
    `<button type="button" data-tema="${v}" aria-pressed="${p === v}">${ico}${t}</button>`;
  c.innerHTML = `
    <section class="ajuste" aria-labelledby="a-tema">
      <h2 class="titulo-seccion" id="a-tema">Apariencia</h2>
      <p class="texto-sec">El modo Noche cansa menos la vista con la tienda a media luz.</p>
      <div class="segmentado" role="group" aria-label="Tema">
        ${op('sistema', '', 'Como el equipo')}
        ${op('claro', icono('sun', 18), 'Claro')}
        ${op('oscuro', icono('moon', 18), 'Noche')}
      </div>
    </section>
    ${
      esCajero()
        ? `<section class="ajuste" aria-labelledby="a-bodega">
      <h2 class="titulo-seccion" id="a-bodega">Bodega donde trabajas</h2>
      <p>${esc(e.nombreBodega ?? 'Sin nombre todavía')}</p>
      <p class="texto-sec">Vendes como cajero. Los precios, los productos y los reportes los maneja el dueño.</p>
    </section>`
        : `<section class="ajuste" aria-labelledby="a-bodega">
      <h2 class="titulo-seccion" id="a-bodega">Tu bodega</h2>
      <p>${esc(e.nombreBodega ?? 'Sin nombre todavía')}</p>
      <p class="texto-sec">El nombre sale en tus tickets y en los recordatorios. Se cambia desde la app móvil, en Ajustes.</p>
    </section>`
    }
    ${
      permite('gestionarEquipo')
        ? `<section class="ajuste" aria-labelledby="a-equipo">
      <h2 class="titulo-seccion" id="a-equipo">Equipo</h2>
      <p class="texto-sec">Invita a quien te ayuda en la tienda para que venda con su propia cuenta. Tú ves quién vendió cada cosa.</p>
      <div><a class="btn btn-secundario" href="#equipo">${icono('users', 18)} Ver mi equipo</a></div>
    </section>`
        : ''
    }
    <section class="ajuste" aria-labelledby="a-cuenta">
      <h2 class="titulo-seccion" id="a-cuenta">Tu cuenta</h2>
      <p>${esc(e.email ?? '')}${esCajero() && sesionActual()?.nombre ? ` · ${esc(sesionActual()?.nombre)}` : ''}</p>
      <div><button type="button" class="btn btn-secundario" data-salir>${icono('log-out', 18)} Cerrar sesión</button></div>
    </section>
    ${
      !esCajero() && accionesCuenta()
        ? `<section class="ajuste" aria-labelledby="a-unirme">
      <h2 class="titulo-seccion" id="a-unirme">¿Te invitaron como cajero?</h2>
      <p class="texto-sec">Si el dueño de otra bodega te envió un código, úsalo aquí para vender en su bodega con esta cuenta.</p>
      <div><button type="button" class="btn btn-fantasma" data-unirme>${icono('key', 18)} Tengo un código de invitación</button></div>
    </section>`
        : ''
    }`;
}

export function montarAjustes(contenedor: HTMLElement): void {
  raiz = contenedor;
  contenedor.innerHTML = `
    <div class="vista ajustes">
      <h1 class="titulo-pagina">Ajustes</h1>
      <div id="ajustes-cuerpo"></div>
    </div>`;
  contenedor.addEventListener('click', async (e) => {
    const t = e.target as Element;
    const tema = t.closest<HTMLElement>('[data-tema]');
    if (tema?.dataset.tema) {
      fijarTema(tema.dataset.tema as PreferenciaTema);
      pintar();
      return;
    }
    if (t.closest('[data-unirme]')) {
      accionesCuenta()?.unirmeConCodigo();
      return;
    }
    const salir = t.closest<HTMLButtonElement>('[data-salir]');
    if (salir) {
      estadoBoton(salir, 'cargando', 'Cerrando sesión…');
      try {
        await fuente().cerrarSesion();
      } catch (error) {
        console.error('Error al cerrar sesión:', error);
        estadoBoton(salir, 'error', 'No se pudo cerrar');
      }
    }
  });
  pintar();
}

export const renderAjustes = (_e: EstadoDatos): void => pintar();
export const mostrarAjustes = (): void => pintar();
