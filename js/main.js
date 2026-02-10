// js/main.js

import {
    auth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword, // <-- NUEVO: Para crear cuentas
    signInWithPopup, // <-- NUEVO: Para login con Google
    GoogleAuthProvider, // <-- NUEVO: Proveedor de Google
    signOut,
    setPersistence, // <-- HERRAMIENTA CORREGIDA
    browserLocalPersistence // <-- HERRAMIENTA CORREGIDA
} from './firebase.js?v=4.0'; // MODIFICADO

import { setupEventListeners } from './handlers.js?v=4.0';
import { setUserId } from './store.js?v=4.0';
import { loadProductos } from './modules/inventory.js?v=4.0';
import { loadClientesFiado, loadClientesParaVenta } from './modules/clients.js?v=4.0';
import { loadVentaRapidaPanel } from './modules/pos.js?v=4.0';

// --- Selectores de Elementos UI ---
const loginContainer = document.getElementById('login-container');
const appContainer = document.getElementById('app-container');
const loadingScreen = document.getElementById('loading-screen');
const appContent = document.getElementById('app-content');
const userIdDisplay = document.getElementById('user-id-display');
const logoutBtn = document.getElementById('logout-btn');

// --- Selectores de Login ---
const loginForm = document.getElementById('login-form');
const emailInput = document.getElementById('email-input');
const passwordInput = document.getElementById('password-input');
const loginErrorMsg = document.getElementById('login-error-msg');
const emailLoginBtn = document.getElementById('email-login-btn');

// --- Selectores de Registro ---
const registerForm = document.getElementById('register-form');
const registerEmailInput = document.getElementById('register-email-input');
const registerPasswordInput = document.getElementById('register-password-input');
const registerPasswordConfirmInput = document.getElementById('register-password-confirm-input');
const registerErrorMsg = document.getElementById('register-error-msg');
const registerBtn = document.getElementById('register-btn');

// --- Selectores de Toggle ---
const toggleToRegister = document.getElementById('toggle-to-register');
const toggleToLogin = document.getElementById('toggle-to-login');
const authModeTitle = document.getElementById('auth-mode-title');

let dataLoaded = false;

function loadInitialData() {
    if (dataLoaded) return;

    if (loadingScreen) loadingScreen.classList.add('hidden');
    if (appContent) appContent.classList.remove('hidden');

    loadProductos();
    loadClientesFiado();
    loadClientesParaVenta();
    loadVentaRapidaPanel();

    dataLoaded = true;
}

function showLoginError(error) {
    if (!loginErrorMsg) return;
    console.error("Error de login:", error);

    switch (error.code) {
        case 'auth/user-not-found':
            loginErrorMsg.textContent = '? Usuario no encontrado. Verifica el email o crea un usuario en Firebase Console.';
            break;
        case 'auth/wrong-password':
            loginErrorMsg.textContent = '? Contraseña incorrecta. Intenta de nuevo.';
            break;
        case 'auth/invalid-email':
            loginErrorMsg.textContent = '? Correo no válido. Usa formato: usuario@dominio.com';
            break;
        case 'auth/invalid-credential':
            loginErrorMsg.textContent = '? Credenciales inválidas. Verifica email y contraseña.';
            break;
        case 'auth/too-many-requests':
            loginErrorMsg.textContent = '? Demasiados intentos. Espera unos minutos.';
            break;
        case 'auth/network-request-failed':
            loginErrorMsg.textContent = '? Error de red. Verifica tu conexión a internet.';
            break;
        case 'auth/configuration-not-found':
            loginErrorMsg.textContent = '? Firebase no está configurado. Verifica la configuración.';
            break;
        default:
            loginErrorMsg.textContent = `? Error: ${error.message || 'Error desconocido'}`;
            break;
    }
}

async function main() {
    try {
        await setPersistence(auth, browserLocalPersistence);
    } catch (error) {
        console.error("Error al configurar la persistencia:", error);
    }


    onAuthStateChanged(auth, async (user) => {
        if (user) {
            setUserId(user.uid);

            if (userIdDisplay) userIdDisplay.textContent = `Usuario: ${user.email}`;

            if (appContainer) {
                appContainer.classList.remove('hidden');
                appContainer.classList.add('flex');
            }
            if (loginContainer) loginContainer.classList.add('hidden');

            loadInitialData();

        } else {

            if (appContainer) {
                appContainer.classList.add('hidden');
                appContainer.classList.remove('flex');
            }
            if (loginContainer) loginContainer.classList.remove('hidden');

            dataLoaded = false;
        }
    });
}


const googleLoginBtn = document.getElementById('google-login-btn');

function showErrorMessage(message) {
    if (loginErrorMsg) {
        loginErrorMsg.textContent = message;
        loginErrorMsg.classList.remove('hidden');
    }
}

function hideErrorMessage() {
    if (loginErrorMsg) {
        loginErrorMsg.classList.add('hidden');
        loginErrorMsg.textContent = '';
    }
}

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideErrorMessage();

        const email = emailInput.value;
        const password = passwordInput.value;

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
            console.error("Error al iniciar sesión:", error);
            showLoginError(error);
            showErrorMessage(loginErrorMsg.textContent);

            if (emailLoginBtn) {
                emailLoginBtn.disabled = false;
                emailLoginBtn.textContent = 'Ingresar con Email';
            }
        }
    });
}

if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', async () => {
        hideErrorMessage();
        googleLoginBtn.disabled = true;
        googleLoginBtn.textContent = 'Abriendo Google...';

        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error al iniciar sesión con Google:", error);

            if (error.code === 'auth/popup-closed-by-user') {
                showErrorMessage('? Popup cerrado. Intenta de nuevo.');
            } else if (error.code === 'auth/popup-blocked') {
                showErrorMessage('? Popup bloqueado. Permite popups para este sitio.');
            } else {
                showErrorMessage(`? Error: ${error.message}`);
            }

            googleLoginBtn.disabled = false;
            googleLoginBtn.innerHTML = `
                <svg class="w-5 h-5" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Ingresar con Google
            `;
        }
    });
}

if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    });
}

if (toggleToRegister) {
    toggleToRegister.addEventListener('click', () => {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (toggleToRegister) toggleToRegister.classList.add('hidden');
        if (toggleToLogin) toggleToLogin.classList.remove('hidden');
        if (authModeTitle) authModeTitle.textContent = 'Crear Nueva Cuenta';
        hideErrorMessage();
        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }
    });
}

if (toggleToLogin) {
    toggleToLogin.addEventListener('click', () => {
        if (registerForm) registerForm.classList.add('hidden');
        if (loginForm) loginForm.classList.remove('hidden');
        if (toggleToLogin) toggleToLogin.classList.add('hidden');
        if (toggleToRegister) toggleToRegister.classList.remove('hidden');
        if (authModeTitle) authModeTitle.textContent = 'Acceso de Administrador';
        hideErrorMessage();
        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }
    });
}

if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = registerEmailInput.value;
        const password = registerPasswordInput.value;
        const passwordConfirm = registerPasswordConfirmInput.value;
        if (registerErrorMsg) {
            registerErrorMsg.classList.add('hidden');
            registerErrorMsg.textContent = '';
        }
        if (password !== passwordConfirm) {
            if (registerErrorMsg) {
                registerErrorMsg.textContent = '? Las contraseñas no coinciden';
                registerErrorMsg.classList.remove('hidden');
            }
            return;
        }
        if (password.length < 6) {
            if (registerErrorMsg) {
                registerErrorMsg.textContent = '? La contraseña debe tener al menos 6 caracteres';
                registerErrorMsg.classList.remove('hidden');
            }
            return;
        }
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.textContent = 'Creando cuenta...';
        }
        try {
            await createUserWithEmailAndPassword(auth, email, password);
            registerEmailInput.value = '';
            registerPasswordInput.value = '';
            registerPasswordConfirmInput.value = '';
        } catch (error) {
            console.error("Error al crear cuenta:", error);
            let errorMessage = '';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage = '? Este email ya está registrado. Intenta iniciar sesión.';
                    break;
                case 'auth/invalid-email':
                    errorMessage = '? Email inválido. Usa formato: usuario@dominio.com';
                    break;
                case 'auth/weak-password':
                    errorMessage = '? Contraseña muy débil. Usa al menos 6 caracteres.';
                    break;
                case 'auth/operation-not-allowed':
                    errorMessage = '? Registro deshabilitado. Contacta al administrador.';
                    break;
                default:
                    errorMessage = `? Error: ${error.message}`;
                    break;
            }
            if (registerErrorMsg) {
                registerErrorMsg.textContent = errorMessage;
                registerErrorMsg.classList.remove('hidden');
            }
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.textContent = 'Crear Cuenta';
            }
        }
    });
}


setupEventListeners();
main();
