import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

import { firebaseEnv } from '@/shared/env';

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;

/** Inicialización perezosa y única (sobrevive a Fast Refresh). */
export function obtenerFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore } {
  if (!app) {
    const yaIniciada = getApps().length > 0;
    app = yaIniciada ? getApp() : initializeApp(firebaseEnv());
    auth = yaIniciada
      ? getAuth(app)
      : initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
    db = yaIniciada
      ? getFirestore(app)
      : initializeFirestore(app, {
          // Algunas redes móviles/proxies bloquean WebChannel; el SDK cae a long-polling.
          experimentalAutoDetectLongPolling: true,
        });
  }
  return { app, auth: auth!, db: db! };
}
