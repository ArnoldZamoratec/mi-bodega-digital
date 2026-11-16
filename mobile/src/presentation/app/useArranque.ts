import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { Contenedor } from '@/data/contenedor';
import type { ServicioAuth } from '@/domain/ports';

import {
  alertarStockBajo,
  prepararNotificaciones,
  programarRecordatorioFiado,
} from '../services/notificaciones';
import { useCarrito } from '../stores/carritoStore';
import { useDatos } from '../stores/datosStore';
import { useRed } from '../stores/redStore';
import { useSesion } from '../stores/sesionStore';
import { registrarRecuperador, sincronizarTodo } from './sincronizacion';

const sinReinicio = () => undefined;

/**
 * Orquesta el ciclo de vida de la sesión:
 *  - Al iniciar sesión: crea el contenedor del usuario, abre los listeners y sincroniza el outbox.
 *  - Al cerrar sesión: corta listeners y limpia estado (el outbox queda guardado por uid).
 *  - Sincroniza ventas y movimientos de fiado pendientes al recuperar la red o al volver a
 *    primer plano.
 *  - Reprograma el recordatorio de fiados cuando cambian los datos.
 */
/** D-31: como mucho una recuperación de Firestore cada 30 s (evita bucles). */
export const ESPERA_RECUPERACION_MS = 30_000;

const opcionesDatos = {
  alCambiarProductos: (...args: Parameters<typeof alertarStockBajo>) =>
    void alertarStockBajo(...args),
};

export function useArranque(
  auth: ServicioAuth,
  crearContenedor: (uid: string, enLinea: () => boolean) => Contenedor,
  /** D-31: reemplaza la instancia de Firestore rota (`reiniciarFirestore`). */
  reiniciarCliente: () => void = sinReinicio,
) {
  const contenedor = useSesion((s) => s.contenedor);
  const enLinea = useRed((s) => s.enLinea);
  const movimientos = useDatos((s) => s.movimientos.datos);
  const config = useDatos((s) => s.config);
  const cancelarDatos = useRef<(() => void) | null>(null);
  const ultimaRecuperacion = useRef(Number.NEGATIVE_INFINITY);

  // Red
  useEffect(() => useRed.getState().iniciar(), []);

  // Sesión
  useEffect(() => {
    return auth.observar((usuario) => {
      cancelarDatos.current?.();
      cancelarDatos.current = null;
      useDatos.getState().reiniciar();
      useCarrito.getState().vaciar();

      if (!usuario) {
        useSesion.getState().cerrar();
        return;
      }
      const c = crearContenedor(usuario.uid, () => useRed.getState().enLinea);
      useSesion.getState().autenticar(usuario, c);
      cancelarDatos.current = useDatos.getState().iniciar(c, opcionesDatos);
      void prepararNotificaciones(false);
      // D-31: sin red no se abren transacciones; se sincroniza al volver la conexión.
      if (useRed.getState().enLinea) void sincronizarTodo(c);
    });
  }, [auth, crearContenedor]);

  // D-31: Firestore quedó inservible (INTERNAL ASSERTION FAILED o envíos que nunca terminan).
  // Se recrea la instancia y el contenedor de la sesión; los outbox persisten y se reenvían.
  useEffect(
    () =>
      registrarRecuperador(() => {
        const sesion = useSesion.getState();
        const ahora = Date.now();
        if (sesion.estado !== 'autenticado') return;
        if (ahora - ultimaRecuperacion.current < ESPERA_RECUPERACION_MS) return;
        ultimaRecuperacion.current = ahora;
        console.warn('[sync] Firestore inutilizable: se recrea la instancia (D-31)');
        cancelarDatos.current?.();
        cancelarDatos.current = null;
        reiniciarCliente();
        const c = crearContenedor(sesion.usuario.uid, () => useRed.getState().enLinea);
        useSesion.getState().autenticar(sesion.usuario, c);
        cancelarDatos.current = useDatos.getState().iniciar(c, opcionesDatos);
        if (useRed.getState().enLinea) void sincronizarTodo(c, { forzar: true });
      }),
    [crearContenedor, reiniciarCliente],
  );

  useEffect(() => () => cancelarDatos.current?.(), []);

  // Reintento de lo pendiente al volver la conexión
  useEffect(() => {
    if (enLinea && contenedor) void sincronizarTodo(contenedor);
  }, [enLinea, contenedor]);

  useEffect(() => {
    if (!contenedor) return;
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && useRed.getState().enLinea) void sincronizarTodo(contenedor);
    });
    return () => sub.remove();
  }, [contenedor]);

  // Recordatorio de fiados vencidos (con antirrebote para no reprogramar en cada snapshot)
  useEffect(() => {
    if (!contenedor) return;
    const t = setTimeout(() => void programarRecordatorioFiado(movimientos, config), 3000);
    return () => clearTimeout(t);
  }, [contenedor, movimientos, config]);
}
