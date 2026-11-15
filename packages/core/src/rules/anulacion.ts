import type { Venta } from '../entities';
import { ErrorDominio } from '../errors';
import { esItemLibre } from './carrito';
import { aCentimos, aSoles } from './dinero';
import type { OperacionVenta } from './venta';

/**
 * Anulación de ventas por CONTRAASIENTO (nota de crédito), no por borrado:
 *  - las ventas son un registro histórico inmutable (reglas D-12: solo `create`);
 *  - la web comparte la base y solo suma `total`: un contraasiento negativo la mantiene
 *    cuadrada sin que conozca el concepto de "anulada".
 * El id del contraasiento es fijo por venta, así una venta no se puede anular dos veces
 * (la escritura es idempotente igual que la de una venta).
 */

export const MOTIVOS_ANULACION = [
  'Cobro equivocado',
  'El cliente devolvió',
  'Producto o cantidad equivocada',
  'Otro',
] as const;
export type MotivoAnulacion = (typeof MOTIVOS_ANULACION)[number] | 'Deshecha al momento';

export const idAnulacion = (ventaId: string): string => `${ventaId}-anulada`;

export const esAnulacion = (v: Pick<Venta, 'anulaA'>): boolean => !!v.anulaA;

/** Ids de las ventas que tienen contraasiento en la lista dada. */
export function idsAnulados(ventas: readonly Pick<Venta, 'anulaA'>[]): Set<string> {
  const ids = new Set<string>();
  for (const v of ventas) if (v.anulaA) ids.add(v.anulaA);
  return ids;
}

/**
 * Operación que anula `venta`: mismos ítems con cantidad negativa, total negativo,
 * mismo medio de pago y cliente, y el stock devuelto (delta positivo por producto).
 * El cargo de fiado de la venta original lo elimina el repositorio en la misma transacción.
 */
export function armarAnulacion(
  venta: Venta,
  motivo: MotivoAnulacion,
  ahora: number,
): OperacionVenta {
  if (esAnulacion(venta)) throw new ErrorDominio('NO_SE_ANULA_ANULACION');

  const devoluciones = new Map<string, number>();
  for (const i of venta.items) {
    if (i.id && !esItemLibre(i.id))
      devoluciones.set(i.id, (devoluciones.get(i.id) ?? 0) + i.cantidad);
  }

  return {
    ventaId: idAnulacion(venta.id),
    cargoId: null,
    venta: {
      items: venta.items.map((i) => ({ ...i, cantidad: -i.cantidad })),
      total: aSoles(-aCentimos(venta.total)),
      metodoDePago: venta.metodoDePago,
      clienteId: venta.clienteId,
      anulaA: venta.id,
      motivoAnulacion: motivo,
    },
    cargo: null,
    deltasStock: [...devoluciones.entries()]
      .filter(([, cantidad]) => cantidad > 0)
      .map(([productoId, cantidad]) => ({ productoId, delta: cantidad })),
    creadaEn: ahora,
  };
}

/**
 * Ventas que cuentan para métricas de cantidad (n.º de ventas, ticket promedio): se
 * excluyen el contraasiento y la venta anulada cuando ambos están en la lista.
 * Un contraasiento cuya venta original quedó fuera del rango (anulada otro día) sí resta
 * en los montos, igual que en la web, pero no cuenta como venta.
 */
export function ventasVigentes<T extends Pick<Venta, 'id' | 'anulaA'>>(ventas: readonly T[]): T[] {
  const anuladas = idsAnulados(ventas);
  return ventas.filter((v) => !v.anulaA && !anuladas.has(v.id));
}
