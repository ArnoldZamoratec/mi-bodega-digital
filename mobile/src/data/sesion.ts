import type { RepositorioEquipo } from '@/domain/portsEquipo';
import {
  resolverSesion,
  sesionDueno,
  type Cuenta,
  type Miembro,
  type Sesion,
} from '@/domain/rules/roles';

import type { AlmacenClaveValor } from './local/colaVentas';

/**
 * Sesión con rol (D-33, docs/roles.md). Al iniciar sesión se lee `cuentas/{uid}`: sin cuenta
 * es dueño de su ruta (como siempre); con cuenta es cajero de `cuenta.bodega` mientras su
 * miembro exista y esté activo.
 */

export type MotivoSinAcceso = 'desactivado' | 'quitado';

export type ResultadoSesion =
  | { tipo: 'activa'; sesion: Sesion }
  /** Cajero desactivado o quitado: no puede trabajar en esa bodega. */
  | { tipo: 'sin-acceso'; uid: string; bodega: string; motivo: MotivoSinAcceso };

/**
 * Lo que guarda el teléfono (outbox, caché del catálogo) va separado por sesión. El dueño
 * conserva la clave de siempre (`uid`), así sus pendientes de versiones viejas siguen ahí.
 * El cajero usa `uid@bodega`: si deja esa bodega, lo pendiente nunca se manda a su propia
 * ruta por error.
 */
export const claveLocal = (s: Pick<Sesion, 'uid' | 'bodega' | 'rol'>): string =>
  s.rol === 'dueno' ? s.uid : `${s.uid}@${s.bodega}`;

/** Une cuenta + miembro con `resolverSesion` del core y explica por qué no hay acceso. */
export function resultadoSesion(
  uid: string,
  nombre: string,
  cuenta: Cuenta | null,
  miembro: Miembro | null,
): ResultadoSesion {
  const sesion = resolverSesion(uid, nombre, cuenta, miembro);
  if (sesion) return { tipo: 'activa', sesion };
  return {
    tipo: 'sin-acceso',
    uid,
    bodega: cuenta?.bodega ?? uid,
    motivo: miembro ? 'desactivado' : 'quitado',
  };
}

/** Lee `cuentas/{uid}` y, si es cajero, su miembro en la bodega. Necesita red. */
export async function resolverSesionRemota(
  repo: Pick<RepositorioEquipo, 'leerCuenta' | 'leerMiembro'>,
  uid: string,
  nombre: string,
): Promise<ResultadoSesion> {
  const cuenta = await repo.leerCuenta(uid);
  if (!cuenta) return { tipo: 'activa', sesion: sesionDueno(uid, nombre) };
  const miembro = await repo.leerMiembro(cuenta.bodega, uid);
  return resultadoSesion(uid, nombre, cuenta, miembro);
}

const esTexto = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Valida lo leído del disco: un dato raro se descarta (se vuelve a resolver con red). */
function revivir(uid: string, v: unknown): ResultadoSesion | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Record<string, unknown>;
  if (d.tipo === 'activa' && d.sesion && typeof d.sesion === 'object') {
    const s = d.sesion as Record<string, unknown>;
    if (s.uid !== uid || !esTexto(s.bodega) || !esTexto(s.nombre)) return null;
    if (s.rol !== 'dueno' && s.rol !== 'cajero') return null;
    if (s.rol === 'dueno' && s.bodega !== uid) return null;
    return { tipo: 'activa', sesion: { uid, bodega: s.bodega, rol: s.rol, nombre: s.nombre } };
  }
  if (d.tipo === 'sin-acceso' && d.uid === uid && esTexto(d.bodega)) {
    return {
      tipo: 'sin-acceso',
      uid,
      bodega: d.bodega,
      motivo: d.motivo === 'desactivado' ? 'desactivado' : 'quitado',
    };
  }
  return null;
}

/**
 * Última sesión resuelta con el servidor, por uid. Permite abrir la app sin red y que un
 * cajero siga escribiendo en la bodega correcta (`users/{bodega}`).
 */
export class CacheSesion {
  constructor(
    private readonly almacen: AlmacenClaveValor & { removeItem?(k: string): Promise<void> },
  ) {}

  private clave(uid: string) {
    return `bodega:sesion:${uid}`;
  }

  async leer(uid: string): Promise<ResultadoSesion | null> {
    try {
      const crudo = await this.almacen.getItem(this.clave(uid));
      return crudo ? revivir(uid, JSON.parse(crudo)) : null;
    } catch {
      return null;
    }
  }

  async guardar(uid: string, r: ResultadoSesion): Promise<void> {
    try {
      await this.almacen.setItem(this.clave(uid), JSON.stringify(r));
    } catch {
      // Best-effort: sin caché, la próxima vez se resuelve con red.
    }
  }

  async borrar(uid: string): Promise<void> {
    try {
      await this.almacen.removeItem?.(this.clave(uid));
    } catch {
      // Ídem.
    }
  }
}
