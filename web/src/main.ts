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
  type User,
} from 'firebase/auth';
import { registerSW } from 'virtual:pwa-register';

import { actualizarDatos, reiniciarDatos, usarFuente } from './datos';
import { $, avisar, cerrarPanel } from './dom';
import { usarRepoEquipo } from './equipo';
import { equipoFirestore } from './equipoFirestore';
import { auth } from './firebase';
import { abrirListenersSesion, fuenteFirestore } from './fuenteFirestore';
import { cancelarTodosLosListeners } from './listeners';
import { nombreDeUsuario, resolverAcceso, type Acceso } from './logic/equipo';
import { fijarAccionesCuenta, fijarSesion } from './sesion';
import { entrarApp, salirApp } from './shell';
import { resetState, setUserId } from './store';
import { initTheme } from './theme';
import { abrirUnirme, mostrarErrorSesion, mostrarSinAcceso, ocultarAcceso } from './views/acceso';
import { conectarLogin } from './views/login';

initTheme();

const sinRed = $('sin-red');
if (sinRed) sinRed.textContent = 'Sin internet. Puedes seguir mirando; para registrar ventas, abonos y la caja necesitas conexión.';

function mostrarLogin(): void {
  $('cargando')?.setAttribute('hidden', '');
  const login = $('login');
  if (login) login.hidden = false;
}

/** Logout (o sesión expirada): cierra TODOS los listeners y olvida los datos del usuario. */
function limpiarSesion(): void {
  // Primero los listeners: si no, fallan con permission-denied al perder la sesión.
  cancelarTodosLosListeners();
  cerrarPanel();
  salirApp();
  resetState();
  reiniciarDatos();
  usarFuente(null);
  fijarSesion(null);
  ocultarAcceso();
}

async function salir(): Promise<void> {
  limpiarSesion();
  await signOut(auth);
}

/**
 * Cajeros y roles (D-33). Al ingresar se lee `cuentas/{uid}`: sin cuenta, dueño de su propia
 * ruta (como siempre); con cuenta, cajero de `users/{bodega}` si su miembro está activo. Cada
 * llamada reemplaza a la anterior (`intento`), así un "Volver a revisar" o una invitación
 * aceptada vuelven a abrir la sesión desde cero.
 */
let intento = 0;
let alVolverRed: (() => void) | null = null;

function olvidarReintento(): void {
  if (alVolverRed) window.removeEventListener('online', alVolverRed);
  alVolverRed = null;
}

async function abrirSesion(user: User): Promise<void> {
  // Un reintento tardío (p. ej. al volver la red) no abre la sesión de quien ya salió.
  if (auth.currentUser?.uid !== user.uid) return;
  const n = ++intento;
  limpiarSesion();
  olvidarReintento();
  $('login')?.setAttribute('hidden', '');
  $('cargando')?.removeAttribute('hidden');

  let acceso: Acceso;
  try {
    const cuenta = await equipoFirestore.leerCuenta(user.uid);
    const miembro = cuenta ? await equipoFirestore.leerMiembro(cuenta.bodega, user.uid) : null;
    acceso = resolverAcceso(user.uid, nombreDeUsuario(user), cuenta, miembro);
  } catch (error) {
    if (n !== intento) return;
    // Sin saber el rol no se abre nada: escribir como dueño en la ruta equivocada sería peor.
    console.error('Error al revisar la cuenta:', error);
    $('cargando')?.setAttribute('hidden', '');
    const reintentar = () => void abrirSesion(user);
    alVolverRed = reintentar;
    window.addEventListener('online', reintentar, { once: true });
    mostrarErrorSesion({ reintentar, salir: () => void salir() });
    return;
  }
  if (n !== intento || auth.currentUser?.uid !== user.uid) return;
  $('cargando')?.setAttribute('hidden', '');

  const usuario = { uid: user.uid, email: user.email, displayName: user.displayName };
  const unirme = () => abrirUnirme(usuario, () => void abrirSesion(user));
  fijarAccionesCuenta({ unirmeConCodigo: unirme });

  if (acceso.tipo === 'sin-acceso') {
    // El nombre de la bodega sale de la invitación con la que entró (se puede leer por código).
    let nombreBodega: string | null = null;
    if (acceso.codigo) {
      nombreBodega = (await equipoFirestore.leerInvitacion(acceso.codigo).catch(() => null))?.nombreBodega ?? null;
      if (n !== intento) return;
    }
    mostrarSinAcceso(acceso, nombreBodega, {
      reintentar: () => void abrirSesion(user),
      usarMiBodega: async () => {
        await equipoFirestore.borrarCuenta(user.uid);
        await abrirSesion(user);
      },
      tengoCodigo: unirme,
      salir: () => void salir(),
    });
    return;
  }

  const sesion = acceso.sesion;
  fijarSesion(sesion);
  setUserId(sesion.bodega);
  usarFuente({ ...fuenteFirestore, cerrarSesion: salir });
  actualizarDatos({ email: user.email });
  abrirListenersSesion((m) => avisar(m, 'error'));
  if (sesion.rol === 'cajero') {
    // Si el dueño lo desactiva o lo quita, pierde el acceso al instante: se vuelve a revisar.
    equipoFirestore.observarMiembro(
      sesion.bodega,
      sesion.uid,
      (m) => {
        if (n === intento && (!m || !m.activo)) void abrirSesion(user);
      },
      (e) => console.error(e),
    );
  }
  entrarApp();
}

async function iniciar(): Promise<void> {
  usarRepoEquipo(equipoFirestore);
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
      void abrirSesion(user);
    } else {
      intento++;
      olvidarReintento();
      fijarAccionesCuenta(null);
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
