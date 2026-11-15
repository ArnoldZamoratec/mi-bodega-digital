import './styles.css';

import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { registerSW } from 'virtual:pwa-register';

import { mensajeErrorLogin, mensajeErrorRegistro, validarRegistro, type ErrorConCodigo } from './auth';
import { initClock } from './clock';
import { auth } from './firebase';
import { setupEventListeners } from './handlers';
import { cancelarTodosLosListeners } from './listeners';
import { loadClientes, resetClientes } from './modules/clients';
import { loadProductos } from './modules/inventory';
import { loadVentaRapidaPanel, resetPos } from './modules/pos';
import { resetState, setUserId } from './store';
import {
  destroySalesChart,
  hideClienteDetalleModal,
  hideClienteModal,
  hideProductoModal,
} from './ui';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

// --- Selectores de Elementos UI ---
const loginContainer = $('login-container');
const appContainer = $('app-container');
const loadingScreen = $('loading-screen');
const appContent = $('app-content');
const userIdDisplay = $('user-id-display');
const logoutBtn = $<HTMLButtonElement>('logout-btn');

// --- Selectores de Login ---
const loginForm = $<HTMLFormElement>('login-form');
const emailInput = $<HTMLInputElement>('email-input');
const passwordInput = $<HTMLInputElement>('password-input');
const loginErrorMsg = $('login-error-msg');
const emailLoginBtn = $<HTMLButtonElement>('email-login-btn');
const googleLoginBtn = $<HTMLButtonElement>('google-login-btn');

// --- Selectores de Registro ---
const registerForm = $<HTMLFormElement>('register-form');
const registerEmailInput = $<HTMLInputElement>('register-email-input');
const registerPasswordInput = $<HTMLInputElement>('register-password-input');
const registerPasswordConfirmInput = $<HTMLInputElement>('register-password-confirm-input');
const registerErrorMsg = $('register-error-msg');
const registerBtn = $<HTMLButtonElement>('register-btn');

// --- Selectores de Toggle ---
const toggleToRegister = $('toggle-to-register');
const toggleToLogin = $('toggle-to-login');
const authModeTitle = $('auth-mode-title');

const GOOGLE_BTN_HTML = `
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Ingresar con Google
            `;

let dataLoaded = false;

function loadInitialData(): void {
  if (dataLoaded) return;

  loadingScreen?.classList.add('hidden');
  appContent?.classList.remove('hidden');

  loadProductos();
  loadClientes(); // pestaña Fiado + selector de clientes del POS + config/negocio
  loadVentaRapidaPanel();

  dataLoaded = true;
}

/** Logout (o sesión expirada): cierra TODOS los listeners y olvida los datos del usuario. */
function limpiarSesion(): void {
  cancelarTodosLosListeners();
  resetClientes();
  resetPos();
  resetState();
  destroySalesChart();
  hideProductoModal();
  hideClienteModal();
  hideClienteDetalleModal();
  dataLoaded = false;
}

function showErrorMessage(message: string): void {
  if (!loginErrorMsg) return;
  loginErrorMsg.textContent = message;
  loginErrorMsg.classList.remove('hidden');
}

function hideErrorMessage(): void {
  if (!loginErrorMsg) return;
  loginErrorMsg.classList.add('hidden');
  loginErrorMsg.textContent = '';
}

function hideRegisterError(): void {
  if (!registerErrorMsg) return;
  registerErrorMsg.classList.add('hidden');
  registerErrorMsg.textContent = '';
}

function showRegisterError(message: string): void {
  if (!registerErrorMsg) return;
  registerErrorMsg.textContent = message;
  registerErrorMsg.classList.remove('hidden');
}

async function main(): Promise<void> {
  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error('Error al configurar la persistencia:', error);
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      setUserId(user.uid);
      if (userIdDisplay) userIdDisplay.textContent = `Usuario: ${user.email}`;

      appContainer?.classList.remove('hidden');
      appContainer?.classList.add('flex');
      loginContainer?.classList.add('hidden');

      loadInitialData();
    } else {
      limpiarSesion();
      appContainer?.classList.add('hidden');
      appContainer?.classList.remove('flex');
      loginContainer?.classList.remove('hidden');
    }
  });
}

loginForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideErrorMessage();

  const email = emailInput?.value ?? '';
  const password = passwordInput?.value ?? '';

  if (!email || !password) {
    showErrorMessage('Por favor, completa ambos campos.');
    return;
  }

  if (emailLoginBtn) {
    emailLoginBtn.disabled = true;
    emailLoginBtn.textContent = 'Ingresando...';
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    console.error('Error al iniciar sesión:', error);
    showErrorMessage(mensajeErrorLogin(error as ErrorConCodigo));
    if (emailLoginBtn) {
      emailLoginBtn.disabled = false;
      emailLoginBtn.textContent = 'Ingresar con Email';
    }
  }
});

googleLoginBtn?.addEventListener('click', async () => {
  hideErrorMessage();
  googleLoginBtn.disabled = true;
  googleLoginBtn.textContent = 'Abriendo Google...';

  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (error) {
    console.error('Error al iniciar sesión con Google:', error);
    const { code, message } = error as ErrorConCodigo;
    if (code === 'auth/popup-closed-by-user') {
      showErrorMessage('❌ Popup cerrado. Intenta de nuevo.');
    } else if (code === 'auth/popup-blocked') {
      showErrorMessage('❌ Popup bloqueado. Permite popups para este sitio.');
    } else {
      showErrorMessage(`❌ Error: ${message}`);
    }
    googleLoginBtn.disabled = false;
    googleLoginBtn.innerHTML = GOOGLE_BTN_HTML;
  }
});

logoutBtn?.addEventListener('click', async () => {
  // Primero se cierran los listeners: si no, fallan con permission-denied al perder la sesión.
  limpiarSesion();
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Error al cerrar sesión:', error);
  }
});

function mostrarModo(registro: boolean): void {
  loginForm?.classList.toggle('hidden', registro);
  registerForm?.classList.toggle('hidden', !registro);
  toggleToRegister?.classList.toggle('hidden', registro);
  toggleToLogin?.classList.toggle('hidden', !registro);
  if (authModeTitle) {
    authModeTitle.textContent = registro ? 'Crear Nueva Cuenta' : 'Acceso de Administrador';
  }
  hideErrorMessage();
  hideRegisterError();
}

toggleToRegister?.addEventListener('click', () => mostrarModo(true));
toggleToLogin?.addEventListener('click', () => mostrarModo(false));

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = registerEmailInput?.value ?? '';
  const password = registerPasswordInput?.value ?? '';
  const passwordConfirm = registerPasswordConfirmInput?.value ?? '';
  hideRegisterError();

  const invalido = validarRegistro(password, passwordConfirm);
  if (invalido) {
    showRegisterError(invalido);
    return;
  }
  if (registerBtn) {
    registerBtn.disabled = true;
    registerBtn.textContent = 'Creando cuenta...';
  }
  try {
    await createUserWithEmailAndPassword(auth, email, password);
    if (registerEmailInput) registerEmailInput.value = '';
    if (registerPasswordInput) registerPasswordInput.value = '';
    if (registerPasswordConfirmInput) registerPasswordConfirmInput.value = '';
  } catch (error) {
    console.error('Error al crear cuenta:', error);
    showRegisterError(mensajeErrorRegistro(error as ErrorConCodigo));
    if (registerBtn) {
      registerBtn.disabled = false;
      registerBtn.textContent = 'Crear Cuenta';
    }
  }
});

// PWA: service worker del "app shell" (vite-plugin-pwa). Se actualiza solo al publicar.
registerSW({ immediate: true });

initClock();
setupEventListeners();
void main();
