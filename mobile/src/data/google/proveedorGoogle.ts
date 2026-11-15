import {
  GoogleOneTapSignIn,
  isNoSavedCredentialFoundResponse,
  isSuccessResponse,
} from 'react-native-nitro-google-signin';

/**
 * Adaptador nativo de "Iniciar sesión con Google" (Credential Manager en Android, vía
 * react-native-nitro-google-signin, la opción que recomienda Expo). Solo entrega el
 * `idToken`: Firebase Auth hace el resto en `AuthFirebase`. Separado para que el resto
 * de la app y las pruebas no dependan del módulo nativo.
 */
export interface ProveedorGoogle {
  /** idToken de Google, o `null` si el usuario cerró el selector de cuentas. */
  obtenerIdToken(): Promise<string | null>;
  salir(): Promise<void>;
}

let configurado = false;

export function crearProveedorGoogle(webClientId: string): ProveedorGoogle {
  const configurar = () => {
    if (configurado) return;
    GoogleOneTapSignIn.configure({ webClientId });
    configurado = true;
  };

  return {
    async obtenerIdToken() {
      configurar();
      await GoogleOneTapSignIn.checkPlayServices(true);
      // 1) cuenta ya usada en esta app (un toque); 2) elegir/crear con una cuenta del
      // teléfono; 3) el botón explícito de Google como último recurso.
      let r = await GoogleOneTapSignIn.signIn();
      if (isNoSavedCredentialFoundResponse(r)) r = await GoogleOneTapSignIn.createAccount();
      if (isNoSavedCredentialFoundResponse(r)) r = await GoogleOneTapSignIn.presentExplicitSignIn();
      return isSuccessResponse(r) ? r.data.idToken : null;
    },
    async salir() {
      configurar();
      await GoogleOneTapSignIn.signOut();
    },
  };
}
