import {
  enRangoEfectivo,
  unirPorId,
  type MovimientoFiado,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';

/**
 * D-32: une lo que trajeron las consultas por `fecha` y por `creadaEn` (una por campo de
 * `CAMPOS_CONSULTA_RANGO`): un documento por id y solo los de fecha efectiva en el rango.
 * Así una venta cobrada sin conexión hace semanas aparece en su día y no en el de hoy.
 */
export function unirConsultasRango<V extends Venta, M extends MovimientoFiado>(
  ventasPorConsulta: readonly (readonly V[])[],
  movimientosPorConsulta: readonly (readonly M[])[],
  rango: RangoFechas,
): { ventas: V[]; movimientos: M[] } {
  return {
    ventas: unirPorId(...ventasPorConsulta).filter((v) => enRangoEfectivo(v, rango)),
    movimientos: unirPorId(...movimientosPorConsulta).filter((m) => enRangoEfectivo(m, rango)),
  };
}
