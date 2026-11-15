import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';

import type { Usuario } from '@/domain/entities';
import type { Cancelar, ServicioAuth } from '@/domain/ports';

import type { ProveedorGoogle } from '../google/proveedorGoogle';

export class AuthFirebase implements ServicioAuth {
  constructor(
    private readonly auth: Auth,
    /** Sin proveedor (falta GOOGLE_WEB_CLIENT_ID) el botón de Google no se muestra. */
    private readonly google?: ProveedorGoogle,
  ) {}

  get googleDisponible(): boolean {
    return !!this.google;
  }

  /**
   * Con "una cuenta por correo" (configuración por defecto de Firebase), entrar con Google
   * usando el mismo correo de una cuenta existente abre ESA cuenta: mismo uid, mismos datos.
   */
  async ingresarConGoogle(): Promise<'ok' | 'cancelado'> {
    if (!this.google) throw new Error('El inicio de sesión con Google no está configurado.');
    const idToken = await this.google.obtenerIdToken();
    if (!idToken) return 'cancelado';
    await signInWithCredential(this.auth, GoogleAuthProvider.credential(idToken));
    return 'ok';
  }

  observar(onCambio: (u: Usuario | null) => void): Cancelar {
    return onAuthStateChanged(this.auth, (user) =>
      // D-10: un usuario = una bodega = rol dueño.
      onCambio(user ? { uid: user.uid, email: user.email, rol: 'dueno' } : null),
    );
  }

  async ingresar(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email.trim(), password);
  }

  async registrar(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email.trim(), password);
  }

  recuperarContrasena(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email.trim());
  }

  async salir(): Promise<void> {
    await signOut(this.auth);
    // Que el próximo "Continuar con Google" deje elegir cuenta (otra bodega, otro dueño).
    await this.google?.salir().catch(() => undefined);
  }
}
