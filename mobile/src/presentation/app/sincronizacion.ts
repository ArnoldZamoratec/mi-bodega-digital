import type { Contenedor } from '@/data/contenedor';
import type {
  OpcionesSincronizacion,
  ResultadoSincronizacion,
} from '@/domain/usecases/sincronizarVentas';

/**
 * D-31: quien sabe recrear la instancia de Firestore y el contenedor (lo registra
 * `useArranque`). Se invoca cuando algún outbox informa `instanciaRota`.
 */
let recuperador: (() => void) | null = null;

export function registrarRecuperador(fn: () => void): () => void {
  recuperador = fn;
  return () => {
    if (recuperador === fn) recuperador = null;
  };
}

const VACIO: ResultadoSincronizacion = {
  sincronizadas: 0,
  pendientes: 0,
  interrumpida: true,
  instanciaRota: false,
};

const seguro = (p: () => Promise<ResultadoSincronizacion>) => p().catch(() => VACIO);

/**
 * Sincroniza los tres outbox. Ventas primero: un abono puede imputarse al cargo de una venta
 * fiada aún pendiente (D-24). La caja (D-28) es independiente y va en paralelo.
 * Devuelve el resultado de las ventas (lo que muestra "Ventas pendientes") y si alguna cola
 * detectó la instancia rota, en cuyo caso pide la recuperación (D-31).
 */
export async function sincronizarTodo(
  c: Contenedor,
  opciones: OpcionesSincronizacion = {},
): Promise<ResultadoSincronizacion> {
  const caja = seguro(() => c.sincronizadorCaja.sincronizar(opciones));
  const ventas = await seguro(() => c.sincronizador.sincronizar(opciones));
  const fiado = await seguro(() => c.sincronizadorFiado.sincronizar(opciones));
  const instanciaRota = ventas.instanciaRota || fiado.instanciaRota || (await caja).instanciaRota;
  if (instanciaRota) recuperador?.();
  return { ...ventas, instanciaRota };
}
