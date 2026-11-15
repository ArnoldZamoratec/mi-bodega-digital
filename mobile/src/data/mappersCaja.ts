import type {
  AperturaCaja,
  Caja,
  CierreCaja,
  MovimientoCaja,
  TipoMovimientoCaja,
} from '@/domain/rules/caja';

import { fecha } from './mappers';

/** Firestore → dominio para la caja (D-28). Tolerante como `mappers.ts`. */

type Datos = Record<string, unknown>;

const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : 0;
};

const objeto = (v: unknown): Datos => (v && typeof v === 'object' ? (v as Datos) : {});

const conCreadaEn = (v: unknown): { creadaEn?: Date } => {
  const f = fecha(v);
  return f && !Number.isNaN(f.getTime()) ? { creadaEn: f } : {};
};

function aApertura(v: unknown): AperturaCaja {
  const d = objeto(v);
  return { monto: numero(d.monto), fecha: fecha(d.fecha), ...conCreadaEn(d.creadaEn) };
}

function aCierre(v: unknown): CierreCaja | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const d = v as Datos;
  return {
    contado: numero(d.contado),
    esperado: numero(d.esperado),
    diferencia: numero(d.diferencia),
    fecha: fecha(d.fecha),
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
    fecha: fecha(d.fecha),
    ...conCreadaEn(d.creadaEn),
  };
}

/** JSON guarda las fechas como texto: se reconstruyen al leer la caché del teléfono. */
const revivir = (v: unknown): Date | null => {
  if (v === null || v === undefined) return null;
  const f = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(f.getTime()) ? null : f;
};

const creadaOpcional = (v: unknown): { creadaEn?: Date } => {
  const f = revivir(v);
  return f ? { creadaEn: f } : {};
};

export function revivirCaja(c: Caja): Caja {
  return {
    id: c.id,
    estado: c.estado,
    apertura: {
      monto: c.apertura.monto,
      fecha: revivir(c.apertura.fecha),
      ...creadaOpcional(c.apertura.creadaEn),
    },
    ...(c.cierre
      ? {
          cierre: {
            contado: c.cierre.contado,
            esperado: c.cierre.esperado,
            diferencia: c.cierre.diferencia,
            fecha: revivir(c.cierre.fecha),
            ...creadaOpcional(c.cierre.creadaEn),
          },
        }
      : {}),
  };
}

export function revivirMovimientoCaja(m: MovimientoCaja): MovimientoCaja {
  return {
    id: m.id,
    cajaId: m.cajaId,
    tipo: m.tipo,
    monto: m.monto,
    motivo: m.motivo,
    fecha: revivir(m.fecha),
    ...creadaOpcional(m.creadaEn),
  };
}
