import { LARGO_NOMBRE_MIEMBRO, type Sesion } from '@bodegon/core';

import { repoEquipo, unirmeConCodigo } from '../equipo';
import { $, abrirPanel, avisar, cerrarPanel, confirmarEnLinea, esc, estadoBoton, req } from '../dom';
import { icono } from '../icons';
import { codigoMientrasEscribe, mensajeErrorEquipo, nombreSugerido, type Acceso } from '../logic/equipo';

/**
 * Pantallas de acceso (D-33): "Tengo un código de invitación", el aviso al cajero desactivado
 * o quitado, y el error cuando no se pudo revisar la cuenta al ingresar. Textos tranquilos:
 * qué pasó y qué puede hacer, sin culpas.
 */
export interface UsuarioActual {
  uid: string;
  email: string | null;
  displayName: string | null;
}

// ---------- Unirme a una bodega (panel) ----------

export function abrirUnirme(usuario: UsuarioActual, alUnirse: (sesion: Sesion) => void): void {
  const panel = abrirPanel(
    'Unirme a una bodega',
    `
    <form class="formulario" id="form-unirme" novalidate>
      <p class="texto-sec">Si el dueño de una bodega te invitó como cajero, escribe el código que te envió por WhatsApp.</p>
      <label class="campo"><span>Tu nombre</span>
        <input class="entrada" name="nombre" maxlength="${LARGO_NOMBRE_MIEMBRO}" autocomplete="name" value="${esc(nombreSugerido(usuario))}" placeholder="Rosa" aria-describedby="ayuda-nombre">
      </label>
      <p class="texto-sec" id="ayuda-nombre">El dueño lo verá en cada venta que registres.</p>
      <label class="campo"><span>Código de invitación</span>
        <input class="entrada entrada-codigo" name="codigo" id="codigo-invitacion" maxlength="9" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH" autofocus>
      </label>
      <p class="texto-sec">Mientras seas cajero, esta cuenta trabajará en la bodega que te invitó. Nada de lo tuyo se borra.</p>
      <p class="mensaje-error" id="error-unirme" role="alert" hidden></p>
      <div class="panel-pie fila-botones">
        <button type="submit" class="btn btn-primario">${icono('key', 18)} Unirme</button>
        <button type="button" class="btn btn-secundario" data-cerrar-panel>Cancelar</button>
      </div>
    </form>`,
  );
  const form = req<HTMLFormElement>(panel, '#form-unirme');
  const codigo = req<HTMLInputElement>(panel, '#codigo-invitacion');
  const error = req(panel, '#error-unirme');
  codigo.addEventListener('input', () => {
    codigo.value = codigoMientrasEscribe(codigo.value);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const nombre = String(fd.get('nombre') ?? '').trim();
    error.hidden = true;
    if (!nombre) {
      error.textContent = 'Escribe tu nombre: así el dueño sabe quién vendió.';
      error.hidden = false;
      return;
    }
    const btn = form.querySelector<HTMLButtonElement>('[type="submit"]');
    estadoBoton(btn, 'cargando', 'Revisando el código…');
    try {
      const sesion = await unirmeConCodigo(repoEquipo(), {
        codigo: codigo.value,
        uid: usuario.uid,
        nombre,
        email: usuario.email,
        ahora: new Date(),
      });
      estadoBoton(btn, 'normal');
      cerrarPanel();
      avisar('Listo, ya eres parte del equipo.');
      alUnirse(sesion);
    } catch (err) {
      console.error('Error al aceptar la invitación:', err);
      estadoBoton(btn, 'normal');
      error.textContent = mensajeErrorEquipo(
        err,
        'No pudimos unirte con este código. Puede que ya se haya usado o que el dueño lo haya cancelado: pídele uno nuevo.',
      );
      error.hidden = false;
    }
  });
}

// ---------- Pantalla completa (sin acceso / error al revisar la cuenta) ----------

function contenedor(): HTMLElement {
  let el = $('acceso');
  if (!el) {
    el = document.createElement('div');
    el.id = 'acceso';
    el.className = 'acceso';
    document.body.appendChild(el);
  }
  return el;
}

export function ocultarAcceso(): void {
  const el = $('acceso');
  if (el) {
    el.hidden = true;
    el.innerHTML = '';
  }
}

export interface AccionesSinAcceso {
  reintentar(): void;
  /** Borra `cuentas/{uid}`: vuelve a ser dueño de su propia ruta. */
  usarMiBodega(): Promise<void>;
  tengoCodigo(): void;
  salir(): void;
}

type SinAcceso = Extract<Acceso, { tipo: 'sin-acceso' }>;

export function textosSinAcceso(a: Pick<SinAcceso, 'motivo'>, nombreBodega: string | null): { titulo: string; texto: string } {
  const bodega = nombreBodega?.trim() || 'la bodega';
  return a.motivo === 'desactivado'
    ? {
        titulo: `Tu acceso a ${bodega} está en pausa`,
        texto:
          'El dueño desactivó tu acceso por ahora, así que no puedes vender ni ver datos de la bodega. Si es un error, pídele que lo vuelva a activar desde Ajustes, en Equipo, y toca "Volver a revisar".',
      }
    : {
        titulo: `Ya no formas parte del equipo de ${bodega}`,
        texto:
          'El dueño te quitó del equipo, así que esta cuenta ya no puede vender en esa bodega. Si fue un error, pídele una invitación nueva.',
      };
}

export function mostrarSinAcceso(a: SinAcceso, nombreBodega: string | null, acciones: AccionesSinAcceso): void {
  const el = contenedor();
  const t = textosSinAcceso(a, nombreBodega);
  el.innerHTML = `
    <section class="acceso-caja" aria-labelledby="acceso-titulo">
      <span class="vacio-ico" aria-hidden="true">${icono(a.motivo === 'desactivado' ? 'circle-pause' : 'user-minus', 28)}</span>
      <h1 class="titulo-pagina" id="acceso-titulo" tabindex="-1">${esc(t.titulo)}</h1>
      <p class="texto-sec">${esc(t.texto)}</p>
      <div class="fila-botones">
        ${a.motivo === 'desactivado' ? `<button type="button" class="btn btn-primario" data-acceso="revisar">Volver a revisar</button>` : ''}
        <button type="button" class="btn ${a.motivo === 'desactivado' ? 'btn-secundario' : 'btn-primario'}" data-acceso="codigo">${icono('key', 18)} Tengo un código</button>
      </div>
      <div class="acceso-otras" id="acceso-propia">
        <p class="texto-sec">¿Tienes tu propio negocio? Puedes dejar de ser cajero y usar esta cuenta para tu bodega.</p>
        <div class="fila-botones">
          <button type="button" class="btn btn-fantasma" data-acceso="propia">${icono('store', 18)} Usar mi propia bodega</button>
          <button type="button" class="btn btn-fantasma" data-acceso="salir">${icono('log-out', 18)} Cerrar sesión</button>
        </div>
      </div>
      <p class="mensaje-error" id="acceso-error" role="alert" hidden></p>
    </section>`;
  el.hidden = false;
  el.querySelector<HTMLElement>('#acceso-titulo')?.focus();
  el.onclick = async (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-acceso]');
    switch (b?.dataset.acceso) {
      case 'revisar':
        estadoBoton(b, 'cargando', 'Revisando…');
        acciones.reintentar();
        return;
      case 'codigo':
        acciones.tengoCodigo();
        return;
      case 'salir':
        acciones.salir();
        return;
      case 'propia': {
        const zona = el.querySelector<HTMLElement>('#acceso-propia');
        if (!zona) return;
        const ok = await confirmarEnLinea(zona, {
          pregunta: '¿Dejar de ser cajero?',
          detalle: 'Esta cuenta volverá a ser la de tu propia bodega. Para volver a vender aquí necesitarás una invitación nueva.',
          accion: 'Sí, usar mi bodega',
        });
        if (!ok) return;
        try {
          await acciones.usarMiBodega();
        } catch (err) {
          console.error('Error al salir de la bodega:', err);
          const e = el.querySelector<HTMLElement>('#acceso-error');
          if (e) {
            e.textContent = mensajeErrorEquipo(err, 'No pudimos hacerlo ahora. Revisa tu conexión e intenta otra vez.');
            e.hidden = false;
          }
        }
        return;
      }
    }
  };
}

export function mostrarErrorSesion(acciones: Pick<AccionesSinAcceso, 'reintentar' | 'salir'>): void {
  const el = contenedor();
  el.innerHTML = `
    <section class="acceso-caja" aria-labelledby="acceso-titulo">
      <span class="vacio-ico" aria-hidden="true">${icono('wifi-off', 28)}</span>
      <h1 class="titulo-pagina" id="acceso-titulo" tabindex="-1">No pudimos abrir tu bodega</h1>
      <p class="texto-sec">Necesitamos internet para confirmar si entras como dueño o como cajero. Revisa tu conexión e intenta otra vez; lo haremos solos cuando vuelva.</p>
      <div class="fila-botones">
        <button type="button" class="btn btn-primario" data-acceso="revisar">Intentar otra vez</button>
        <button type="button" class="btn btn-fantasma" data-acceso="salir">${icono('log-out', 18)} Cerrar sesión</button>
      </div>
    </section>`;
  el.hidden = false;
  el.onclick = (ev) => {
    const b = (ev.target as Element).closest<HTMLButtonElement>('[data-acceso]');
    if (b?.dataset.acceso === 'revisar') {
      estadoBoton(b, 'cargando', 'Revisando…');
      acciones.reintentar();
    } else if (b?.dataset.acceso === 'salir') acciones.salir();
  };
}
