import { ErrorDominio } from '../errors';
import type { RepositorioEquipo } from '../portsEquipo';
import {
  LARGO_EMAIL_MIEMBRO,
  crearInvitacion,
  cuposCajeros,
  exigirPermiso,
  mensajeInvitacion,
  nombreAutor,
  normalizarCodigo,
  validarInvitacion,
  type Invitacion,
  type Miembro,
  type Sesion,
} from '../rules/roles';

/** Casos de uso del equipo (D-33). */

export interface DatosInvitarCajero {
  sesion: Sesion;
  nombreBodega: string;
  /** Miembros actuales (para el tope de 3 activos, que las reglas no pueden contar). */
  miembros: readonly Pick<Miembro, 'activo'>[];
  ahora: Date;
  rng: () => number;
}

const INTENTOS_CODIGO = 3;

/**
 * Dueño → "Invitar cajero": crea la invitación y devuelve el mensaje de WhatsApp.
 * Si el código choca con uno existente (improbable: 31^8) se reintenta con otro.
 */
export async function invitarCajero(
  repo: RepositorioEquipo,
  { sesion, nombreBodega, miembros, ahora, rng }: DatosInvitarCajero,
): Promise<{ invitacion: Invitacion; mensaje: string }> {
  exigirPermiso(sesion, 'gestionarEquipo');
  if (cuposCajeros(miembros) === 0) throw new ErrorDominio('LIMITE_CAJEROS');
  let ultimoError: unknown;
  for (let i = 0; i < INTENTOS_CODIGO; i++) {
    const invitacion = crearInvitacion({ dueno: sesion.uid, nombreBodega, ahora, rng });
    if (await repo.leerInvitacion(invitacion.codigo)) continue;
    try {
      await repo.crearInvitacion(invitacion);
      return {
        invitacion,
        mensaje: mensajeInvitacion({
          nombreBodega: invitacion.nombreBodega,
          codigo: invitacion.codigo,
        }),
      };
    } catch (e) {
      ultimoError = e;
    }
  }
  throw ultimoError ?? new Error('No se pudo generar un código de invitación libre');
}

export interface DatosAceptarInvitacion {
  /** Tal como lo escribió el cajero ("abcd-efgh"). */
  codigo: string;
  uid: string;
  nombre: string;
  email: string | null;
  ahora: Date;
}

/**
 * Cajero → "Tengo un código de invitación". Valida lo mismo que las reglas antes de escribir,
 * para mostrar un mensaje claro en lugar de "permiso denegado". Devuelve la sesión de cajero.
 */
export async function aceptarInvitacion(
  repo: RepositorioEquipo,
  { codigo, uid, nombre, email, ahora }: DatosAceptarInvitacion,
): Promise<Sesion> {
  const normalizado = normalizarCodigo(codigo);
  if (!normalizado) throw new ErrorDominio('CODIGO_INVALIDO');
  const invitacion = await repo.leerInvitacion(normalizado);
  validarInvitacion(invitacion, uid, ahora);
  const inv = invitacion as Invitacion;

  const cuenta = await repo.leerCuenta(uid);
  if (cuenta && cuenta.bodega !== inv.dueno) throw new ErrorDominio('CUENTA_DE_OTRA_BODEGA');

  const nombreMiembro = nombreAutor(nombre, 'cajero');
  await repo.aceptarInvitacion({
    codigo: normalizado,
    dueno: inv.dueno,
    miembro: {
      uid,
      rol: 'cajero',
      nombre: nombreMiembro,
      email: (email ?? '').trim().slice(0, LARGO_EMAIL_MIEMBRO),
      activo: true,
      invitacion: normalizado,
    },
    crearCuenta: !cuenta,
  });
  return { uid, bodega: inv.dueno, rol: 'cajero', nombre: nombreMiembro };
}

/** Dueño → interruptor "activo" de un cajero. */
export async function cambiarActivoCajero(
  repo: RepositorioEquipo,
  sesion: Sesion,
  uid: string,
  activo: boolean,
): Promise<void> {
  exigirPermiso(sesion, 'gestionarEquipo');
  await repo.actualizarMiembro(sesion.bodega, uid, { activo });
}

/** Dueño → "Quitar" un cajero. Pierde el acceso de inmediato (las reglas leen el miembro). */
export async function quitarCajero(repo: RepositorioEquipo, sesion: Sesion, uid: string) {
  exigirPermiso(sesion, 'gestionarEquipo');
  await repo.quitarMiembro(sesion.bodega, uid);
}
