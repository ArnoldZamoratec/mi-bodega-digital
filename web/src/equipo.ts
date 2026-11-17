import {
  aceptarInvitacion,
  ErrorDominio,
  normalizarCodigo,
  validarInvitacion,
  type AlError,
  type Miembro,
  type RepositorioEquipo,
  type Sesion,
} from '@bodegon/core';

import type { Cancelar } from './listeners';
import { AvisoEquipo } from './logic/equipo';

/**
 * Puerto del equipo (core `RepositorioEquipo`) más lo que la web necesita además: observar el
 * propio miembro (para cortar el acceso al instante si el dueño lo desactiva) y borrar la
 * cuenta cuando ya no es cajero activo (lo permiten las reglas). Implementaciones:
 * equipoFirestore.ts y, solo en desarrollo, la demo.
 */
export interface RepositorioEquipoWeb extends RepositorioEquipo {
  observarMiembro(
    dueno: string,
    uid: string,
    onDatos: (miembro: Miembro | null) => void,
    onError: AlError,
  ): Cancelar;
  /** `cuentas/{uid}`: solo se puede si ya no es cajero activo de esa bodega. */
  borrarCuenta(uid: string): Promise<void>;
}

let repo: RepositorioEquipoWeb | null = null;

export const usarRepoEquipo = (r: RepositorioEquipoWeb | null): void => {
  repo = r;
};

export function repoEquipo(): RepositorioEquipoWeb {
  if (!repo) throw new Error('Sin sesión');
  return repo;
}

export interface DatosUnirme {
  codigo: string;
  uid: string;
  nombre: string;
  email: string | null;
  ahora: Date;
}

/**
 * "Tengo un código de invitación". Usa `aceptarInvitacion` del core (la transacción que exigen
 * las reglas) y antes resuelve los casos que el core deja a la interfaz:
 *  - ya es miembro de esa bodega: activo ⇒ nada que hacer; desactivado ⇒ que el dueño lo active
 *    (las reglas no dejan recrear un miembro que existe);
 *  - su cuenta apunta a OTRA bodega donde ya no está activo ⇒ se borra la cuenta vieja primero
 *    (como pide docs/roles.md). Si sigue activo allá, el core responde CUENTA_DE_OTRA_BODEGA.
 */
export async function unirmeConCodigo(r: RepositorioEquipoWeb, d: DatosUnirme): Promise<Sesion> {
  const codigo = normalizarCodigo(d.codigo);
  if (!codigo) throw new ErrorDominio('CODIGO_INVALIDO');
  const inv = await r.leerInvitacion(codigo);
  validarInvitacion(inv, d.uid, d.ahora);
  const dueno = inv!.dueno;

  const yaMiembro = await r.leerMiembro(dueno, d.uid);
  if (yaMiembro?.activo) {
    throw new AvisoEquipo('YA_ERES_CAJERO', 'Ya eres cajero de esta bodega. Vuelve a ingresar para empezar a vender.');
  }
  if (yaMiembro) {
    throw new AvisoEquipo(
      'ACCESO_EN_PAUSA',
      'El dueño puso en pausa tu acceso a esta bodega. Pídele que lo vuelva a activar desde Equipo; no necesitas un código nuevo.',
    );
  }

  const cuenta = await r.leerCuenta(d.uid);
  if (cuenta && cuenta.bodega !== dueno) {
    const anterior = await r.leerMiembro(cuenta.bodega, d.uid);
    if (anterior?.activo) throw new ErrorDominio('CUENTA_DE_OTRA_BODEGA');
    await r.borrarCuenta(d.uid);
  }
  return aceptarInvitacion(r, { codigo, uid: d.uid, nombre: d.nombre, email: d.email, ahora: d.ahora });
}
