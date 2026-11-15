import type { MetodoPagoVenta } from '../entities';
import type { ColaVentas, RepositorioVentas } from '../ports';
import type { ItemCarrito } from '../rules/carrito';
import { armarOperacionVenta, type OperacionVenta } from '../rules/venta';
import type { SincronizadorVentas } from './sincronizarVentas';

export interface DependenciasVenta {
  ventas: RepositorioVentas;
  cola: ColaVentas;
  sincronizador: SincronizadorVentas;
  enLinea: () => boolean;
  ahora?: () => number;
}

export interface ResultadoVenta {
  operacion: OperacionVenta;
  /** 'sincronizada' = ya está en Firestore. 'pendiente' = guardada en el teléfono. */
  estado: 'sincronizada' | 'pendiente';
}

/**
 * Registra una venta "outbox-first": primero se guarda en el teléfono (nunca se pierde),
 * luego se intenta confirmar en Firestore si hay red.
 */
export async function registrarVenta(
  deps: DependenciasVenta,
  datos: {
    carrito: readonly ItemCarrito[];
    metodoDePago: MetodoPagoVenta;
    clienteId: string | null;
  },
): Promise<ResultadoVenta> {
  const operacion = armarOperacionVenta({
    ...datos,
    ventaId: deps.ventas.nuevoId(),
    cargoId: deps.ventas.nuevoIdCargo(),
    ahora: (deps.ahora ?? Date.now)(),
  });

  await deps.cola.agregar(operacion);

  if (!deps.enLinea()) return { operacion, estado: 'pendiente' };

  await deps.sincronizador.sincronizar();
  const sigue = (await deps.cola.listar()).some((e) => e.operacion.ventaId === operacion.ventaId);
  return { operacion, estado: sigue ? 'pendiente' : 'sincronizada' };
}
