import type {
  AperturaCaja,
  Caja,
  CierreCaja,
  MovimientoCaja,
  OperacionCaja,
  TipoMovimientoCaja,
} from '@bodegon/core/rules/caja';

import { aFecha } from './mappers';

/**
 * Caja (D-28) ↔ Firestore. Lectura tolerante (igual que mobile/src/data/mappersCaja.ts) y las
 * escrituras EXACTAS que aceptan las reglas (firestore.rules, `match /cajas/{cajaId}`):
 *   apertura:   { estado: 'abierta', apertura: { monto, fecha: request.time, creadaEn } }
 *   movimiento: { tipo, monto, motivo, fecha: request.time, creadaEn }
 *   cierre:     solo cambia { estado: 'cerrada', cierre: { contado, esperado, diferencia, fecha, creadaEn } }
 * Sin `origen`: las reglas solo admiten 'movil' o nada. Sin dependencia de `firebase`: el
 * sello del servidor y la hora del equipo se reciben ya armados (serverTimestamp / Timestamp).
 */
type Datos = Record<string, unknown>;

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};

const objeto = (v: unknown): Datos => (v && typeof v === 'object' ? (v as Datos) : {});

const conCreadaEn = (v: unknown): { creadaEn?: Date } => {
  const f = aFecha(v);
  return f ? { creadaEn: f } : {};
};

function aApertura(v: unknown): AperturaCaja {
  const d = objeto(v);
  return { monto: numero(d.monto), fecha: aFecha(d.fecha), ...conCreadaEn(d.creadaEn) };
}

function aCierre(v: unknown): CierreCaja | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Datos;
  return {
    contado: numero(d.contado),
    esperado: numero(d.esperado),
    diferencia: numero(d.diferencia),
    fecha: aFecha(d.fecha),
    ...conCreadaEn(d.creadaEn),
  };
}

export function aCaja(id: string, d: Datos): Caja {
  const cierre = aCierre(d.cierre);
  return {
    id,
    // Cualquier valor raro se trata como cerrada: nunca bloquea abrir una caja nueva.
    estado: d.estado === 'abierta' ? 'abierta' : 'cerrada',
    apertura: aApertura(d.apertura),
    ...(cierre ? { cierre } : {}),
  };
}

export function aMovimientoCaja(cajaId: string, id: string, d: Datos): MovimientoCaja {
  const tipo: TipoMovimientoCaja = d.tipo === 'egreso' ? 'egreso' : 'ingreso';
  return {
    id,
    cajaId,
    tipo,
    monto: numero(d.monto),
    motivo: typeof d.motivo === 'string' ? d.motivo : '',
    fecha: aFecha(d.fecha),
    ...conCreadaEn(d.creadaEn),
  };
}

/** Qué documento se escribe y con qué datos. `S` = sello del servidor, `T` = hora del equipo. */
export type EscrituraCaja<S, T> =
  | {
      tipo: 'crear-caja';
      cajaId: string;
      datos: { estado: 'abierta'; apertura: { monto: number; fecha: S; creadaEn: T } };
    }
  | {
      tipo: 'crear-movimiento';
      cajaId: string;
      movimientoId: string;
      datos: { tipo: TipoMovimientoCaja; monto: number; motivo: string; fecha: S; creadaEn: T };
    }
  | {
      tipo: 'cerrar-caja';
      cajaId: string;
      datos: {
        estado: 'cerrada';
        cierre: { contado: number; esperado: number; diferencia: number; fecha: S; creadaEn: T };
      };
    };

/** Operación del core (`armarApertura`, `armarMovimientoCaja`, `armarCierre`) → escritura. */
export function escrituraCaja<S, T>(op: OperacionCaja, sello: S, creadaEn: T): EscrituraCaja<S, T> {
  switch (op.tipo) {
    case 'abrir':
      return {
        tipo: 'crear-caja',
        cajaId: op.cajaId,
        datos: { estado: 'abierta', apertura: { monto: op.monto, fecha: sello, creadaEn } },
      };
    case 'movimiento':
      return {
        tipo: 'crear-movimiento',
        cajaId: op.cajaId,
        movimientoId: op.id,
        datos: {
          tipo: op.movimiento.tipo,
          monto: op.movimiento.monto,
          motivo: op.movimiento.motivo,
          fecha: sello,
          creadaEn,
        },
      };
    case 'cerrar':
      return {
        tipo: 'cerrar-caja',
        cajaId: op.cajaId,
        datos: {
          estado: 'cerrada',
          cierre: {
            contado: op.cierre.contado,
            esperado: op.cierre.esperado,
            diferencia: op.cierre.diferencia,
            fecha: sello,
            creadaEn,
          },
        },
      };
  }
}
