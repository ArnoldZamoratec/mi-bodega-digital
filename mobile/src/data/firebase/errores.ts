import { ErrorDominio } from '@/domain/errors';
import type { ClasificadorErrores } from '@/domain/ports';

const codigo = (e: unknown): string =>
  e && typeof e === 'object' && 'code' in e && typeof e.code === 'string' ? e.code : '';

/** Códigos de Firestore que no se resuelven reintentando. */
const PERMANENTES = new Set([
  'permission-denied',
  'invalid-argument',
  'failed-precondition',
  'unauthenticated',
  'firestore/permission-denied',
]);

export const clasificadorFirebase: ClasificadorErrores = {
  esErrorPermanente: (e) => PERMANENTES.has(codigo(e)),
};

const MENSAJES_AUTH: Record<string, string> = {
  'auth/user-not-found': 'Usuario no encontrado. Verifica el correo o crea una cuenta.',
  'auth/wrong-password': 'Contraseña incorrecta. Intenta de nuevo.',
  'auth/invalid-email': 'Correo no válido. Usa el formato usuario@dominio.com',
  'auth/invalid-credential': 'Credenciales inválidas. Verifica correo y contraseña.',
  'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
  'auth/network-request-failed': 'Error de red. Verifica tu conexión a internet.',
  'auth/configuration-not-found': 'Firebase no está configurado correctamente.',
  'auth/email-already-in-use': 'Este correo ya está registrado. Intenta iniciar sesión.',
  'auth/weak-password': 'Contraseña muy débil. Usa al menos 6 caracteres.',
  'auth/operation-not-allowed': 'Este método de acceso está deshabilitado.',
  'auth/missing-email': 'Ingresa tu correo.',
  'auth/account-exists-with-different-credential':
    'Este correo ya tiene una cuenta con contraseña. Ingresa con tu correo y contraseña.',
  // Errores del inicio de sesión con Google (Credential Manager / Play Services).
  PLAY_SERVICES_NOT_AVAILABLE: 'Este teléfono no tiene Google Play Services actualizado.',
  IN_PROGRESS: 'Ya se está iniciando sesión con Google.',
  DEVELOPER_ERROR:
    'Google no está configurado para esta app (falta registrar la huella SHA-1 en Firebase).',
};

const MENSAJES_FIRESTORE: Record<string, string> = {
  'permission-denied': 'No tienes permiso para realizar esta acción.',
  unavailable: 'Sin conexión con el servidor. Se reintentará automáticamente.',
  'deadline-exceeded': 'El servidor tardó demasiado en responder.',
  'not-found': 'El registro ya no existe.',
  unauthenticated: 'Tu sesión expiró. Vuelve a iniciar sesión.',
};

/** Mensaje en español apto para el usuario, a partir de cualquier error. */
export function mensajeDeError(e: unknown, porDefecto = 'Ocurrió un error inesperado'): string {
  const c = codigo(e);
  if (c && MENSAJES_AUTH[c]) return MENSAJES_AUTH[c];
  if (c && MENSAJES_FIRESTORE[c]) return MENSAJES_FIRESTORE[c];
  if (e instanceof ErrorDominio) return e.message;
  return porDefecto;
}
