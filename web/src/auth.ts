/**
 * Textos y validaciones del login/registro (sin Firebase ni DOM: se prueban con Vitest).
 * Son los mensajes de la v5.3 con la codificación corregida (B-08: "Contrase�a").
 */
export interface ErrorConCodigo {
  code?: string;
  message?: string;
}

export function mensajeErrorLogin(error: ErrorConCodigo): string {
  switch (error.code) {
    case 'auth/user-not-found':
      return '❌ Usuario no encontrado. Verifica el email o crea una cuenta.';
    case 'auth/wrong-password':
      return '❌ Contraseña incorrecta. Intenta de nuevo.';
    case 'auth/invalid-email':
      return '❌ Correo no válido. Usa formato: usuario@dominio.com';
    case 'auth/invalid-credential':
      return '❌ Credenciales inválidas. Verifica email y contraseña.';
    case 'auth/too-many-requests':
      return '❌ Demasiados intentos. Espera unos minutos.';
    case 'auth/network-request-failed':
      return '❌ Error de red. Verifica tu conexión a internet.';
    case 'auth/configuration-not-found':
      return '❌ Firebase no está configurado. Verifica la configuración.';
    default:
      return `❌ Error: ${error.message || 'Error desconocido'}`;
  }
}

export function mensajeErrorRegistro(error: ErrorConCodigo): string {
  switch (error.code) {
    case 'auth/email-already-in-use':
      return '❌ Este email ya está registrado. Intenta iniciar sesión.';
    case 'auth/invalid-email':
      return '❌ Email inválido. Usa formato: usuario@dominio.com';
    case 'auth/weak-password':
      return '❌ Contraseña muy débil. Usa al menos 6 caracteres.';
    case 'auth/operation-not-allowed':
      return '❌ Registro deshabilitado. Contacta al administrador.';
    default:
      return `❌ Error: ${error.message || 'Error desconocido'}`;
  }
}

/** RN-11: contraseña ≥ 6 y confirmación igual. `null` si es válida. */
export function validarRegistro(password: string, confirmacion: string): string | null {
  if (password !== confirmacion) return '❌ Las contraseñas no coinciden';
  if (password.length < 6) return '❌ La contraseña debe tener al menos 6 caracteres';
  return null;
}
