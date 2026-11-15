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

/**
 * Orquesta el ciclo de vida de la sesión:
 *  - Al iniciar sesión: crea el contenedor del usuario, abre los listeners y sincroniza el outbox.
 *  - Al cerrar sesión: corta listeners y limpia estado (el outbox queda guardado por uid).
 *  - Sincroniza ventas y movimientos de fiado pendientes al recuperar la red o al volver a
 *    primer plano.
 *  - Reprograma el recordatorio de fiados cuando cambian los datos.
 */
/**
 * Ventas primero: un abono puede imputarse al cargo de una venta fiada aún pendiente.
 * La caja (D-28) es independiente y va en paralelo.
 */
function sincronizarTodo(c: Contenedor): void {
  void c.sincronizador.sincronizar().finally(() => c.sincronizadorFiado.sincronizar());
  void c.sincronizadorCaja.sincronizar();
}

export function useArranque(
  auth: ServicioAuth,
  crearContenedor: (uid: string, enLinea: () => boolean) => Contenedor,
) {
  const contenedor = useSesion((s) => s.contenedor);
  const enLinea = useRed((s) => s.enLinea);
  const movimientos = useDatos((s) => s.movimientos.datos);
  const config = useDatos((s) => s.config);
  const cancelarDatos = useRef<(() => void) | null>(null);

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
      cancelarDatos.current = useDatos.getState().iniciar(c, {
        alCambiarProductos: (antes, despues, cfg) => void alertarStockBajo(antes, despues, cfg),
      });
      void prepararNotificaciones(false);
      sincronizarTodo(c);
    });
  }, [auth, crearContenedor]);

  useEffect(() => () => cancelarDatos.current?.(), []);

  // Reintento de lo pendiente al volver la conexión
  useEffect(() => {
    if (enLinea && contenedor) sincronizarTodo(contenedor);
  }, [enLinea, contenedor]);

  useEffect(() => {
    if (!contenedor) return;
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && useRed.getState().enLinea) sincronizarTodo(contenedor);
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
