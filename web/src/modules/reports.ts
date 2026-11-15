import {
  claveDiaLima,
  ErrorDominio,
  generarReporte,
  rangoConsulta,
  rangoDiasLima,
  type MovimientoFiado,
  type RangoFechas,
  type Venta,
} from '@bodegon/core';
import { onSnapshot, query, Timestamp, where } from 'firebase/firestore';

import { registrarListener, type Cancelar } from '../listeners';
import { aMovimiento, aVenta } from '../mappers';
import { getDeudasCol, getVentasCol } from '../store';
import { showToast, updateReporteUI, type TotalesReporte } from '../ui';

const valorFecha = (id: string): string =>
  (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

/** Lee las fechas del DOM (días de Lima) y carga el reporte en tiempo real. */
export function loadReporteDelDia(): void {
  const inicio = valorFecha('reporte-fecha-inicio');
  const fin = valorFecha('reporte-fecha-fin');
  if (!inicio || !fin) return; // normal al cargar la app

  let rango: RangoFechas;
  try {
    // Rango en hora de Perú (UTC−5), sin importar la zona del navegador (RN-08).
    rango = rangoDiasLima(inicio, fin);
  } catch (error) {
    showToast(
      error instanceof ErrorDominio ? error.message : 'Error al cargar el reporte',
      true,
    );
    return;
  }
  loadReporte(rango);
}

export const handleReporteDateChange = (): void => loadReporteDelDia();
export const handleReporteRefreshClick = (): void => loadReporteDelDia();

/**
 * Totales que muestra la pestaña Reportes, calculados por el core (los mismos que la app
 * móvil): céntimos, fecha efectiva `creadaEn ?? fecha` con resguardos (D-26), día de Lima,
 * anulaciones, monto libre fuera del top, abonos por su método de pago (RN-06/07).
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
    top5Products: r.topProductos.map((p) => [p.nombre, p.cantidad]),
    chartLabels: r.serieDiaria.map((p) => p.dia),
    chartData: r.serieDiaria.map((p) => p.ingresos),
  };
}

let cancelarVentas: Cancelar | null = null;
let cancelarDeudas: Cancelar | null = null;

function cerrarListeners(): void {
  cancelarVentas?.();
  cancelarDeudas?.();
  cancelarVentas = null;
  cancelarDeudas = null;
}

function loadReporte(rango: RangoFechas): void {
  cerrarListeners();

  // D-26: se consulta por `fecha` (índice simple) hasta fin + margen, para traer las ventas
  // cobradas sin conexión que se sincronizaron después; el core filtra por fecha efectiva.
  const consulta = rangoConsulta(rango);
  const desde = Timestamp.fromDate(consulta.inicio);
  const hasta = Timestamp.fromDate(consulta.fin);

  let ventas: Venta[] = [];
  let movimientos: MovimientoFiado[] = [];
  const recalcular = () => updateReporteUI(calcularTotales(ventas, movimientos, rango));

  try {
    const qVentas = query(getVentasCol(), where('fecha', '>=', desde), where('fecha', '<=', hasta));
    // B-06: sin filtro monto<0 (requeriría índice compuesto); el core filtra en memoria.
    const qDeudas = query(getDeudasCol(), where('fecha', '>=', desde), where('fecha', '<=', hasta));

    cancelarVentas = registrarListener(
      onSnapshot(
        qVentas,
        (snapshot) => {
          ventas = snapshot.docs.map((d) => aVenta(d.id, d.data({ serverTimestamps: 'estimate' })));
          recalcular();
        },
        (error) => {
          console.error('Error en listener de ventas:', error);
          showToast('Error al cargar ventas en tiempo real', true);
        },
      ),
    );

    cancelarDeudas = registrarListener(
      onSnapshot(
        qDeudas,
        (snapshot) => {
          movimientos = snapshot.docs.map((d) =>
            aMovimiento(d.id, d.data({ serverTimestamps: 'estimate' })),
          );
          recalcular();
        },
        (error) => {
          console.error('Error en listener de deudas:', error);
          showToast('Error al cargar pagos en tiempo real', true);
        },
      ),
    );
  } catch (error) {
    console.error('Error al cargar reporte: ', error);
    showToast('Error al cargar el reporte', true);
  }
}
