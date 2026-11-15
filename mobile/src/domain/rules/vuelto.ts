import { aCentimos, aSoles } from './dinero';

/** Billetes de sol en circulación con los que suele pagar el cliente. */
const BILLETES_CENTIMOS = [1000, 2000, 5000, 10000, 20000];

/**
 * Montos con los que probablemente paga el cliente, de menor a mayor (máx. 4):
 * el sol entero siguiente si hay céntimos, el siguiente múltiplo de 5 y de 10, y los
 * billetes que alcanzan a cubrir el total. Ej.: S/ 7.50 → 8, 10, 20, 50.
 */
export function montosSugeridos(total: number): number[] {
  const c = aCentimos(total);
  if (c <= 0) return [];
  const opciones = new Set<number>();
  if (c % 100 !== 0) opciones.add(Math.ceil(c / 100) * 100);
  for (const multiplo of [500, 1000]) {
    const redondeado = Math.ceil(c / multiplo) * multiplo;
    if (redondeado > c) opciones.add(redondeado);
  }
  for (const b of BILLETES_CENTIMOS) if (b > c) opciones.add(b);
  return [...opciones]
    .sort((a, b) => a - b)
    .slice(0, 4)
    .map(aSoles);
}

/** Vuelto a entregar; `null` si lo recibido no alcanza para el total. */
export function calcularVuelto(total: number, recibido: number): number | null {
  const diferencia = aCentimos(recibido) - aCentimos(total);
  return diferencia >= 0 ? aSoles(diferencia) : null;
}

/** Lo que falta cuando el cliente entrega menos que el total (0 si alcanza). */
export function faltante(total: number, recibido: number): number {
  return aSoles(Math.max(0, aCentimos(total) - aCentimos(recibido)));
}
