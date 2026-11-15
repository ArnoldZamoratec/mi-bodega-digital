import type { MovimientoFiado, Venta } from '../entities';
import { ErrorDominio } from '../errors';
import { aCentimos, aSoles } from './dinero';
import { fechaEfectiva } from './reportes';
import type { VentaNueva } from './venta';

/**
 * Caja (D-28): sesiones de efectivo con apertura, ingresos/egresos manuales y cierre con
 * arqueo. Todo el cálculo en céntimos (D-13); se guarda en soles como el resto.
 *
 * Firestore (aditivo, bajo el uid):
 *   cajas/{cajaId}                    { estado, apertura{monto,fecha,creadaEn}, cierre?{…} }
 *   cajas/{cajaId}/movimientos/{id}   { tipo, monto, motivo, fecha, creadaEn }
 */

export type EstadoCaja = 'abierta' | 'cerrada';
export type TipoMovimientoCaja = 'ingreso' | 'egreso';

export interface AperturaCaja {
  /** Soles con los que se abre (sencillo para dar vuelto). */
  monto: number;
  /** Hora del servidor; `null` mientras está pendiente. */
  fecha: Date | null;
  /** Hora del teléfono (D-26). */
  creadaEn?: Date;
}

export interface CierreCaja {
  contado: number;
  esperado: number;
  /** contado − esperado: > 0 sobrante, < 0 faltante. */
  diferencia: number;
  fecha: Date | null;
  creadaEn?: Date;
}

export interface Caja {
  id: string;
  estado: EstadoCaja;
  apertura: AperturaCaja;
  cierre?: CierreCaja;
  /** Solo en memoria: guardada en el teléfono, aún no confirmada (outbox). */
  pendiente?: boolean;
}

export interface MovimientoCaja {
  id: string;
  cajaId: string;
  tipo: TipoMovimientoCaja;
  monto: number;
  motivo: string;
  fecha: Date | null;
  creadaEn?: Date;
  pendiente?: boolean;
}

/** Tope por monto, para atajar errores de tipeo (un cero de más). */
export const MONTO_MAXIMO_CAJA = 100_000;
export const LARGO_MAXIMO_MOTIVO = 80;

/**
 * Lo que se guarda en el outbox del teléfono (serializable). `id` es el id de la operación:
 * el de la caja al abrir, el del movimiento, o `{cajaId}-cierre` al cerrar. Así reenviar
 * es idempotente, igual que ventas y fiado (D-05, D-24).
 */
export type OperacionCaja =
  | { id: string; tipo: 'abrir'; cajaId: string; monto: number; creadaEn: number }
  | {
      id: string;
      tipo: 'movimiento';
      cajaId: string;
      movimiento: { tipo: TipoMovimientoCaja; monto: number; motivo: string };
      creadaEn: number;
    }
  | {
      id: string;
      tipo: 'cerrar';
      cajaId: string;
      cierre: { contado: number; esperado: number; diferencia: number };
      creadaEn: number;
    };

export const idCierre = (cajaId: string): string => `${cajaId}-cierre`;

/** Monto en soles válido: finito, ≥ 0 (o > 0) y bajo el tope. Devuelve céntimos. */
function centimosValidos(monto: number, permitirCero: boolean): number {
  if (!Number.isFinite(monto)) throw new ErrorDominio('MONTO_INVALIDO');
  const c = aCentimos(monto);
  if (c < 0 || (!permitirCero && c === 0) || c > MONTO_MAXIMO_CAJA * 100) {
    throw new ErrorDominio('MONTO_INVALIDO');
  }
  return c;
}

/** Una sola caja abierta por usuario: la más reciente si hubiera más de una (datos raros). */
export function cajaAbierta(cajas: readonly Caja[]): Caja | undefined {
  return ordenarCajas(cajas.filter((c) => c.estado === 'abierta'))[0];
}

const inicioCaja = (c: Caja): number =>
  fechaEfectiva(c.apertura)?.getTime() ?? Number.MAX_SAFE_INTEGER;

/** Más reciente primero. */
export const ordenarCajas = <T extends Caja>(cajas: readonly T[]): T[] =>
  [...cajas].sort((a, b) => inicioCaja(b) - inicioCaja(a) || b.id.localeCompare(a.id));

/** Sesiones cerradas, la más reciente primero. */
export const historialCajas = (cajas: readonly Caja[]): Caja[] =>
  ordenarCajas(cajas.filter((c) => c.estado === 'cerrada'));

export function armarApertura(
  cajas: readonly Caja[],
  cajaId: string,
  monto: number,
  ahora: number,
): OperacionCaja {
  if (cajaAbierta(cajas)) throw new ErrorDominio('CAJA_YA_ABIERTA');
  const c = centimosValidos(monto, true);
  return { id: cajaId, tipo: 'abrir', cajaId, monto: aSoles(c), creadaEn: ahora };
}

export function armarMovimientoCaja(
  caja: Caja | undefined,
  movimientoId: string,
  tipo: TipoMovimientoCaja,
  monto: number,
  motivo: string,
  ahora: number,
): OperacionCaja {
  if (!caja || caja.estado !== 'abierta') throw new ErrorDominio('CAJA_NO_ABIERTA');
  if (tipo !== 'ingreso' && tipo !== 'egreso') throw new ErrorDominio('MONTO_INVALIDO');
  const c = centimosValidos(monto, false);
  const m = motivo.trim().replace(/\s+/g, ' ');
  if (!m) throw new ErrorDominio('MOTIVO_VACIO');
  return {
    id: movimientoId,
    tipo: 'movimiento',
    cajaId: caja.id,
    movimiento: { tipo, monto: aSoles(c), motivo: m.slice(0, LARGO_MAXIMO_MOTIVO) },
    creadaEn: ahora,
  };
}

export type ResultadoArqueo = 'cuadra' | 'sobrante' | 'faltante';

export function arqueo(
  contado: number,
  esperado: number,
): { diferencia: number; resultado: ResultadoArqueo } {
  const dif = aCentimos(contado) - aCentimos(esperado);
  return {
    diferencia: aSoles(dif),
    resultado: dif === 0 ? 'cuadra' : dif > 0 ? 'sobrante' : 'faltante',
  };
}

export function armarCierre(
  caja: Caja | undefined,
  contado: number,
  esperado: number,
  ahora: number,
): OperacionCaja {
  if (!caja || caja.estado !== 'abierta') throw new ErrorDominio('CAJA_NO_ABIERTA');
  const c = centimosValidos(contado, true);
  const e = aCentimos(esperado);
  return {
    id: idCierre(caja.id),
    tipo: 'cerrar',
    cajaId: caja.id,
    cierre: { contado: aSoles(c), esperado: aSoles(e), diferencia: aSoles(c - e) },
    creadaEn: ahora,
  };
}

/** Venta aún en el outbox de ventas (solo lo que se necesita para la caja). */
export interface VentaPendienteCaja {
  ventaId: string;
  creadaEn: number;
  venta: Pick<VentaNueva, 'total' | 'metodoDePago'>;
}

export interface ResumenCaja {
  inicial: number;
  /** Ventas al contado en efectivo de la sesión, menos sus anulaciones (contraasientos). */
  ventasEfectivo: number;
  /** Abonos de fiado cobrados en efectivo durante la sesión. */
  abonosEfectivo: number;
  ingresos: number;
  egresos: number;
  /** inicial + ventasEfectivo + abonosEfectivo + ingresos − egresos. */
  esperado: number;
}

/**
 * Efectivo que debería haber en el cajón. Ventana de la sesión: desde la apertura hasta el
 * cierre (o `ahora` si sigue abierta), siempre por fecha efectiva (D-26), para que una venta
 * cobrada sin señal cuente en la sesión en la que se cobró.
 *  - Ventas: solo `Efectivo`. Un contraasiento (D-22) tiene total negativo y resta solo.
 *    Las del outbox también cuentan; si una ya llegó al servidor, se cuenta una vez.
 *  - Abonos de fiado: solo `metodoPago === 'Efectivo'`.
 *  - Ingresos/egresos manuales: los de esta caja, sin filtro de fecha.
 */
export function resumenCaja(datos: {
  caja: Caja;
  ventas: readonly Pick<Venta, 'id' | 'total' | 'metodoDePago' | 'fecha' | 'creadaEn'>[];
  ventasPendientes?: readonly VentaPendienteCaja[];
  movimientosFiado: readonly Pick<MovimientoFiado, 'monto' | 'metodoPago' | 'fecha' | 'creadaEn'>[];
  movimientosCaja: readonly Pick<MovimientoCaja, 'cajaId' | 'tipo' | 'monto'>[];
  ahora: Date;
}): ResumenCaja {
  const { caja, ahora } = datos;
  const desde = fechaEfectiva(caja.apertura)?.getTime() ?? ahora.getTime();
  const hasta =
    caja.estado === 'cerrada' && caja.cierre
      ? (fechaEfectiva(caja.cierre)?.getTime() ?? ahora.getTime())
      : ahora.getTime();
  const enSesion = (f: Date | null): boolean =>
    f !== null && f.getTime() >= desde && f.getTime() <= hasta;

  let ventas = 0;
  const vistas = new Set<string>();
  for (const v of datos.ventas) {
    if (vistas.has(v.id)) continue;
    vistas.add(v.id);
    if (v.metodoDePago !== 'Efectivo' || !enSesion(fechaEfectiva(v))) continue;
    ventas += aCentimos(v.total);
  }
  for (const p of datos.ventasPendientes ?? []) {
    if (vistas.has(p.ventaId)) continue;
    vistas.add(p.ventaId);
    if (p.venta.metodoDePago !== 'Efectivo' || !enSesion(new Date(p.creadaEn))) continue;
    ventas += aCentimos(p.venta.total);
  }

  let abonos = 0;
  for (const m of datos.movimientosFiado) {
    if (m.monto >= 0 || m.metodoPago !== 'Efectivo' || !enSesion(fechaEfectiva(m))) continue;
    abonos += Math.abs(aCentimos(m.monto));
  }

  let ingresos = 0;
  let egresos = 0;
  for (const m of datos.movimientosCaja) {
    if (m.cajaId !== caja.id) continue;
    if (m.tipo === 'ingreso') ingresos += aCentimos(m.monto);
    else if (m.tipo === 'egreso') egresos += aCentimos(m.monto);
  }

  const inicial = aCentimos(caja.apertura.monto);
  return {
    inicial: aSoles(inicial),
    ventasEfectivo: aSoles(ventas),
    abonosEfectivo: aSoles(abonos),
    ingresos: aSoles(ingresos),
    egresos: aSoles(egresos),
    esperado: aSoles(inicial + ventas + abonos + ingresos - egresos),
  };
}

/**
 * Une las cajas confirmadas con las operaciones del outbox: una apertura pendiente aparece
 * como caja abierta y un cierre pendiente la muestra cerrada. Si el servidor ya tiene la
 * caja (o ya está cerrada), gana el servidor.
 */
export function cajasConPendientes(
  remotas: readonly Caja[],
  operaciones: readonly OperacionCaja[],
): Caja[] {
  const porId = new Map(remotas.map((c) => [c.id, c]));
  for (const op of operaciones) {
    if (op.tipo === 'abrir' && !porId.has(op.cajaId)) {
      porId.set(op.cajaId, {
        id: op.cajaId,
        estado: 'abierta',
        apertura: {
          monto: op.monto,
          fecha: new Date(op.creadaEn),
          creadaEn: new Date(op.creadaEn),
        },
        pendiente: true,
      });
    } else if (op.tipo === 'cerrar') {
      const caja = porId.get(op.cajaId);
      if (caja && caja.estado === 'abierta') {
        porId.set(op.cajaId, {
          ...caja,
          estado: 'cerrada',
          cierre: {
            ...op.cierre,
            fecha: new Date(op.creadaEn),
            creadaEn: new Date(op.creadaEn),
          },
          pendiente: true,
        });
      }
    }
  }
  return ordenarCajas([...porId.values()]);
}

/** Movimientos confirmados de una caja más los del outbox (gana el servidor por id). */
export function movimientosCajaConPendientes(
  remotos: readonly MovimientoCaja[],
  operaciones: readonly OperacionCaja[],
  cajaId: string,
): MovimientoCaja[] {
  const ids = new Set(remotos.map((m) => m.id));
  const pendientes: MovimientoCaja[] = operaciones.flatMap((op) =>
    op.tipo === 'movimiento' && op.cajaId === cajaId && !ids.has(op.id)
      ? [
          {
            id: op.id,
            cajaId,
            ...op.movimiento,
            fecha: new Date(op.creadaEn),
            creadaEn: new Date(op.creadaEn),
            pendiente: true,
          },
        ]
      : [],
  );
  const tiempo = (m: MovimientoCaja) => fechaEfectiva(m)?.getTime() ?? Number.MAX_SAFE_INTEGER;
  return [...remotos.filter((m) => m.cajaId === cajaId), ...pendientes].sort(
    (a, b) => tiempo(b) - tiempo(a) || b.id.localeCompare(a.id),
  );
}
