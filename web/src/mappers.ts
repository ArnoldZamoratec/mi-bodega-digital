import {
  leerAutoria,
  METODOS_PAGO_ABONO,
  type Autoria,
  type Cliente,
  type MetodoPagoAbono,
  type MetodoPagoVenta,
  type MovimientoFiado,
  type Producto,
  type Venta,
} from '@bodegon/core';

/**
 * Documentos Firestore → entidades del core. Tolerantes a datos heredados de la v5.x
 * (campos ausentes, `stock` null, `fecha` pendiente de serverTimestamp), igual que los
 * mappers de la app móvil. Sin dependencia de `firebase`: solo se mira `toDate()`.
 */
type Datos = Record<string, unknown>;

/**
 * Autoría (D-33, `leerAutoria` del core): quién registró la venta o el movimiento. Solo en
 * la web (el core no la necesita para calcular); documentos viejos no la tienen.
 */
export interface ConAutor {
  autor?: Autoria;
}
export type VentaWeb = Venta & ConAutor;
export type MovimientoWeb = MovimientoFiado & ConAutor;

interface ConToDate {
  toDate(): Date;
}

const esFecha = (v: unknown): v is ConToDate =>
  typeof v === 'object' && v !== null && typeof (v as ConToDate).toDate === 'function';

/** Timestamp | Date | null → Date | null. */
export function aFecha(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (esFecha(v)) {
    const d = v.toDate();
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v));
const numero = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function aProducto(id: string, d: Datos): Producto {
  const stock = d.stock;
  return {
    id,
    nombre: texto(d.nombre),
    precio: numero(d.precio),
    stock: stock === null || stock === undefined || stock === '' ? null : numero(stock),
    ...(typeof d.codigoBarras === 'string' ? { codigoBarras: d.codigoBarras } : {}),
  };
}

export function aCliente(id: string, d: Datos): Cliente {
  const ultimo = aFecha(d.ultimoRecordatorio);
  return {
    id,
    nombre: texto(d.nombre),
    telefono: texto(d.telefono),
    ...(ultimo ? { ultimoRecordatorio: ultimo } : {}),
  };
}

export function aVenta(id: string, d: Datos): VentaWeb {
  const items = Array.isArray(d.items) ? (d.items as Datos[]) : [];
  const creadaEn = aFecha(d.creadaEn);
  const autor = leerAutoria('venta', d);
  return {
    id,
    items: items.map((i) => ({
      id: texto(i?.id),
      nombre: texto(i?.nombre),
      precio: numero(i?.precio),
      cantidad: numero(i?.cantidad),
    })),
    total: numero(d.total),
    // Un literal desconocido no suma en ningún medio de pago (igual que la v5.3).
    metodoDePago: texto(d.metodoDePago) as MetodoPagoVenta,
    clienteId: typeof d.clienteId === 'string' ? d.clienteId : null,
    fecha: aFecha(d.fecha),
    ...(creadaEn ? { creadaEn } : {}),
    ...(typeof d.anulaA === 'string' ? { anulaA: d.anulaA } : {}),
    ...(autor ? { autor } : {}),
  };
}

const esMetodoAbono = (v: unknown): v is MetodoPagoAbono =>
  typeof v === 'string' && (METODOS_PAGO_ABONO as readonly string[]).includes(v);

export function aMovimiento(id: string, d: Datos): MovimientoWeb {
  const creadaEn = aFecha(d.creadaEn);
  const autor = leerAutoria('movimientoFiado', d);
  return {
    id,
    clienteId: texto(d.clienteId),
    monto: numero(d.monto),
    descripcion: texto(d.descripcion),
    fecha: aFecha(d.fecha),
    pagado: d.pagado === true,
    ...(creadaEn ? { creadaEn } : {}),
    ...(typeof d.ventaId === 'string' ? { ventaId: d.ventaId } : {}),
    ...(esMetodoAbono(d.metodoPago) ? { metodoPago: d.metodoPago } : {}),
    ...(typeof d.deudaOrigenId === 'string' ? { deudaOrigenId: d.deudaOrigenId } : {}),
    ...(autor ? { autor } : {}),
  };
}

/** Orden alfabético de la v5.3 (`localeCompare`). */
export const porNombre = <T extends { nombre: string }>(a: T, b: T): number =>
  a.nombre.localeCompare(b.nombre);
