import { METODOS_PAGO_VENTA, type ItemVenta, type MetodoPagoVenta } from '../entities';
import { ErrorDominio } from '../errors';
import { esItemLibre, totalCarrito, type ItemCarrito } from './carrito';

/** Documento `ventas/{id}` listo para escribir (sin `fecha`, que pone el servidor). */
export interface VentaNueva {
  items: ItemVenta[];
  total: number;
  metodoDePago: MetodoPagoVenta;
  clienteId: string | null;
  /** Aditivo (móvil): presente solo en el contraasiento de una anulación (ver anulacion.ts). */
  anulaA?: string;
  motivoAnulacion?: string;
}

/** Documento `deudas/{id}` de un cargo generado por venta fiada (sin `fecha`). */
export interface CargoVentaNuevo {
  clienteId: string;
  monto: number;
  descripcion: string;
  ventaId: string;
  pagado: false;
}

export interface DeltaStock {
  productoId: string;
  /** Negativo: unidades a descontar. */
  delta: number;
}

/**
 * Operación atómica de venta. Es lo que se persiste en el outbox offline (D-05),
 * por eso solo contiene datos serializables.
 */
export interface OperacionVenta {
  ventaId: string;
  /** Solo si es Fiado. */
  cargoId: string | null;
  venta: VentaNueva;
  cargo: CargoVentaNuevo | null;
  deltasStock: DeltaStock[];
  /** Epoch ms en el dispositivo; para mostrar ventas pendientes. */
  creadaEn: number;
}

export interface DatosVenta {
  carrito: readonly ItemCarrito[];
  metodoDePago: MetodoPagoVenta;
  clienteId: string | null;
  ventaId: string;
  cargoId: string;
  ahora: number;
}

const LIMITE_DESCRIPCION = 100;

/** RN-05: "Arroz (x2), Azúcar (x1)", truncada a 97 caracteres + "..." */
export function describirCarrito(carrito: readonly ItemCarrito[]): string {
  const texto = carrito.map((i) => `${i.nombre} (x${i.cantidad})`).join(', ');
  return texto.length > LIMITE_DESCRIPCION ? `${texto.substring(0, 97)}...` : texto;
}

/**
 * Construye la operación de venta aplicando las reglas de la web:
 * RN-03 (descontar stock), RN-04 (fiado ⇒ cliente + cargo), RN-05 (descripción).
 */
export function armarOperacionVenta(datos: DatosVenta): OperacionVenta {
  const { carrito, metodoDePago, clienteId, ventaId, cargoId, ahora } = datos;

  if (carrito.length === 0) throw new ErrorDominio('CARRITO_VACIO');
  if (!METODOS_PAGO_VENTA.includes(metodoDePago)) throw new ErrorDominio('METODO_PAGO_INVALIDO');

  const esFiado = metodoDePago === 'Fiado';
  if (esFiado && !clienteId) throw new ErrorDominio('FIADO_SIN_CLIENTE');

  const total = totalCarrito(carrito);
  const items = carrito.map((i) => ({
    id: i.id,
    nombre: i.nombre,
    precio: i.precio,
    cantidad: i.cantidad,
  }));

  const deltasPorProducto = new Map<string, number>();
  for (const i of carrito) {
    if (esItemLibre(i.id)) continue; // monto libre: no es un producto
    deltasPorProducto.set(i.id, (deltasPorProducto.get(i.id) ?? 0) - i.cantidad);
  }

  return {
    ventaId,
    cargoId: esFiado ? cargoId : null,
    venta: {
      items,
      total,
      metodoDePago,
      clienteId: esFiado ? clienteId : null,
    },
    cargo:
      esFiado && clienteId
        ? {
            clienteId,
            monto: total,
            descripcion: describirCarrito(carrito),
            ventaId,
            pagado: false,
          }
        : null,
    deltasStock: [...deltasPorProducto.entries()].map(([productoId, delta]) => ({
      productoId,
      delta,
    })),
    creadaEn: ahora,
  };
}

/** Suma los deltas de stock de varias operaciones pendientes, por producto. */
export function deltasPendientes(operaciones: readonly OperacionVenta[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const op of operaciones) {
    for (const d of op.deltasStock) {
      deltas.set(d.productoId, (deltas.get(d.productoId) ?? 0) + d.delta);
    }
  }
  return deltas;
}
