import type { AlError, Cancelar, ResultadoConfirmacion } from './ports';
import type { Caja, MovimientoCaja, OperacionCaja } from './rules/caja';

/**
 * Puertos de la caja (D-28). En un archivo propio para no tocar `ports.ts`.
 * Las pantallas usan `RepositorioCaja` (outbox-first); `RemotoCaja` es el lado Firestore.
 */
export interface LecturaCaja {
  /** Id nuevo generado en el teléfono (idempotencia offline). */
  nuevoId(): string;
  nuevoIdMovimiento(cajaId: string): string;
  /** Todas las sesiones de caja del usuario (pocas: una por turno). */
  observarCajas(onDatos: (cajas: Caja[]) => void, onError: AlError): Cancelar;
  observarMovimientos(
    cajaId: string,
    onDatos: (movimientos: MovimientoCaja[]) => void,
    onError: AlError,
  ): Cancelar;
}

export interface RepositorioCaja extends LecturaCaja {
  /** Guarda la operación en el teléfono y la envía cuando hay red. */
  guardar(operacion: OperacionCaja): Promise<void>;
}

export interface RemotoCaja extends LecturaCaja {
  /** Escritura idempotente: si la caja, el movimiento o el cierre ya existe, no reescribe. */
  confirmar(operacion: OperacionCaja): Promise<ResultadoConfirmacion>;
}
