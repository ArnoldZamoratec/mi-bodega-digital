import type { Auth } from 'firebase/auth';

/**
 * D-31: antes de cada transacción del outbox se pide el token de Auth. Si está vencido y no
 * hay red, falla aquí con `auth/network-request-failed` (error transitorio: se reintenta
 * luego) en lugar de fallar dentro de `runTransaction`, donde el SDK de Firestore 13.3
 * trata ese código como desconocido, dispara `INTERNAL ASSERTION FAILED (ID 3c6b)` y deja la
 * instancia inservible. Con un token recién validado (> 5 min de vida) Firestore no necesita
 * renovarlo durante la transacción.
 */
export async function asegurarToken(auth: Pick<Auth, 'currentUser'>): Promise<void> {
  const usuario = auth.currentUser;
  if (!usuario) throw Object.assign(new Error('Sesión aún no restaurada'), { code: 'unavailable' });
  await usuario.getIdToken();
}
