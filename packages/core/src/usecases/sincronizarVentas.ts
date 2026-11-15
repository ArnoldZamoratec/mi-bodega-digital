import type { ClasificadorErrores, Cola, ColaVentas, RepositorioVentas } from '../ports';
import type { OperacionVenta } from '../rules/venta';

export interface ResultadoSincronizacion {
  sincronizadas: number;
  pendientes: number;
  /** Se detuvo por falta de red o timeout. */
  interrumpida: boolean;
}

export class TiempoAgotado extends Error {
  constructor() {
    super('Tiempo de espera agotado');
    this.name = 'TiempoAgotado';
  }
}

export function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new TiempoAgotado()), ms);
    promesa.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/**
 * Vacía un outbox en orden de llegada (D-05). Lo usan las ventas y los movimientos de fiado.
 *
 * Garantías:
 *  - Una sola ejecución a la vez (llamadas concurrentes comparten la misma promesa).
 *  - Una operación que excedió el timeout sigue "en vuelo": no se reenvía hasta que su
 *    promesa termine. Aun así `confirmar` es idempotente, por lo que un reenvío es seguro.
 *  - Errores permanentes (p. ej. permisos) marcan la entrada como bloqueada para que el
 *    usuario decida; no frenan al resto de la cola.
 */
export class SincronizadorCola<T> {
  private ejecucion: Promise<ResultadoSincronizacion> | null = null;
  private readonly enVuelo = new Set<string>();

  constructor(
    private readonly cola: Cola<T>,
    /** Escritura idempotente en el servidor. */
    private readonly enviar: (operacion: T) => Promise<unknown>,
    private readonly idDe: (operacion: T) => string,
    private readonly errores: ClasificadorErrores,
    private readonly timeoutMs = 10_000,
  ) {}

  sincronizar(): Promise<ResultadoSincronizacion> {
    if (!this.ejecucion) {
      this.ejecucion = this.ejecutar().finally(() => {
        this.ejecucion = null;
      });
    }
    return this.ejecucion;
  }

  private async ejecutar(): Promise<ResultadoSincronizacion> {
    const entradas = await this.cola.listar();
    let sincronizadas = 0;
    let interrumpida = false;

    for (const entrada of entradas) {
      const id = this.idDe(entrada.operacion);
      if (entrada.bloqueada || this.enVuelo.has(id)) continue;

      this.enVuelo.add(id);
      const envio = this.enviar(entrada.operacion);
      // Si se agota el timeout, la escritura puede completarse después: se limpia sola.
      envio.then(
        () => this.cola.quitar(id).finally(() => this.enVuelo.delete(id)),
        () => this.enVuelo.delete(id),
      );

      try {
        await conTimeout(envio, this.timeoutMs);
        await this.cola.quitar(id);
        sincronizadas += 1;
      } catch (error) {
        const permanente =
          !(error instanceof TiempoAgotado) && this.errores.esErrorPermanente(error);
        await this.cola.actualizar({
          ...entrada,
          intentos: entrada.intentos + 1,
          ultimoError: error instanceof Error ? error.message : String(error),
          bloqueada: permanente,
        });
        if (!permanente) {
          // Sin red o servidor lento: no tiene sentido seguir con el resto ahora.
          interrumpida = true;
          break;
        }
      }
    }

    const restantes = await this.cola.listar();
    return { sincronizadas, pendientes: restantes.length, interrumpida };
  }
}

export class SincronizadorVentas extends SincronizadorCola<OperacionVenta> {
  constructor(
    ventas: RepositorioVentas,
    cola: ColaVentas,
    errores: ClasificadorErrores,
    timeoutMs?: number,
  ) {
    super(
      cola,
      (op) => ventas.confirmar(op),
      (op) => op.ventaId,
      errores,
      timeoutMs,
    );
  }
}
