import type { Cuenta, Invitacion, Miembro } from '@/domain/rules/roles';

import { fecha } from './mappers';

/** Firestore → dominio para el equipo (D-33). Tolerante como `mappers.ts`. */

type Datos = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

export function aInvitacion(codigo: string, d: Datos): Invitacion | null {
  const expira = fecha(d.expira);
  if (d.rol !== 'cajero' || !texto(d.dueno) || !expira) return null;
  return {
    codigo,
    dueno: texto(d.dueno),
    rol: 'cajero',
    creada: fecha(d.creada),
    expira,
    usadaPor: typeof d.usadaPor === 'string' && d.usadaPor ? d.usadaPor : null,
    nombreBodega: texto(d.nombreBodega),
  };
}

export function aMiembro(uid: string, d: Datos): Miembro {
  return {
    uid,
    rol: 'cajero',
    nombre: texto(d.nombre),
    email: texto(d.email),
    // Cualquier valor raro cuenta como inactivo: nunca da acceso por error.
    activo: d.activo === true,
    desde: fecha(d.desde),
    invitacion: texto(d.invitacion),
  };
}

export function aCuenta(uid: string, d: Datos | undefined): Cuenta | null {
  if (!d || d.rol !== 'cajero' || !texto(d.bodega)) return null;
  return { uid, bodega: texto(d.bodega), rol: 'cajero' };
}
