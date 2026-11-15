import {
  CONFIG_NEGOCIO_POR_DEFECTO,
  METODOS_PAGO_ABONO,
  METODOS_PAGO_VENTA,
  type Cliente,
  type ConfigNegocio,
  type ItemVenta,
  type MetodoPagoAbono,
  type MetodoPagoVenta,
  type MovimientoFiado,
  type Producto,
  type Venta,
} from '@/domain/entities';

/**
 * Conversión Firestore → dominio. Funciones puras y **tolerantes**: los documentos
 * existentes fueron escritos por la web sin validación (precio como string, stock
 * ausente, fecha null mientras el serverTimestamp está pendiente…).
 */

type Datos = Record<string, unknown>;

const texto = (v: unknown, porDefecto = ''): string =>
  typeof v === 'string' ? v : typeof v === 'number' ? String(v) : porDefecto;

const numero = (v: unknown, porDefecto = 0): number => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : porDefecto;
};

const numeroONulo = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = numero(v, Number.NaN);
  return Number.isFinite(n) ? n : null;
};

/** Acepta Timestamp de Firestore (duck typing), Date o epoch ms. */
export const fecha = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === 'number') return new Date(v);
  if (v && typeof v === 'object' && 'toDate' in v && typeof v.toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
};

/** `creadaEn` (D-26) solo se agrega si es una fecha válida: documentos web no lo tienen. */
const conCreadaEn = (v: unknown): { creadaEn?: Date } => {
  const f = fecha(v);
  return f && !Number.isNaN(f.getTime()) ? { creadaEn: f } : {};
};

const metodoVenta = (v: unknown): MetodoPagoVenta =>
  METODOS_PAGO_VENTA.includes(v as MetodoPagoVenta) ? (v as MetodoPagoVenta) : 'Efectivo';

const metodoAbono = (v: unknown): MetodoPagoAbono | undefined =>
  METODOS_PAGO_ABONO.includes(v as MetodoPagoAbono) ? (v as MetodoPagoAbono) : undefined;

export function aProducto(id: string, d: Datos): Producto {
  const codigo = texto(d.codigoBarras).trim();
  return {
    id,
    nombre: texto(d.nombre, '(sin nombre)'),
    precio: numero(d.precio),
    stock: numeroONulo(d.stock),
    ...(codigo ? { codigoBarras: codigo } : {}),
  };
}

export function aCliente(id: string, d: Datos): Cliente {
  const recordatorio = fecha(d.ultimoRecordatorio);
  return {
    id,
    nombre: texto(d.nombre, '(sin nombre)'),
    telefono: texto(d.telefono),
    // Aditivo (D-27): solo si es una fecha válida.
    ...(recordatorio && !Number.isNaN(recordatorio.getTime())
      ? { ultimoRecordatorio: recordatorio }
      : {}),
  };
}

/** La caché local guarda JSON: las fechas vuelven como texto y se reconstruyen aquí. */
export function revivirCliente(c: Cliente): Cliente {
  const crudo: unknown = c.ultimoRecordatorio;
  if (crudo === undefined || crudo instanceof Date) return c;
  const f = typeof crudo === 'string' || typeof crudo === 'number' ? new Date(crudo) : null;
  const { ultimoRecordatorio: _omitido, ...resto } = c;
  return f && !Number.isNaN(f.getTime()) ? { ...resto, ultimoRecordatorio: f } : resto;
}

function aItem(v: unknown): ItemVenta | null {
  if (!v || typeof v !== 'object') return null;
  const d = v as Datos;
  return {
    id: texto(d.id),
    nombre: texto(d.nombre, '(sin nombre)'),
    precio: numero(d.precio),
    cantidad: numero(d.cantidad),
  };
}

export function aVenta(id: string, d: Datos): Venta {
  const items = Array.isArray(d.items)
    ? d.items.map(aItem).filter((i): i is ItemVenta => i !== null)
    : [];
  return {
    id,
    items,
    total: numero(d.total),
    metodoDePago: metodoVenta(d.metodoDePago),
    clienteId: typeof d.clienteId === 'string' && d.clienteId ? d.clienteId : null,
    fecha: fecha(d.fecha),
    ...conCreadaEn(d.creadaEn),
    ...(typeof d.anulaA === 'string' && d.anulaA ? { anulaA: d.anulaA } : {}),
    ...(typeof d.motivoAnulacion === 'string' ? { motivoAnulacion: d.motivoAnulacion } : {}),
  };
}

export function aMovimiento(id: string, d: Datos): MovimientoFiado {
  const metodoPago = metodoAbono(d.metodoPago);
  return {
    id,
    clienteId: texto(d.clienteId),
    monto: numero(d.monto),
    descripcion: texto(d.descripcion),
    fecha: fecha(d.fecha),
    ...conCreadaEn(d.creadaEn),
    pagado: d.pagado === true,
    ...(typeof d.ventaId === 'string' ? { ventaId: d.ventaId } : {}),
    ...(metodoPago ? { metodoPago } : {}),
    ...(typeof d.deudaOrigenId === 'string' ? { deudaOrigenId: d.deudaOrigenId } : {}),
  };
}

export function aConfig(d: Datos | undefined): ConfigNegocio {
  if (!d) return CONFIG_NEGOCIO_POR_DEFECTO;
  const base = CONFIG_NEGOCIO_POR_DEFECTO;
  const hora = numeroONulo(d.horaRecordatorioFiado);
  return {
    nombre: texto(d.nombre, base.nombre) || base.nombre,
    ruc: texto(d.ruc),
    direccion: texto(d.direccion),
    telefono: texto(d.telefono),
    diasVencimientoFiado: Math.max(
      1,
      Math.round(numero(d.diasVencimientoFiado, base.diasVencimientoFiado)),
    ),
    horaRecordatorioFiado:
      d.horaRecordatorioFiado === null
        ? null
        : hora !== null && hora >= 0 && hora <= 23
          ? hora
          : base.horaRecordatorioFiado,
    alertasStockBajo:
      typeof d.alertasStockBajo === 'boolean' ? d.alertasStockBajo : base.alertasStockBajo,
  };
}

/** Dominio → Firestore para productos: `codigoBarras` solo se escribe si existe. */
export function deProducto(p: Omit<Producto, 'id'>): Datos {
  return {
    nombre: p.nombre,
    precio: p.precio,
    stock: p.stock,
    ...(p.codigoBarras ? { codigoBarras: p.codigoBarras } : {}),
  };
}
