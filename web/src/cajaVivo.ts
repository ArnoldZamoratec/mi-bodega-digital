import { cajaAbierta } from '@bodegon/core/rules/caja';

import { actualizarDatos, datos, fuente, suscribirDatos, type EstadoDatos } from './datos';
import type { Cancelar } from './listeners';
import { rangoVentasCaja } from './logic/caja';

/**
 * Mientras haya una caja abierta, observa sus movimientos y las ventas desde el día de la
 * apertura (para el esperado en Caja y en Hoy). Sin caja abierta no hay listeners extra.
 * Los listeners quedan en el registro global (listeners.ts), que los cierra al salir.
 */
let cajaId: string | null = null;
let claveRango = '';
let cancelarMovs: Cancelar | null = null;
let cancelarVentas: Cancelar | null = null;
let iniciado = false;

function detener(): void {
  cancelarMovs?.();
  cancelarVentas?.();
  cancelarMovs = null;
  cancelarVentas = null;
  cajaId = null;
  claveRango = '';
}

/** Ajusta los listeners a la caja abierta actual (idempotente). */
export function sincronizarCajaVivo(e: EstadoDatos = datos(), ahora = new Date()): void {
  const abierta = e.cajas ? cajaAbierta(e.cajas) : undefined;
  if (!abierta) {
    if (cajaId) {
      detener();
      actualizarDatos({ cajaVivo: null });
    }
    return;
  }
  let f;
  try {
    f = fuente();
  } catch {
    return; // sin sesión
  }
  const id = abierta.id;
  if (id !== cajaId) {
    detener();
    cajaId = id;
    actualizarDatos({ cajaVivo: { cajaId: id, movimientos: null, ventas: null } });
    cancelarMovs = f.observarMovimientosCaja(
      id,
      (movimientos) => {
        const v = datos().cajaVivo;
        if (v?.cajaId === id) actualizarDatos({ cajaVivo: { ...v, movimientos } });
      },
      () => {
        const v = datos().cajaVivo;
        if (v?.cajaId === id && v.movimientos === null) actualizarDatos({ cajaVivo: { ...v, movimientos: [] } });
      },
    );
  }
  // El rango cambia al pasar la medianoche: se vuelve a pedir.
  const rango = rangoVentasCaja(abierta, ahora);
  const clave = `${rango.inicio.getTime()}-${rango.fin.getTime()}`;
  if (clave === claveRango) return;
  cancelarVentas?.();
  claveRango = clave;
  cancelarVentas = f.observarRango(
    rango,
    (ventas) => {
      const v = datos().cajaVivo;
      if (v?.cajaId === id) actualizarDatos({ cajaVivo: { ...v, ventas } });
    },
    // Sin ventas del servidor, el esperado se calcula con lo que hay (como la app móvil).
    () => {
      const v = datos().cajaVivo;
      if (v?.cajaId === id && v.ventas === null) actualizarDatos({ cajaVivo: { ...v, ventas: [] } });
    },
  );
}

/** Una vez por app: sigue los cambios de `cajas` (fuera del ciclo de notificación). */
export function iniciarCajaVivo(): void {
  if (iniciado) return;
  iniciado = true;
  suscribirDatos(() => queueMicrotask(() => sincronizarCajaVivo()));
}

/** Logout: el registro global ya cerró los listeners; aquí solo se olvida el estado. */
export function reiniciarCajaVivo(): void {
  cancelarMovs = null;
  cancelarVentas = null;
  cajaId = null;
  claveRango = '';
}
