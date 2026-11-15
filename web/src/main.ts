import './styles.css';

import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { registerSW } from 'virtual:pwa-register';

import { actualizarDatos, reiniciarDatos, usarFuente } from './datos';
import { $, avisar } from './dom';
import { auth } from './firebase';
import { abrirListenersSesion, fuenteFirestore } from './fuenteFirestore';
import { cancelarTodosLosListeners } from './listeners';
import { entrarApp, salirApp } from './shell';
import { resetState, setUserId } from './store';
import { initTheme } from './theme';
import { conectarLogin } from './views/login';

initTheme();

const sinRed = $('sin-red');
if (sinRed) sinRed.textContent = 'Sin internet. Puedes seguir mirando; para registrar ventas y abonos necesitas conexión.';

function mostrarLogin(): void {
  $('cargando')?.setAttribute('hidden', '');
  const login = $('login');
  if (login) login.hidden = false;
}

/** Logout (o sesión expirada): cierra TODOS los listeners y olvida los datos del usuario. */
function limpiarSesion(): void {
  // Primero los listeners: si no, fallan con permission-denied al perder la sesión.
  cancelarTodosLosListeners();
  salirApp();
  resetState();
  reiniciarDatos();
  usarFuente(null);
}

async function iniciar(): Promise<void> {
  conectarLogin({
    ingresar: async (email, clave) => {
      await signInWithEmailAndPassword(auth, email, clave);
    },
    ingresarConGoogle: async () => {
      await signInWithPopup(auth, new GoogleAuthProvider());
    },
    registrar: async (email, clave) => {
      await createUserWithEmailAndPassword(auth, email, clave);
    },
    recuperar: (email) => sendPasswordResetEmail(auth, email),
  });

  try {
    await setPersistence(auth, browserLocalPersistence);
  } catch (error) {
    console.error('Error al configurar la persistencia:', error);
  }

  onAuthStateChanged(auth, (user) => {
    $('cargando')?.setAttribute('hidden', '');
    if (user) {
      setUserId(user.uid);
      usarFuente({
        ...fuenteFirestore,
        cerrarSesion: async () => {
          limpiarSesion();
          await signOut(auth);
        },
      });
      actualizarDatos({ email: user.email });
      abrirListenersSesion((m) => avisar(m, 'error'));
      const login = $('login');
      if (login) login.hidden = true;
      entrarApp();
    } else {
      limpiarSesion();
      mostrarLogin();
    }
  });

  // PWA: service worker del "app shell" (vite-plugin-pwa). Se actualiza solo al publicar.
  registerSW({ immediate: true });
}

// Modo demo SOLO en desarrollo (`npm run dev -w web`, `/?demo=1`): datos de ejemplo en
// memoria para revisar las pantallas sin cuenta. `import.meta.env.DEV` es `false` en el
// build, así que Vite elimina esta rama y el módulo demo no llega a dist/.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('demo')) {
  void import('./demo/demo').then((m) => m.iniciarDemo());
} else {
  void iniciar();
}
