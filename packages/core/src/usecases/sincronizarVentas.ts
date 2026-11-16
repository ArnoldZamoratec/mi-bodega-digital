import type { ClasificadorErrores, Cola, ColaVentas, RepositorioVentas } from '../ports';
import type { OperacionVenta } from '../rules/venta';

export interface ResultadoSincronizacion {
  sincronizadas: number;
  pendientes: number;
  /** Se detuvo por falta de red o timeout. */
  interrumpida: boolean;
  /**
   * D-31: el cliente de la base parece inutilizable (error de instancia rota, o una
   * operación que siguió "en vuelo" más allá del límite). Quien llama decide si recrearlo.
   */
  instanciaRota: boolean;
}

export interface OpcionesSincronizacion {
  /**
   * "Sincronizar ahora" (D-31): reenvía también lo que sigue "en vuelo". Seguro porque
   * `confirmar` es idempotente (la transacción no escribe si el id ya existe).
   */
  forzar?: boolean;
}

export interface OpcionesSincronizador {
  /** Espera máxima por envío antes de dar el intento por interrumpido. */
  timeoutMs?: number;
  /**
   * Tiempo tras el cual un envío que nunca terminó deja de bloquear reenvíos y se considera
   * atascado (por defecto 3 × `timeoutMs`).
   */
  maxEnVueloMs?: number;
  /** Reloj inyectable (pruebas). */
  ahora?: () => number;
}

/** D-31: por defecto un envío "en vuelo" se abandona tras 3 timeouts. */
export const FACTOR_MAX_EN_VUELO = 3;

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
 * Vacía un outbox en orden de llegada (D-05). Lo usan las ventas, el fiado y la caja.
 *
 * Garantías:
 *  - Una sola ejecución a la vez (llamadas concurrentes comparten la misma promesa). Una
 *    llamada forzada espera a la ejecución en curso y luego corre la suya.
 *  - Una operación que excedió el timeout sigue "en vuelo" y no se reenvía mientras su
 *    promesa no termine… salvo que pase `maxEnVueloMs` o el usuario fuerce (D-31): una
 *    promesa que nunca se resuelve (SDK de Firestore roto) no puede trabar la cola para
 *    siempre. Reenviar es seguro: `confirmar` es idempotente.
 *  - Errores permanentes (p. ej. permisos) marcan la entrada como bloqueada para que el
 *    usuario decida; no frenan al resto de la cola.
 *  - Errores de instancia rota y envíos atascados se informan en `instanciaRota`.
 */
export class SincronizadorCola<T> {
  private ejecucion: Promise<ResultadoSincronizacion> | null = null;
  /** id → momento en que se envió. */
  private readonly enVuelo = new Map<string, number>();
  private readonly timeoutMs: number;
  private readonly maxEnVueloMs: number;
  private readonly ahora: () => number;

  constructor(
    private readonly cola: Cola<T>,
    /** Escritura idempotente en el servidor. */
    private readonly enviar: (operacion: T) => Promise<unknown>,
    private readonly idDe: (operacion: T) => string,
    private readonly errores: ClasificadorErrores,
    opciones: number | OpcionesSincronizador = {},
  ) {
    const o = typeof opciones === 'number' ? { timeoutMs: opciones } : opciones;
    this.timeoutMs = o.timeoutMs ?? 10_000;
    this.maxEnVueloMs = o.maxEnVueloMs ?? FACTOR_MAX_EN_VUELO * this.timeoutMs;
    this.ahora = o.ahora ?? Date.now;
  }

  sincronizar(opciones: OpcionesSincronizacion = {}): Promise<ResultadoSincronizacion> {
    if (this.ejecucion) {
      if (!opciones.forzar) return this.ejecucion;
      return this.ejecucion.then(
        () => this.sincronizar(opciones),
        () => this.sincronizar(opciones),
      );
    }
    this.ejecucion = this.ejecutar(opciones.forzar === true).finally(() => {
      this.ejecucion = null;
    });
    return this.ejecucion;
  }

  /** ids que llevan más de `maxEnVueloMs` sin terminar (diagnóstico / UI). */
  atascadas(): string[] {
    const limite = this.ahora() - this.maxEnVueloMs;
    return [...this.enVuelo].filter(([, desde]) => desde <= limite).map(([id]) => id);
  }

  private async ejecutar(forzar: boolean): Promise<ResultadoSincronizacion> {
    const entradas = await this.cola.listar();
    let sincronizadas = 0;
    let interrumpida = false;
    let instanciaRota = false;

    for (const entrada of entradas) {
      const id = this.idDe(entrada.operacion);
      if (entrada.bloqueada) continue;
      const desde = this.enVuelo.get(id);
      if (desde !== undefined) {
        const atascada = this.ahora() - desde >= this.maxEnVueloMs;
        if (atascada) instanciaRota = true;
        // Sigue en vuelo dentro del plazo y nadie forzó: se respeta (evita envíos dobles).
        if (!atascada && !forzar) continue;
      }

      const inicio = this.ahora();
      this.enVuelo.set(id, inicio);
      // `enviar` puede lanzar de forma síncrona (SDK roto): se normaliza a promesa rechazada.
      const envio = Promise.resolve().then(() => this.enviar(entrada.operacion));
      // Si se agota el timeout, la escritura puede completarse después: se limpia sola.
      // Solo limpia su propio registro: un reenvío posterior pudo reemplazarlo.
      const liberar = () => {
        if (this.enVuelo.get(id) === inicio) this.enVuelo.delete(id);
      };
      envio.then(() => this.cola.quitar(id).finally(liberar), liberar);

      try {
        await conTimeout(envio, this.timeoutMs);
        await this.cola.quitar(id);
        sincronizadas += 1;
      } catch (error) {
        const rota =
          !(error instanceof TiempoAgotado) && this.errores.esInstanciaRota?.(error) === true;
        if (rota) instanciaRota = true;
        const permanente =
          !rota && !(error instanceof TiempoAgotado) && this.errores.esErrorPermanente(error);
        await this.cola.actualizar({
          ...entrada,
          intentos: entrada.intentos + 1,
          ultimoError: error instanceof Error ? error.message : String(error),
          bloqueada: permanente,
        });
        if (!permanente) {
          // Sin red, servidor lento o cliente roto: no tiene sentido seguir ahora.
          interrumpida = true;
          break;
        }
      }
    }

    const restantes = await this.cola.listar();
    return { sincronizadas, pendientes: restantes.length, interrumpida, instanciaRota };
  }
}

export class SincronizadorVentas extends SincronizadorCola<OperacionVenta> {
  constructor(
    ventas: Pick<RepositorioVentas, 'confirmar'>,
    cola: ColaVentas,
    errores: ClasificadorErrores,
    opciones?: number | OpcionesSincronizador,
  ) {
    super(
      cola,
      (op) => ventas.confirmar(op),
      (op) => op.ventaId,
      errores,
      opciones,
    );
  }
}
