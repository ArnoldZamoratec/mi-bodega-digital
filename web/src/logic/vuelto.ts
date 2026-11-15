import { aCentimos, calcularVuelto, faltante, parsearSoles } from '@bodegon/core';

/** Atajos de billetes de la calculadora de vuelto (ux-web §3). */
export const BILLETES = [10, 20, 50, 100] as const;

export type EstadoPago =
  | { tipo: 'vacio' }
  | { tipo: 'invalido' }
  | { tipo: 'falta'; monto: number }
  | { tipo: 'vuelto'; monto: number };

/** "Paga con S/ 20 → Vuelto S/ 7.50". Reglas de dinero del core (céntimos exactos). */
export function estadoPago(total: number, recibido: string): EstadoPago {
  if (!recibido.trim()) return { tipo: 'vacio' };
  const monto = parsearSoles(recibido);
  if (!Number.isFinite(monto) || monto < 0) return { tipo: 'invalido' };
  const vuelto = calcularVuelto(total, monto);
  return vuelto === null ? { tipo: 'falta', monto: faltante(total, monto) } : { tipo: 'vuelto', monto: vuelto };
}

/** Cada billete y si alcanza para el total (los que no alcanzan se muestran deshabilitados). */
export const billetes = (total: number): { monto: number; alcanza: boolean }[] =>
  BILLETES.map((monto) => ({ monto, alcanza: aCentimos(monto) >= aCentimos(total) && total > 0 }));
