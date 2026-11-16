import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  terminate,
  type Firestore,
  type FirestoreSettings,
} from 'firebase/firestore';

import { firebaseEnv } from '@/shared/env';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

const AJUSTES_FIRESTORE: FirestoreSettings = {
  // Algunas redes móviles/proxies bloquean WebChannel; el SDK cae a long-polling.
  experimentalAutoDetectLongPolling: true,
};

/** Inicialización perezosa y única (sobrevive a Fast Refresh). */
export function obtenerFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app) {
    const yaIniciada = getApps().length > 0;
    app = yaIniciada ? getApp() : initializeApp(firebaseEnv());
    auth = yaIniciada
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    db = yaIniciada ? getFirestore(app) : initializeFirestore(app, AJUSTES_FIRESTORE);
  }
  return { app, auth: auth!, db: db! };
}

/**
 * D-31: reemplaza una instancia de Firestore inutilizable por una nueva.
 *
 * `terminate()` quita la instancia del registro de la app de forma síncrona y luego intenta
 * apagarla en su cola interna; con la cola rota esa promesa puede no terminar nunca, así que
 * no se espera. Lo que la vieja tenía en memoria se pierde, pero ventas, fiado y caja viven
 * en los outbox de AsyncStorage (D-05/D-24/D-28) y la nueva instancia los reenvía; las
 * transacciones son idempotentes. Después hay que recrear el contenedor (sus repositorios
 * guardan la referencia vieja).
 */
export function reiniciarFirestore(): Firestore {
  const { app: a, db: vieja } = obtenerFirebase();
  try {
    void terminate(vieja).catch(() => undefined);
  } catch {
    // Con la cola rota `terminate` puede lanzar al encolar; el registro ya se liberó.
  }
  db = initializeFirestore(a, AJUSTES_FIRESTORE);
  return db;
}
