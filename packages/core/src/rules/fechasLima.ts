import { ErrorDominio } from '../errors';
import type { RangoFechas } from './reportes';

/**
 * Fechas en la zona del negocio (America/Lima, UTC−5 sin horario de verano), sin depender de
 * la zona del navegador o del teléfono. La web las usa para el selector de reportes y para
 * agrupar por día; la app móvil agrupa por la hora local del teléfono, que en Perú coincide.
 */
export const ZONA_NEGOCIO = 'America/Lima';

const formatoDia = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA_NEGOCIO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" del instante dado en hora de Lima. */
export const claveDiaLima = (fecha: Date): string => formatoDia.format(fecha);

/** Hoy en Lima como "YYYY-MM-DD" (valor de un `<input type="date">`). */
export const hoyLima = (ahora: Date = new Date()): string => claveDiaLima(ahora);

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * RN-08 en hora de Lima: [desde 00:00:00.000, hasta 23:59:59.999] a partir de dos valores
 * "YYYY-MM-DD". Error de dominio si el formato no es válido o si fin < inicio.
 */
export function rangoDiasLima(desde: string, hasta: string): RangoFechas {
  if (!DIA.test(desde) || !DIA.test(hasta)) throw new ErrorDominio('RANGO_FECHAS_INVALIDO');
  const inicio = new Date(`${desde}T00:00:00.000-05:00`);
  const fin = new Date(`${hasta}T23:59:59.999-05:00`);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fin.getTime())) {
    throw new ErrorDominio('RANGO_FECHAS_INVALIDO');
  }
  if (fin.getTime() < inicio.getTime()) throw new ErrorDominio('RANGO_FECHAS_INVALIDO');
  return { inicio, fin };
}
