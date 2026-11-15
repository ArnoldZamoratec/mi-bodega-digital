/**
 * Entidades del dominio. Reflejan 1:1 los documentos Firestore existentes de la web
 * (ver ARCHITECTURE.md §2). Los campos marcados como "aditivo" no existen en la web.
 */

/** Literales exactos usados por la web en `ventas.metodoDePago`. */
export const METODOS_PAGO_VENTA = ['Efectivo', 'Yape/Plin', 'Fiado'] as const;
export type MetodoPagoVenta = (typeof METODOS_PAGO_VENTA)[number];

/** Literales exactos usados por la web en `deudas.metodoPago` (abonos). */
export const METODOS_PAGO_ABONO = ['Efectivo', 'Yape/Plin'] as const;
export type MetodoPagoAbono = (typeof METODOS_PAGO_ABONO)[number];

export interface Producto {
  id: string;
  nombre: string;
  /** Soles. */
  precio: number;
  /** `null` = stock no controlado. Puede ser negativo (comportamiento heredado). */
  stock: number | null;
  /** Aditivo (móvil). */
  codigoBarras?: string;
}

export type ProductoDatos = Omit<Producto, 'id'>;

export interface Cliente {
  id: string;
  nombre: string;
  telefono: string;
  /** Aditivo (móvil, D-27): último recordatorio de cobro enviado por WhatsApp. */
  ultimoRecordatorio?: Date;
}

export type ClienteDatos = Omit<Cliente, 'id' | 'ultimoRecordatorio'>;

export interface ItemVenta {
  id: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface Venta {
  id: string;
  items: ItemVenta[];
  total: number;
  metodoDePago: MetodoPagoVenta;
  clienteId: string | null;
  /** `null` mientras el serverTimestamp está pendiente. */
  fecha: Date | null;
  /**
   * Aditivo (móvil, D-26): hora del teléfono al cobrar. Una venta sin conexión se
   * sincroniza después y `fecha` (hora del servidor) cae en otro día; los reportes usan
   * `fechaEfectiva` (rules/reportes.ts). Ausente en ventas de la web y antiguas.
   */
  creadaEn?: Date;
  /**
   * Aditivo (móvil). Si existe, este documento es el CONTRAASIENTO de la venta indicada:
   * mismos ítems con cantidad negativa y total negativo. La web, que solo suma totales,
   * descuenta la anulación sin conocer este campo.
   */
  anulaA?: string;
  motivoAnulacion?: string;
}

/**
 * Movimiento del libro de fiado (colección `deudas`).
 * monto > 0 ⇒ cargo (deuda). monto < 0 ⇒ abono (pago).
 */
export interface MovimientoFiado {
  id: string;
  clienteId: string;
  monto: number;
  descripcion: string;
  fecha: Date | null;
  /** Aditivo (móvil, D-26): hora del teléfono al registrarlo (ver `Venta.creadaEn`). */
  creadaEn?: Date;
  pagado: boolean;
  ventaId?: string;
  metodoPago?: MetodoPagoAbono;
  /** Aditivo (móvil): cargo al que se imputó el abono al registrarlo. */
  deudaOrigenId?: string;
  /** Solo en memoria: guardado en el teléfono, aún no confirmado en Firestore (D-24). */
  pendiente?: boolean;
}

export interface ConfigNegocio {
  nombre: string;
  ruc: string;
  direccion: string;
  telefono: string;
  /** Días tras los cuales un cargo pendiente se considera vencido (S-03). */
  diasVencimientoFiado: number;
  /** Hora local (0-23) del recordatorio diario de fiados vencidos; null = desactivado. */
  horaRecordatorioFiado: number | null;
  /** Avisar cuando un producto cae a stock bajo. */
  alertasStockBajo: boolean;
}

export const CONFIG_NEGOCIO_POR_DEFECTO: ConfigNegocio = {
  nombre: 'Mi Bodega',
  ruc: '',
  direccion: '',
  telefono: '',
  diasVencimientoFiado: 30,
  horaRecordatorioFiado: 9,
  alertasStockBajo: true,
};

export type Rol = 'dueno';

export interface Usuario {
  uid: string;
  email: string | null;
  rol: Rol;
}
