import {
  aCentimos,
  aSoles,
  claveDiaLima,
  fechaEfectiva,
  formatearSoles,
  hoyLima,
  parsearSoles,
  rangoDiasLima,
  ZONA_NEGOCIO,
  type MovimientoFiado,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';
import {
  arqueo,
  cajaAbierta,
  historialCajas,
  resumenCaja,
  type Caja,
  type MovimientoCaja,
  type ResultadoArqueo,
  type ResumenCaja,
} from '@bodegon/core/rules/caja';

import { etiquetaCorta } from './periodos';

/**
 * Caja (D-28) en la web: solo presentación. Todo el cálculo (esperado, arqueo, validaciones)
 * sale del core (`resumenCaja`, `arqueo`, `armar*`); aquí se arma lo que necesita la vista.
 */

/** Lo que la web observa mientras hay una caja abierta (lo llena cajaVivo.ts). */
export interface CajaEnVivo {
  cajaId: string;
  /** `null` mientras llega el primer snapshot. */
  movimientos: MovimientoCaja[] | null;
  /** Ventas desde el día de la apertura hasta hoy; `null` mientras llegan. */
  ventas: Venta[] | null;
}

export interface EntradaCaja {
  cajas: readonly Caja[] | null;
  cajaVivo: CajaEnVivo | null;
  movimientos: readonly MovimientoFiado[] | null;
}

export interface VistaCaja {
  /** `true` mientras no llegan las cajas. */
  cargando: boolean;
  abierta: Caja | undefined;
  historial: Caja[];
  /** Movimientos manuales de la caja abierta, el más reciente primero. */
  movimientos: MovimientoCaja[];
  /** `null` mientras faltan datos para calcular el esperado. */
  resumen: ResumenCaja | null;
}

/**
 * Ventas a observar para la caja abierta: desde el día (Lima) de la apertura hasta hoy, porque
 * una sesión puede cruzar la medianoche. Con el reloj atrasado, solo el día de la apertura.
 */
export function rangoVentasCaja(caja: Caja, ahora: Date): RangoFechas {
  const inicio = fechaEfectiva(caja.apertura) ?? ahora;
  const desde = claveDiaLima(inicio);
  const hoy = hoyLima(ahora);
  return rangoDiasLima(desde, hoy < desde ? desde : hoy);
}

const tiempo = (m: MovimientoCaja): number => fechaEfectiva(m)?.getTime() ?? Number.MAX_SAFE_INTEGER;

/** Une cajas, movimientos y ventas en lo que pinta la pantalla. El esperado es del core. */
export function vistaCaja(e: EntradaCaja, ahora: Date): VistaCaja {
  const cajas = e.cajas ?? [];
  const abierta = cajaAbierta(cajas);
  const vivo = abierta && e.cajaVivo?.cajaId === abierta.id ? e.cajaVivo : null;
  const movimientos = [...(vivo?.movimientos ?? [])]
    .filter((m) => m.cajaId === abierta?.id)
    .sort((a, b) => tiempo(b) - tiempo(a) || b.id.localeCompare(a.id));
  const resumen =
    abierta && vivo?.movimientos && vivo.ventas && e.movimientos
      ? resumenCaja({
          caja: abierta,
          ventas: vivo.ventas,
          movimientosFiado: e.movimientos,
          movimientosCaja: vivo.movimientos,
          ahora,
        })
      : null;
  return {
    cargando: e.cajas === null,
    abierta,
    historial: historialCajas(cajas),
    movimientos,
    resumen,
  };
}

// ---------- Arqueo: textos tranquilos, sin acusar ----------

/** Un faltante de hasta S/ 1 suele ser sencillo o redondeo: no se pinta de ladrillo. */
export const TOLERANCIA_FALTANTE = 1;

export type TonoArqueo = 'cuadra' | 'sobrante' | 'faltante-leve' | 'faltante';

export interface MensajeArqueo {
  resultado: ResultadoArqueo;
  diferencia: number;
  tono: TonoArqueo;
  /** "Cuadra exacto", "Sobran S/ 2.00", "Faltan S/ 0.50". */
  titulo: string;
  detalle: string;
}

export function tonoArqueo(diferencia: number): TonoArqueo {
  const c = aCentimos(diferencia);
  if (c === 0) return 'cuadra';
  if (c > 0) return 'sobrante';
  return -c > aCentimos(TOLERANCIA_FALTANTE) ? 'faltante' : 'faltante-leve';
}

export function mensajeArqueo(contado: number, esperado: number): MensajeArqueo {
  const { diferencia, resultado } = arqueo(contado, esperado);
  const tono = tonoArqueo(diferencia);
  const monto = formatearSoles(Math.abs(diferencia));
  switch (tono) {
    case 'cuadra':
      return { resultado, diferencia, tono, titulo: 'Cuadra exacto', detalle: 'El efectivo coincide con lo que debería haber.' };
    case 'sobrante':
      return {
        resultado,
        diferencia,
        tono,
        titulo: `Sobran ${monto}`,
        detalle: 'Pasa cuando un vuelto quedó corto o una venta no se anotó. Puedes volver a contar antes de cerrar.',
      };
    case 'faltante-leve':
      return {
        resultado,
        diferencia,
        tono,
        titulo: `Faltan ${monto}`,
        detalle: 'Es una diferencia pequeña; suele ser sencillo o redondeo.',
      };
    case 'faltante':
      return {
        resultado,
        diferencia,
        tono,
        titulo: `Faltan ${monto}`,
        detalle:
          'Vale la pena contar otra vez y revisar si hubo un gasto sin anotar o un pago con Yape registrado como efectivo.',
      };
  }
}

/** Para el historial: "Cuadra", "Sobrante S/ 2.00", "Faltante S/ 0.50". */
export function textoDiferencia(diferencia: number): string {
  const c = aCentimos(diferencia);
  if (c === 0) return 'Cuadra';
  return `${c > 0 ? 'Sobrante' : 'Faltante'} ${formatearSoles(Math.abs(diferencia))}`;
}

// ---------- Fechas y textos ----------

const formatoHora = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: ZONA_NEGOCIO,
});

/** "8:05" en hora de Lima. */
export const horaLima = (f: Date): string => formatoHora.format(f).replace(/^0(\d)/, '$1');

/** "8:05" si es hoy; "ayer 20:10"; "vie 13 · 20:10" si es más antiguo. */
export function momentoCorto(f: Date, ahora: Date): string {
  const dia = claveDiaLima(f);
  const hoy = hoyLima(ahora);
  if (dia === hoy) return horaLima(f);
  const ayer = claveDiaLima(new Date(ahora.getTime() - 86_400_000));
  if (dia === ayer) return `ayer ${horaLima(f)}`;
  return `${etiquetaCorta(dia)} · ${horaLima(f)}`;
}

/** Línea de Hoy: "Caja abierta desde 8:05 · debería haber S/ 120.50". */
export function lineaHoyCaja(caja: Caja, resumen: ResumenCaja | null, ahora: Date): string {
  const inicio = fechaEfectiva(caja.apertura);
  const desde = inicio ? `Caja abierta desde ${momentoCorto(inicio, ahora)}` : 'Caja abierta';
  return resumen ? `${desde} · debería haber ${formatearSoles(resumen.esperado)}` : desde;
}

/** Fila del historial: "vie 13 · 8:05 a 21:30". */
export function periodoCaja(caja: Caja): string {
  const inicio = fechaEfectiva(caja.apertura);
  const fin = caja.cierre ? fechaEfectiva(caja.cierre) : null;
  if (!inicio) return 'Sin fecha';
  const dia = etiquetaCorta(claveDiaLima(inicio));
  if (!fin) return `${dia} · ${horaLima(inicio)}`;
  const mismoDia = claveDiaLima(fin) === claveDiaLima(inicio);
  return `${dia} · ${horaLima(inicio)} a ${mismoDia ? '' : `${etiquetaCorta(claveDiaLima(fin))} `}${horaLima(fin)}`;
}

// ---------- Montos escritos ----------

/** Atajos para el monto inicial (ux-web §3, como la calculadora de vuelto). */
export const ATAJOS_APERTURA = [20, 50, 100, 200] as const;

/** Texto → soles. Vacío = 0 solo si se permite (monto inicial). NaN si no es un monto. */
export function leerMonto(texto: string, vacioEsCero = false): number {
  if (!texto.trim()) return vacioEsCero ? 0 : Number.NaN;
  return parsearSoles(texto.replace(/^\s*S\/\s*/i, ''));
}

// ---------- Ayuda para contar billetes y monedas ----------

/** Billetes y monedas en circulación en Perú, de mayor a menor. */
export const DENOMINACIONES = [200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1] as const;

export const etiquetaDenominacion = (d: number): string =>
  d >= 1 ? `S/ ${d}` : `${Math.round(d * 100)} cént.`;

/** Suma del conteo (cantidad por denominación) en céntimos exactos; ignora cantidades no válidas. */
export function totalConteo(cantidades: Readonly<Record<string, number>>): number {
  let c = 0;
  for (const d of DENOMINACIONES) {
    const n = cantidades[String(d)] ?? 0;
    if (!Number.isInteger(n) || n <= 0) continue;
    c += aCentimos(d) * n;
  }
  return aSoles(c);
}
