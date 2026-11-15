import Constants from 'expo-constants';

export interface FirebaseEnv {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

interface Extra {
  firebase?: Partial<FirebaseEnv>;
  dataAppId?: string;
  googleWebClientId?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

const CAMPOS_OBLIGATORIOS: (keyof FirebaseEnv)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];

/** Variables faltantes, para mostrar una pantalla de configuración en lugar de fallar. */
export const variablesFaltantes = (): string[] =>
  CAMPOS_OBLIGATORIOS.filter((k) => !extra.firebase?.[k]).map(
    (k) => `FIREBASE_${k.replace(/([A-Z])/g, '_$1').toUpperCase()}`,
  );

export const firebaseEnv = (): FirebaseEnv => ({
  apiKey: extra.firebase?.apiKey ?? '',
  authDomain: extra.firebase?.authDomain ?? '',
  projectId: extra.firebase?.projectId ?? '',
  storageBucket: extra.firebase?.storageBucket ?? '',
  messagingSenderId: extra.firebase?.messagingSenderId ?? '',
  appId: extra.firebase?.appId ?? '',
});

/** Debe coincidir con `appId` de la web para compartir datos (ARCHITECTURE §2). */
export const dataAppId = (): string => extra.dataAppId || 'mi-bodega-app';

/** "ID de cliente web" de Google (Firebase → Authentication → Google). Vacío = sin Google. */
export const googleWebClientId = (): string => extra.googleWebClientId?.trim() ?? '';
