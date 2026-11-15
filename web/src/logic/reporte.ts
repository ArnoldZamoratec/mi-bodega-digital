import {
  claveDiaLima,
  generarReporte,
  type MovimientoFiado,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';

import { listaDias, type DiasPeriodo } from './periodos';

export interface TotalesReporte {
  totalGeneral: number;
  totalEfectivo: number;
  totalYape: number;
  totalFiado: number;
  totalAbonos: number;
  cantidadVentas: number;
  top5Products: [string, number][];
  chartLabels: string[];
  chartData: number[];
}

/**
 * Totales de Reportes calculados por el core (los mismos que la app móvil): céntimos, fecha
 * efectiva `creadaEn ?? fecha` (D-26), día de Lima, anulaciones, monto libre fuera del top y
 * abonos por su método de pago (RN-06/07).
 */
export function calcularTotales(
  ventas: readonly Venta[],
  movimientos: readonly MovimientoFiado[],
  rango: RangoFechas,
): TotalesReporte {
  const r = generarReporte(ventas, movimientos, rango, 5, claveDiaLima);
  return {
    totalGeneral: r.totalIngresos,
    totalEfectivo: r.totalEfectivo,
    totalYape: r.totalYape,
    totalFiado: r.totalFiado,
    totalAbonos: r.totalAbonos,
    cantidadVentas: r.cantidadVentas,
    top5Products: r.topProductos.map((p) => [p.nombre, p.cantidad]),
    chartLabels: r.serieDiaria.map((p) => p.dia),
    chartData: r.serieDiaria.map((p) => p.ingresos),
  };
}

/** Serie con TODOS los días del periodo (los días sin ventas van en 0, no desaparecen). */
export function serieCompleta(t: TotalesReporte, dias: DiasPeriodo): { dia: string; ingresos: number }[] {
  const porDia = new Map(t.chartLabels.map((d, i) => [d, t.chartData[i] ?? 0]));
  return listaDias(dias).map((dia) => ({ dia, ingresos: porDia.get(dia) ?? 0 }));
}

/** Ancho relativo (0–100) de cada barra del top de productos. */
export const anchosTop = (top: readonly [string, number][]): number[] => {
  const max = Math.max(0, ...top.map(([, c]) => c));
  return top.map(([, c]) => (max > 0 && c > 0 ? Math.max(4, Math.round((c / max) * 100)) : 0));
};
