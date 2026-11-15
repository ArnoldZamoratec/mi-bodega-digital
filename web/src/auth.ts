/**
 * Textos y validaciones del login/registro (sin Firebase ni DOM: se prueban con Vitest).
 * Lenguaje humano (ux-web §3): qué pasó y qué hacer, sin emojis ni códigos técnicos.
 */
export interface ErrorConCodigo {
  code?: string;
  message?: string;
}

export interface MensajeAuth {
  texto: string;
  /** Acción sugerida que la pantalla ofrece como enlace. */
  accion?: 'recuperar' | 'registrar' | 'ingresar';
}

export function mensajeErrorLogin(error: ErrorConCodigo): MensajeAuth {
  switch (error.code) {
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return { texto: 'Esa contraseña no coincide con el correo. ¿La recuperamos?', accion: 'recuperar' };
    case 'auth/user-not-found':
      return { texto: 'No hay una cuenta con ese correo. ¿Quieres crearla?', accion: 'registrar' };
    case 'auth/invalid-email':
      return { texto: 'Ese correo no está completo. Debe verse así: nombre@gmail.com' };
    case 'auth/user-disabled':
      return { texto: 'Esta cuenta está desactivada. Escríbenos para revisarla.' };
    case 'auth/too-many-requests':
      return { texto: 'Hubo muchos intentos seguidos. Espera unos minutos y vuelve a probar, o recupera tu contraseña.', accion: 'recuperar' };
    case 'auth/network-request-failed':
      return { texto: 'No hay conexión a internet. Revísala e intenta de nuevo.' };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return { texto: 'Cerraste la ventana de Google antes de terminar. Puedes intentarlo otra vez.' };
    case 'auth/popup-blocked':
      return { texto: 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio e inténtalo otra vez.' };
    default:
      return { texto: 'No pudimos ingresar en este momento. Intenta de nuevo en unos segundos.' };
  }
}

export function mensajeErrorRegistro(error: ErrorConCodigo): MensajeAuth {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return { texto: 'Ese correo ya tiene una cuenta. Ingresa con él.', accion: 'ingresar' };
    case 'auth/invalid-email':
      return { texto: 'Ese correo no está completo. Debe verse así: nombre@gmail.com' };
    case 'auth/weak-password':
      return { texto: 'La contraseña es muy corta. Usa al menos 6 caracteres.' };
    case 'auth/operation-not-allowed':
      return { texto: 'Por ahora no se pueden crear cuentas nuevas. Escríbenos para activarla.' };
    case 'auth/network-request-failed':
      return { texto: 'No hay conexión a internet. Revísala e intenta de nuevo.' };
    default:
      return { texto: 'No pudimos crear la cuenta en este momento. Intenta de nuevo en unos segundos.' };
  }
}

export function mensajeRecuperacion(error: ErrorConCodigo | null): MensajeAuth {
  if (!error) return { texto: 'Te enviamos un correo para crear una contraseña nueva. Revisa también la carpeta de spam.' };
  if (error.code === 'auth/invalid-email' || error.code === 'auth/missing-email')
    return { texto: 'Escribe tu correo arriba y vuelve a tocar "¿Olvidaste tu contraseña?".' };
  if (error.code === 'auth/network-request-failed')
    return { texto: 'No hay conexión a internet. Revísala e intenta de nuevo.' };
  return { texto: 'No pudimos enviar el correo ahora. Intenta de nuevo en unos minutos.' };
}

/** RN-11: contraseña ≥ 6 y confirmación igual. `null` si es válida. */
export function validarRegistro(password: string, confirmacion: string): string | null {
  if (password.length < 6) return 'La contraseña necesita al menos 6 caracteres.';
  if (password !== confirmacion) return 'Las dos contraseñas no son iguales. Escríbelas otra vez.';
  return null;
}
