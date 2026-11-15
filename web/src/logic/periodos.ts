import { hoyLima, rangoDiasLima, type RangoFechas } from '@bodegon/core';

/**
 * Periodos del control único de Reportes (Hoy / 7 días / Mes / Rango), siempre en días de
 * Lima (RN-08), sin importar la zona del navegador. Funciones puras.
 */
export type Periodo = 'hoy' | '7dias' | 'mes' | 'rango';

export const PERIODOS: readonly { id: Periodo; etiqueta: string }[] = [
  { id: 'hoy', etiqueta: 'Hoy' },
  { id: '7dias', etiqueta: '7 días' },
  { id: 'mes', etiqueta: 'Mes' },
  { id: 'rango', etiqueta: 'Rango' },
];

export interface DiasPeriodo {
  desde: string;
  hasta: string;
}

const MS_DIA = 86_400_000;

/** "YYYY-MM-DD" ± n días (aritmética de calendario, sin zonas horarias). */
export function sumarDias(clave: string, dias: number): string {
  const [a, m, d] = clave.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_DIA).toISOString().slice(0, 10);
}

/** Días (inclusive) que cubre el periodo. `rango` usa las fechas elegidas tal cual. */
export function diasDelPeriodo(periodo: Periodo, ahora: Date, rango?: DiasPeriodo): DiasPeriodo {
  const hoy = hoyLima(ahora);
  switch (periodo) {
    case 'hoy':
      return { desde: hoy, hasta: hoy };
    case '7dias':
      return { desde: sumarDias(hoy, -6), hasta: hoy };
    case 'mes':
      return { desde: `${hoy.slice(0, 8)}01`, hasta: hoy };
    case 'rango':
      return rango ?? { desde: hoy, hasta: hoy };
  }
}

/** Rango de instantes del periodo (lanza ErrorDominio si el rango es inválido). */
export const rangoDelPeriodo = (periodo: Periodo, ahora: Date, rango?: DiasPeriodo): RangoFechas => {
  const d = diasDelPeriodo(periodo, ahora, rango);
  return rangoDiasLima(d.desde, d.hasta);
};

/** Todos los días del intervalo, para que las barras muestren también los días sin ventas. */
export function listaDias({ desde, hasta }: DiasPeriodo, maximo = 92): string[] {
  const dias: string[] = [];
  for (let d = desde; d <= hasta && dias.length < maximo; d = sumarDias(d, 1)) dias.push(d);
  return dias;
}

const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'setiembre', 'octubre', 'noviembre', 'diciembre',
];

const partes = (clave: string) => {
  const [a, m, d] = clave.split('-').map(Number) as [number, number, number];
  return { a, m, d, dow: new Date(Date.UTC(a, m - 1, d)).getUTCDay() };
};

/** "martes" para "2026-11-10". */
export const nombreDia = (clave: string): string => DIAS_SEMANA[partes(clave).dow] ?? '';

/** "Domingo 15 de noviembre". */
export function fechaLarga(clave: string): string {
  const { m, d } = partes(clave);
  const dia = nombreDia(clave);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${d} de ${MESES[m - 1] ?? ''}`;
}

/** Etiqueta corta de barra: "lun 9". */
export const etiquetaCorta = (clave: string): string => `${nombreDia(clave).slice(0, 3)} ${partes(clave).d}`;
