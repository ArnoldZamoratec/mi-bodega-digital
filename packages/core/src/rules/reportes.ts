import type { MovimientoFiado, Venta } from '../entities';
import { ErrorDominio } from '../errors';
import { idsAnulados, ventasVigentes } from './anulacion';
import { esItemLibre } from './carrito';
import { aCentimos, aSoles } from './dinero';

export interface RangoFechas {
  /** Inicio del día local (00:00:00.000). */
  inicio: Date;
  /** Fin del día local (23:59:59.999). */
  fin: Date;
}

/** RN-08: rango inclusivo por días locales; error si fin < inicio. */
export function crearRango(desde: Date, hasta: Date): RangoFechas {
  const inicio = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate(), 0, 0, 0, 0);
  const fin = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate(), 23, 59, 59, 999);
  if (fin.getTime() < inicio.getTime()) throw new ErrorDominio('RANGO_FECHAS_INVALIDO');
  return { inicio, fin };
}

/** Clave de día en hora **local** (corrige B-04: la web usaba UTC). */
export const claveDia = (fecha: Date): string =>
  `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`;

/**
 * D-26: máximo desfase aceptado entre la hora del teléfono (`creadaEn`) y la del servidor
 * (`fecha`). Las consultas por rango piden `fecha` hasta `fin + MARGEN` para traer las
 * ventas sin conexión que se sincronizaron después; más allá de este margen manda `fecha`.
 */
export const MARGEN_SINCRONIZACION_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Fecha con la que se agrupa por día (D-26): `creadaEn ?? fecha`, con dos resguardos para
 * que cada documento caiga en exactamente un día y siempre dentro de lo que se consulta:
 *  - `creadaEn` posterior a `fecha` (reloj del teléfono adelantado): manda `fecha`.
 *  - `creadaEn` anterior a `fecha - MARGEN` (reloj atrasado u outbox muy viejo): manda `fecha`.
 */
export function fechaEfectiva(d: { fecha: Date | null; creadaEn?: Date | null }): Date | null {
  const { fecha, creadaEn } = d;
  if (!creadaEn || Number.isNaN(creadaEn.getTime())) return fecha;
  if (!fecha) return creadaEn;
  const desfase = fecha.getTime() - creadaEn.getTime();
  return desfase >= 0 && desfase <= MARGEN_SINCRONIZACION_MS ? creadaEn : fecha;
}

/** Rango de `fecha` (servidor) que hay que consultar para cubrir `rango` por fecha efectiva. */
export const rangoConsulta = (rango: RangoFechas): RangoFechas => ({
  inicio: rango.inicio,
  fin: new Date(rango.fin.getTime() + MARGEN_SINCRONIZACION_MS),
});

/** ¿La fecha efectiva del documento cae en el rango? (filtro en memoria tras `rangoConsulta`). */
export function enRangoEfectivo(
  d: { fecha: Date | null; creadaEn?: Date | null },
  rango: RangoFechas,
): boolean {
  const f = fechaEfectiva(d);
  return f !== null && f.getTime() >= rango.inicio.getTime() && f.getTime() <= rango.fin.getTime();
}

export interface ResumenDia {
  /** Soles vendidos (todos los medios de pago, fiado incluido). */
  total: number;
  cantidad: number;
}

/**
 * Lo vendido en el rango sumando las ventas ya sincronizadas y las que esperan en el
 * teléfono (outbox). Una venta recién sincronizada puede estar un instante en ambas
 * listas: se cuenta una sola vez por id.
 */
export function resumenVentas(
  sincronizadas: readonly (Pick<Venta, 'id' | 'total' | 'anulaA' | 'creadaEn'> & {
    fecha?: Date | null;
  })[],
  pendientes: readonly {
    ventaId: string;
    creadaEn: number;
    venta: { total: number; anulaA?: string };
  }[],
  rango: RangoFechas,
): ResumenDia {
  const vistas = new Map<string, { id: string; anulaA?: string }>();
  let centimos = 0;
  for (const v of sincronizadas) {
    if (vistas.has(v.id)) continue;
    // La consulta trae `fecha` hasta fin + margen (D-26): aquí se filtra por fecha efectiva.
    const f = fechaEfectiva({ fecha: v.fecha ?? null, creadaEn: v.creadaEn });
    if (f && (f.getTime() < rango.inicio.getTime() || f.getTime() > rango.fin.getTime())) continue;
    vistas.set(v.id, { id: v.id, anulaA: v.anulaA });
    centimos += aCentimos(v.total);
  }
  for (const p of pendientes) {
    if (vistas.has(p.ventaId)) continue;
    if (p.creadaEn < rango.inicio.getTime() || p.creadaEn > rango.fin.getTime()) continue;
    vistas.set(p.ventaId, { id: p.ventaId, anulaA: p.venta.anulaA });
    centimos += aCentimos(p.venta.total);
  }
  // Los contraasientos ya restaron el monto; en la cantidad no cuentan ni ellos ni lo anulado.
  return { total: aSoles(centimos), cantidad: ventasVigentes([...vistas.values()]).length };
}

export interface ProductoVendido {
  nombre: string;
  cantidad: number;
}

export interface PuntoSerie {
  dia: string;
  ingresos: number;
}

export interface Reporte {
  /** Efectivo + Yape/Plin (ventas al contado + abonos de fiado). RN-06. */
  totalIngresos: number;
  totalEfectivo: number;
  totalYape: number;
  /** Ventas fiadas en el periodo (no son ingreso). */
  totalFiado: number;
  /** Abonos cobrados en el periodo (ya incluidos en efectivo/Yape). */
  totalAbonos: number;
  /** Solo ventas (sin abonos de fiado), por medio de pago: "cómo se vendió". */
  ventasEfectivo: number;
  ventasYape: number;
  /** Todo lo vendido en el periodo: contado + fiado (sin abonos). */
  totalVendido: number;
  cantidadVentas: number;
  ticketPromedio: number;
  topProductos: ProductoVendido[];
  serieDiaria: PuntoSerie[];
}

const enRango = (fecha: Date | null, rango: RangoFechas): fecha is Date =>
  fecha !== null &&
  fecha.getTime() >= rango.inicio.getTime() &&
  fecha.getTime() <= rango.fin.getTime();

/**
 * Port de `reports.js` con las mismas reglas de negocio:
 *  - Ventas Efectivo / Yape/Plin suman a su método y a la serie diaria.
 *  - Ventas Fiado solo suman a `totalFiado`.
 *  - Abonos (monto < 0) suman al método indicado y a la serie diaria.
 *  - Top 5 por unidades, agrupado por nombre, incluye ventas fiadas (RN-07).
 * Se agrupa por `fechaEfectiva` (D-26): una venta sin conexión cuenta el día en que se
 * cobró, no el día en que se sincronizó.
 * Diferencias intencionales: agrupación por día local (B-04) y los abonos sin método
 * conocido no se cuentan en ninguna parte (la web los sumaba a la serie pero no al total).
 */
export function generarReporte(
  ventas: readonly Venta[],
  movimientos: readonly MovimientoFiado[],
  rango: RangoFechas,
  limiteTop = 5,
): Reporte {
  let efectivo = 0;
  let yape = 0;
  let fiado = 0;
  let abonos = 0;
  let ventasEfectivo = 0;
  let ventasYape = 0;
  let cantidadVentas = 0;
  let ventasContado = 0;
  const unidades = new Map<string, number>();
  const porDia = new Map<string, number>();

  const sumarDia = (fecha: Date, centimos: number) => {
    const k = claveDia(fecha);
    porDia.set(k, (porDia.get(k) ?? 0) + centimos);
  };

  const delRango = ventas.flatMap((v) => {
    const f = fechaEfectiva(v);
    return enRango(f, rango) ? [{ ...v, fecha: f }] : [];
  });
  const idsDelRango = new Set(delRango.map((v) => v.id));
  const anuladas = idsAnulados(delRango);

  for (const v of delRango) {
    // Venta anulada y su contraasiento en el mismo rango: se cancelan, no cuentan nada.
    if (anuladas.has(v.id)) continue;
    if (v.anulaA && idsDelRango.has(v.anulaA)) continue;
    // Contraasiento de una venta de otro día: resta el monto (como en la web) pero no es
    // una venta ni mueve el top de productos.
    const esContraasiento = !!v.anulaA;
    if (!esContraasiento) cantidadVentas += 1;
    const c = aCentimos(v.total);
    if (v.metodoDePago === 'Efectivo') {
      efectivo += c;
      ventasEfectivo += c;
      ventasContado += c;
      sumarDia(v.fecha, c);
    } else if (v.metodoDePago === 'Yape/Plin') {
      yape += c;
      ventasYape += c;
      ventasContado += c;
      sumarDia(v.fecha, c);
    } else if (v.metodoDePago === 'Fiado') {
      fiado += c;
    }
    if (esContraasiento) continue;
    for (const item of v.items) {
      if (item.id && esItemLibre(item.id)) continue; // monto libre: no es un producto
      unidades.set(item.nombre, (unidades.get(item.nombre) ?? 0) + item.cantidad);
    }
  }

  for (const m of movimientos) {
    const f = fechaEfectiva(m);
    if (m.monto >= 0 || !enRango(f, rango)) continue;
    const c = Math.abs(aCentimos(m.monto));
    if (m.metodoPago === 'Efectivo') efectivo += c;
    else if (m.metodoPago === 'Yape/Plin') yape += c;
    else continue;
    abonos += c;
    sumarDia(f, c);
  }

  const topProductos = [...unidades.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limiteTop)
    .map(([nombre, cantidad]) => ({ nombre, cantidad }));

  const serieDiaria = [...porDia.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dia, c]) => ({ dia, ingresos: aSoles(c) }));

  return {
    totalIngresos: aSoles(efectivo + yape),
    totalEfectivo: aSoles(efectivo),
    totalYape: aSoles(yape),
    totalFiado: aSoles(fiado),
    totalAbonos: aSoles(abonos),
    ventasEfectivo: aSoles(ventasEfectivo),
    ventasYape: aSoles(ventasYape),
    totalVendido: aSoles(ventasContado + fiado),
    cantidadVentas,
    ticketPromedio:
      cantidadVentas === 0 ? 0 : aSoles(Math.round((ventasContado + fiado) / cantidadVentas)),
    topProductos,
    serieDiaria,
  };
}

/** Rangos rápidos para la UI. */
export function rangoPredefinido(
  tipo: 'hoy' | 'ayer' | 'semana' | 'mes',
  ahora: Date,
): RangoFechas {
  const d = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  switch (tipo) {
    case 'hoy':
      return crearRango(d, d);
    case 'ayer': {
      const ayer = new Date(d);
      ayer.setDate(d.getDate() - 1);
      return crearRango(ayer, ayer);
    }
    case 'semana': {
      const inicio = new Date(d);
      inicio.setDate(d.getDate() - 6);
      return crearRango(inicio, d);
    }
    case 'mes':
      return crearRango(new Date(d.getFullYear(), d.getMonth(), 1), d);
  }
}
