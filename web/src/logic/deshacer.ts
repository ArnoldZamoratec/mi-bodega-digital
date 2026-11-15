/**
 * Ventana de "Deshacer" de 6 s tras cobrar (ux-web §1: aversión a la pérdida).
 *
 * La venta YA está registrada cuando se abre la ventana (transacción confirmada). Deshacer
 * escribe el contraasiento `{id}-anulada` con las reglas del core (armarAnulacion), que
 * firestore.rules permite; esta pieza solo decide si el clic llegó a tiempo y una sola vez.
 */
export const VENTANA_DESHACER_MS = 6000;

export interface Reloj {
  ahora(): number;
  programar(fn: () => void, ms: number): unknown;
  cancelar(id: unknown): void;
}

const relojReal: Reloj = {
  ahora: () => Date.now(),
  programar: (fn, ms) => setTimeout(fn, ms),
  cancelar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface VentanaDeshacer {
  /** Abre (o reinicia) la ventana. */
  abrir(): void;
  /** true si estaba abierta: la consume (un segundo clic devuelve false). */
  tomar(): boolean;
  /** Cierra sin deshacer (p. ej. "Nueva venta"). */
  cerrar(): void;
  abierta(): boolean;
  /** Segundos restantes, redondeados hacia arriba (para el texto del botón). */
  segundosRestantes(): number;
}

export function crearVentanaDeshacer(
  alExpirar: () => void,
  ms = VENTANA_DESHACER_MS,
  reloj: Reloj = relojReal,
): VentanaDeshacer {
  let hasta = 0;
  let timer: unknown = null;

  const limpiar = () => {
    if (timer !== null) reloj.cancelar(timer);
    timer = null;
  };

  const abierta = () => timer !== null && reloj.ahora() < hasta;

  return {
    abrir() {
      limpiar();
      hasta = reloj.ahora() + ms;
      timer = reloj.programar(() => {
        timer = null;
        alExpirar();
      }, ms);
    },
    tomar() {
      if (!abierta()) return false;
      limpiar();
      return true;
    },
    cerrar: limpiar,
    abierta,
    segundosRestantes: () => (abierta() ? Math.ceil((hasta - reloj.ahora()) / 1000) : 0),
  };
}
