import { useEffect, useMemo, useState } from 'react';

import { mensajeDeError } from '@/data/firebase/errores';
import type { Venta } from '@/domain/entities';
import {
  cajaAbierta,
  historialCajas,
  resumenCaja,
  type Caja,
  type MovimientoCaja,
  type ResumenCaja,
} from '@/domain/rules/caja';
import { claveDia, crearRango, fechaEfectiva } from '@/domain/rules/reportes';

import { useDatos } from '../stores/datosStore';
import { useContenedor } from '../stores/sesionStore';

export interface EstadoCajaVista {
  cargando: boolean;
  error: string | null;
  cajas: Caja[];
  abierta: Caja | undefined;
  historial: Caja[];
  /** Movimientos manuales de la caja abierta (más reciente primero). */
  movimientos: MovimientoCaja[];
  /** `null` mientras llegan las ventas o los movimientos de la sesión. */
  resumen: ResumenCaja | null;
  /** Recalcula el resumen con la hora actual (para cerrar con el esperado al segundo). */
  resumenAhora: () => ResumenCaja | null;
}

/**
 * Datos de la caja (D-28): sesiones, movimientos de la abierta y lo vendido desde la
 * apertura. Los listeners de ventas y movimientos se abren solo con una caja abierta.
 */
export function useCaja(): EstadoCajaVista {
  const contenedor = useContenedor();
  const pendientes = useDatos((s) => s.pendientes);
  const movimientosFiado = useDatos((s) => s.movimientos.datos);
  const [cajas, setCajas] = useState<Caja[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [movs, setMovs] = useState<{ cajaId: string; datos: MovimientoCaja[] } | null>(null);
  const [ventas, setVentas] = useState<{ clave: string; datos: Venta[] } | null>(null);

  useEffect(
    () =>
      contenedor.caja.observarCajas(
        (c) => {
          setCajas(c);
          setError(null);
        },
        (e) => setError(mensajeDeError(e, 'Error al cargar la caja')),
      ),
    [contenedor],
  );

  const abierta = useMemo(() => (cajas ? cajaAbierta(cajas) : undefined), [cajas]);
  const abiertaId = abierta?.id;

  useEffect(() => {
    if (!abiertaId) return;
    return contenedor.caja.observarMovimientos(
      abiertaId,
      (datos) => setMovs({ cajaId: abiertaId, datos }),
      () => setMovs({ cajaId: abiertaId, datos: [] }),
    );
  }, [contenedor, abiertaId]);

  // Ventas desde el día de la apertura hasta hoy (la sesión puede cruzar la medianoche).
  const inicio = abierta ? fechaEfectiva(abierta.apertura) : null;
  const diaInicio = inicio ? claveDia(inicio) : null;
  const hoy = claveDia(new Date());
  const rango = useMemo(() => {
    if (!diaInicio) return null;
    const desde = new Date(`${diaInicio}T12:00:00`);
    const hasta = new Date(`${hoy}T12:00:00`);
    // Reloj del teléfono atrasado respecto de la apertura: se consulta solo ese día.
    return crearRango(desde, hasta.getTime() < desde.getTime() ? desde : hasta);
  }, [diaInicio, hoy]);
  const claveRango = rango ? `${rango.inicio.getTime()}-${rango.fin.getTime()}` : '';

  useEffect(() => {
    if (!rango) return;
    const clave = `${rango.inicio.getTime()}-${rango.fin.getTime()}`;
    return contenedor.ventas.observarRango(
      rango,
      (datos) => setVentas({ clave, datos }),
      // Sin ventas del servidor se calcula con lo que hay en el teléfono.
      () => setVentas({ clave, datos: [] }),
    );
  }, [contenedor, rango]);

  const movimientos = useMemo(
    () => (abierta && movs?.cajaId === abierta.id ? movs.datos : []),
    [abierta, movs],
  );
  const listo =
    !!abierta && movs?.cajaId === abierta.id && ventas !== null && ventas.clave === claveRango;

  const calcular = useMemo(
    () => () =>
      listo && abierta && ventas
        ? resumenCaja({
            caja: abierta,
            ventas: ventas.datos,
            ventasPendientes: pendientes.map((p) => p.operacion),
            movimientosFiado,
            movimientosCaja: movimientos,
            ahora: new Date(),
          })
        : null,
    [listo, abierta, ventas, pendientes, movimientosFiado, movimientos],
  );
  const resumen = useMemo(() => calcular(), [calcular]);
  const historial = useMemo(() => historialCajas(cajas ?? []), [cajas]);

  return {
    cargando: cajas === null && error === null,
    error,
    cajas: cajas ?? [],
    abierta,
    historial,
    movimientos,
    resumen,
    resumenAhora: calcular,
  };
}
