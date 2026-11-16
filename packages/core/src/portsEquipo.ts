import type { AlError, Cancelar } from './ports';
import type { Cuenta, Invitacion, Miembro } from './rules/roles';

/**
 * Puertos del equipo (D-33, docs/roles.md): invitaciones, miembros y cuentas.
 * En un archivo propio, como `portsCaja.ts`. Lo implementa la capa `data/` en la fase 2.
 */

/** Lo que escribe el cajero en UNA transacción al aceptar (las reglas exigen las tres). */
export interface AceptacionInvitacion {
  codigo: string;
  /** uid del dueño (= bodega). */
  dueno: string;
  /** `users/{dueno}/miembros/{miembro.uid}`; `desde` = serverTimestamp en la capa de datos. */
  miembro: Omit<Miembro, 'desde'>;
  /**
   * false si `cuentas/{uid}` ya existe y apunta a esta misma bodega (cajero que vuelve tras
   * ser quitado): las reglas no permiten reescribirla.
   */
  crearCuenta: boolean;
}

export interface RepositorioEquipo {
  // ----- invitaciones (artifacts/mi-bodega-app/invitaciones/{codigo}) -----
  /** Crea la invitación; `creada` = serverTimestamp. Falla si el código ya existe. */
  crearInvitacion(invitacion: Invitacion): Promise<void>;
  leerInvitacion(codigo: string): Promise<Invitacion | null>;
  /** Invitaciones del dueño (consulta `where('dueno', '==', dueno)`). */
  observarInvitaciones(
    dueno: string,
    onDatos: (invitaciones: Invitacion[]) => void,
    onError: AlError,
  ): Cancelar;
  borrarInvitacion(codigo: string): Promise<void>;

  // ----- miembros (users/{dueno}/miembros/{uid}) -----
  observarMiembros(
    dueno: string,
    onDatos: (miembros: Miembro[]) => void,
    onError: AlError,
  ): Cancelar;
  leerMiembro(dueno: string, uid: string): Promise<Miembro | null>;
  /** Solo `activo` y `nombre` (lo único que las reglas permiten cambiar). */
  actualizarMiembro(
    dueno: string,
    uid: string,
    cambios: Partial<Pick<Miembro, 'activo' | 'nombre'>>,
  ): Promise<void>;
  quitarMiembro(dueno: string, uid: string): Promise<void>;

  // ----- cuentas (artifacts/mi-bodega-app/cuentas/{uid}) -----
  leerCuenta(uid: string): Promise<Cuenta | null>;
  /** Invitación usada + miembro + cuenta, todo o nada. */
  aceptarInvitacion(aceptacion: AceptacionInvitacion): Promise<void>;
}
