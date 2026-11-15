import type {
  AbonoNuevo,
  CargoNuevo,
  Cliente,
  MovimientoFiado,
  OperacionVenta,
  Producto,
  RangoFechas,
  Venta,
} from '@bodegon/core';

import type { Cancelar } from './listeners';

/**
 * Estado en memoria que comparten las vistas. `null` = aún cargando (las vistas muestran
 * esqueletos con la forma real). Lo llena la fuente de datos (Firestore o, solo en
 * desarrollo, la demo en memoria).
 */
export interface EstadoDatos {
  productos: Producto[] | null;
  clientes: Cliente[] | null;
  movimientos: MovimientoFiado[] | null;
  nombreBodega: string | null;
  email: string | null;
}

const vacio = (): EstadoDatos => ({
  productos: null,
  clientes: null,
  movimientos: null,
  nombreBodega: null,
  email: null,
});

let estado: EstadoDatos = vacio();
const oyentes = new Set<(e: EstadoDatos) => void>();

export const datos = (): EstadoDatos => estado;

export function actualizarDatos(parcial: Partial<EstadoDatos>): void {
  estado = { ...estado, ...parcial };
  for (const fn of oyentes) fn(estado);
}

export function suscribirDatos(fn: (e: EstadoDatos) => void): () => void {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

/** Logout: nada del usuario anterior queda en memoria (los oyentes de las vistas siguen). */
export function reiniciarDatos(): void {
  estado = vacio();
  for (const fn of oyentes) fn(estado);
}

export interface DatosProducto {
  nombre: string;
  precio: number;
  stock: number | null;
}

/**
 * Operaciones de escritura y consultas por rango. Implementación real: fuenteFirestore.ts
 * (mismas rutas, campos y transacciones de siempre). La demo de desarrollo implementa la
 * misma interfaz en memoria.
 */
export interface FuenteDatos {
  nuevoIdVenta(): string;
  nuevoIdCargo(): string;
  /** Venta + cargo fiado + stock en UNA transacción (B-03). */
  cobrar(op: OperacionVenta): Promise<void>;
  /** Contraasiento `{id}-anulada` (core armarAnulacion) + stock devuelto + cargo borrado. */
  deshacerVenta(op: OperacionVenta): Promise<void>;
  guardarProducto(id: string | null, p: DatosProducto): Promise<void>;
  eliminarProducto(id: string): Promise<void>;
  ajustarStock(id: string, delta: number): Promise<void>;
  /** Devuelve el id (nuevo o el mismo). */
  guardarCliente(id: string | null, c: { nombre: string; telefono: string }): Promise<string>;
  registrarMovimiento(m: CargoNuevo | AbonoNuevo): Promise<void>;
  eliminarMovimiento(id: string): Promise<void>;
  /** `ultimoRecordatorio` = ahora (D-27). */
  marcarRecordatorio(clienteId: string): Promise<void>;
  observarRango(
    rango: RangoFechas,
    onDatos: (ventas: Venta[], movimientos: MovimientoFiado[]) => void,
    onError: (mensaje: string) => void,
  ): Cancelar;
  cerrarSesion(): Promise<void>;
}

let fuenteActual: FuenteDatos | null = null;

export const usarFuente = (f: FuenteDatos | null): void => {
  fuenteActual = f;
};

export function fuente(): FuenteDatos {
  if (!fuenteActual) throw new Error('Sin sesión');
  return fuenteActual;
}
