import { useEffect, useMemo, useState } from 'react';

import type { Venta } from '@/domain/entities';
import {
  claveDia,
  rangoPredefinido,
  resumenVentas,
  type ResumenDia,
} from '@/domain/rules/reportes';

import { useDatos } from '../stores/datosStore';
import { useSesion } from '../stores/sesionStore';

/**
 * Lo vendido hoy en tiempo real (un listener acotado al día) más lo que espera en el
 * teléfono sin conexión. `null` mientras llega el primer dato.
 */
export function useVentasHoy(): ResumenDia | null {
  const contenedor = useSesion((s) => s.contenedor);
  const pendientes = useDatos((s) => s.pendientes);
  // La clave del día cambia a medianoche al volver a renderizar: el rango se recalcula.
  const dia = claveDia(new Date());
  const rango = useMemo(() => rangoPredefinido('hoy', new Date(`${dia}T12:00:00`)), [dia]);
  const [ventas, setVentas] = useState<{ dia: string; datos: Venta[] } | null>(null);

  useEffect(() => {
    if (!contenedor) return;
    return contenedor.ventas.observarRango(
      rango,
      (datos) => setVentas({ dia, datos }),
      // Sin datos del servidor se muestra al menos lo pendiente en el teléfono.
      () => setVentas({ dia, datos: [] }),
    );
  }, [contenedor, rango, dia]);

  return useMemo(() => {
    if (!ventas || ventas.dia !== dia) return null;
    return resumenVentas(
      ventas.datos,
      pendientes.map((p) => p.operacion),
      rango,
    );
  }, [ventas, pendientes, rango, dia]);
}
