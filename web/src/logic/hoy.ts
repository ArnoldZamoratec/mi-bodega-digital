import {
  claveDiaLima,
  formatearSoles,
  generarReporte,
  hoyLima,
  rangoDiasLima,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';

import { nombreDia, sumarDias } from './periodos';

const SEMANA_MS = 7 * 86_400_000;

export interface ResumenHoy {
  /** Lo vendido hoy (contado + fiado), en soles. */
  hoy: number;
  ventasHoy: number;
  /** Lo vendido el mismo día de la semana pasada HASTA LA MISMA HORA (comparación justa). */
  semanaPasada: number;
  /** Variación en % redondeada, o null si la semana pasada no hubo ventas a esta hora. */
  variacion: number | null;
  /** "martes" */
  dia: string;
}

/** Rango que hay que observar para el resumen: desde el mismo día de la semana pasada hasta hoy. */
export function rangoResumenHoy(ahora: Date): RangoFechas {
  const hoy = hoyLima(ahora);
  return rangoDiasLima(sumarDias(hoy, -7), hoy);
}

export function resumenHoy(ventas: readonly Venta[], ahora: Date): ResumenHoy {
  const hoy = hoyLima(ahora);
  const antes = sumarDias(hoy, -7);
  const rHoy = generarReporte(ventas, [], rangoDiasLima(hoy, hoy), 5, claveDiaLima);
  const rAntes = generarReporte(
    ventas,
    [],
    { inicio: rangoDiasLima(antes, antes).inicio, fin: new Date(ahora.getTime() - SEMANA_MS) },
    5,
    claveDiaLima,
  );
  const semanaPasada = rAntes.totalVendido;
  return {
    hoy: rHoy.totalVendido,
    ventasHoy: rHoy.cantidadVentas,
    semanaPasada,
    variacion:
      semanaPasada > 0 ? Math.round(((rHoy.totalVendido - semanaPasada) / semanaPasada) * 100) : null,
    dia: nombreDia(hoy),
  };
}

/** Frase de comparación, sin juicio ni urgencia: solo el dato. */
export function fraseComparacion(r: ResumenHoy): string {
  const antes = formatearSoles(r.semanaPasada);
  if (r.variacion === null) {
    return r.hoy === 0
      ? 'Todavía no registras ventas hoy.'
      : `El ${r.dia} pasado a esta hora aún no tenías ventas.`;
  }
  if (r.variacion > 0) return `${r.variacion} % más que el ${r.dia} pasado a esta hora (${antes}).`;
  if (r.variacion < 0)
    return `${Math.abs(r.variacion)} % menos que el ${r.dia} pasado a esta hora (${antes}).`;
  return `Igual que el ${r.dia} pasado a esta hora (${antes}).`;
}
