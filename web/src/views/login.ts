import {
  mensajeErrorLogin,
  mensajeErrorRegistro,
  mensajeRecuperacion,
  validarRegistro,
  type ErrorConCodigo,
  type MensajeAuth,
} from '../auth';
import { $, esc, estadoBoton } from '../dom';
import { icono } from '../icons';
import { ticketImpreso } from './ticket';

/** Operaciones de autenticación (Firebase en producción). */
export interface AccionesAuth {
  ingresar(email: string, clave: string): Promise<void>;
  ingresarConGoogle(): Promise<void>;
  registrar(email: string, clave: string): Promise<void>;
  recuperar(email: string): Promise<void>;
}

/** Ticket de ejemplo del lado izquierdo: el mismo componente que imprime cada venta. */
export function pintarTicketLogin(): void {
  const cont = $('login-ticket');
  if (cont) {
    cont.innerHTML = ticketImpreso({
      negocio: 'Bodega Doña Rosa',
      fecha: new Date(),
      items: [
        { id: 'a', nombre: 'Arroz Costeño 1 kg', precio: 4.6, cantidad: 2 },
        { id: 'b', nombre: 'Leche Gloria azul 400 g', precio: 4.2, cantidad: 3 },
        { id: 'c', nombre: 'Pan francés', precio: 0.3, cantidad: 8 },
      ],
      total: 24.2,
      metodo: 'Efectivo',
      recibido: 50,
      vuelto: 25.8,
    });
  }
  const logo = $('login-logo-ico');
  if (logo) logo.innerHTML = icono('store', 22);
  const ver = document.querySelector('[data-ver-clave]');
  if (ver && !ver.innerHTML) ver.innerHTML = icono('eye', 20);
}

function mostrarMensaje(id: string, m: MensajeAuth | null, accion?: () => void): void {
  const el = $(id);
  if (!el) return;
  if (!m) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const textoAccion =
    m.accion === 'recuperar' ? 'Recuperar contraseña' : m.accion === 'registrar' ? 'Crear cuenta' : m.accion === 'ingresar' ? 'Ir a ingresar' : '';
  el.innerHTML = `${icono(el.classList.contains('mensaje-ok') ? 'circle-check' : 'alert', 18)}<span>${esc(m.texto)}${
    textoAccion ? ` <button type="button" class="enlace" data-accion-auth="${esc(m.accion)}">${esc(textoAccion)}</button>` : ''
  }</span>`;
  el.hidden = false;
  if (accion) el.querySelector('[data-accion-auth]')?.addEventListener('click', accion, { once: true });
}

export function conectarLogin(acc: AccionesAuth): void {
  pintarTicketLogin();
  const loginForm = $<HTMLFormElement>('login-form');
  const registerForm = $<HTMLFormElement>('register-form');
  const email = $<HTMLInputElement>('email-input');
  const clave = $<HTMLInputElement>('password-input');
  const btnIngresar = $<HTMLButtonElement>('email-login-btn');
  const btnGoogle = $<HTMLButtonElement>('google-login-btn');
  const verClave = document.querySelector<HTMLButtonElement>('[data-ver-clave]');

  const modo = (registro: boolean) => {
    if (loginForm) loginForm.hidden = registro;
    if (registerForm) registerForm.hidden = !registro;
    const a = $('toggle-a-registro');
    const b = $('toggle-a-ingreso');
    if (a) a.hidden = registro;
    if (b) b.hidden = !registro;
    const t = $('auth-titulo');
    if (t) t.textContent = registro ? 'Crea tu cuenta' : 'Ingresa a tu bodega';
    const s = $('auth-subtitulo');
    if (s) s.textContent = registro ? 'Es gratis. Luego usa el mismo correo en el celular.' : 'Con el mismo correo que usas en la app.';
    mostrarMensaje('login-error-msg', null);
    mostrarMensaje('register-error-msg', null);
    mostrarMensaje('login-ok-msg', null);
    (registro ? $('register-email-input') : email)?.focus();
  };

  const recuperar = async () => {
    mostrarMensaje('login-error-msg', null);
    const correo = email?.value.trim() ?? '';
    if (!correo) {
      mostrarMensaje('login-error-msg', mensajeRecuperacion({ code: 'auth/missing-email' }));
      email?.focus();
      return;
    }
    try {
      await acc.recuperar(correo);
      mostrarMensaje('login-ok-msg', mensajeRecuperacion(null));
    } catch (error) {
      mostrarMensaje('login-error-msg', mensajeRecuperacion(error as ErrorConCodigo));
    }
  };

  const accionDe = (m: MensajeAuth) =>
    m.accion === 'recuperar' ? () => void recuperar() : m.accion === 'registrar' ? () => modo(true) : m.accion === 'ingresar' ? () => modo(false) : undefined;

  verClave?.addEventListener('click', () => {
    if (!clave) return;
    const ver = clave.type === 'password';
    clave.type = ver ? 'text' : 'password';
    verClave.setAttribute('aria-pressed', String(ver));
    verClave.innerHTML = icono(ver ? 'eye-off' : 'eye', 20);
    verClave.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
  });

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarMensaje('login-error-msg', null);
    mostrarMensaje('login-ok-msg', null);
    const correo = email?.value.trim() ?? '';
    const pass = clave?.value ?? '';
    if (!correo || !pass) {
      mostrarMensaje('login-error-msg', { texto: 'Escribe tu correo y tu contraseña para entrar.' });
      (!correo ? email : clave)?.focus();
      return;
    }
    estadoBoton(btnIngresar, 'cargando', 'Ingresando…');
    try {
      await acc.ingresar(correo, pass);
      estadoBoton(btnIngresar, 'normal');
    } catch (error) {
      console.error('Error al iniciar sesión:', error);
      estadoBoton(btnIngresar, 'normal');
      const m = mensajeErrorLogin(error as ErrorConCodigo);
      mostrarMensaje('login-error-msg', m, accionDe(m));
    }
  });

  btnGoogle?.addEventListener('click', async () => {
    mostrarMensaje('login-error-msg', null);
    estadoBoton(btnGoogle, 'cargando', 'Abriendo Google…');
    try {
      await acc.ingresarConGoogle();
      estadoBoton(btnGoogle, 'normal');
    } catch (error) {
      console.error('Error al iniciar sesión con Google:', error);
      estadoBoton(btnGoogle, 'normal');
      const m = mensajeErrorLogin(error as ErrorConCodigo);
      mostrarMensaje(registerForm?.hidden === false ? 'register-error-msg' : 'login-error-msg', m, accionDe(m));
    }
  });

  $('recuperar-btn')?.addEventListener('click', () => void recuperar());
  $('toggle-to-register')?.addEventListener('click', () => modo(true));
  $('toggle-to-login')?.addEventListener('click', () => modo(false));

  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    mostrarMensaje('register-error-msg', null);
    const correo = ($<HTMLInputElement>('register-email-input')?.value ?? '').trim();
    const pass = $<HTMLInputElement>('register-password-input')?.value ?? '';
    const conf = $<HTMLInputElement>('register-password-confirm-input')?.value ?? '';
    const invalido = validarRegistro(pass, conf);
    if (invalido) {
      mostrarMensaje('register-error-msg', { texto: invalido });
      return;
    }
    const btn = $<HTMLButtonElement>('register-btn');
    estadoBoton(btn, 'cargando', 'Creando tu cuenta…');
    try {
      await acc.registrar(correo, pass);
      estadoBoton(btn, 'normal');
      registerForm.reset();
    } catch (error) {
      console.error('Error al crear cuenta:', error);
      estadoBoton(btn, 'normal');
      const m = mensajeErrorRegistro(error as ErrorConCodigo);
      mostrarMensaje('register-error-msg', m, accionDe(m));
    }
  });
}
