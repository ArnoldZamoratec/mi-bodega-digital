import type { Cancelar, Cola, EntradaColaDe } from '@/domain/ports';
import type { OperacionMovimiento } from '@/domain/rules/fiado';
import type { OperacionVenta } from '@/domain/rules/venta';

/** Subconjunto de AsyncStorage que se usa (facilita pruebas con un doble en memoria). */
export interface AlmacenClaveValor {
  getItem(clave: string): Promise<string | null>;
  setItem(clave: string, valor: string): Promise<void>;
}

/**
 * Outbox persistido en el teléfono (D-05). Una clave por usuario para que dos cuentas en
 * el mismo dispositivo nunca mezclen operaciones.
 * Las escrituras se serializan con una cadena de promesas para evitar carreras.
 */
export class ColaPersistente<T> implements Cola<T> {
  private cadena: Promise<unknown> = Promise.resolve();
  private cache: EntradaColaDe<T>[] | null = null;
  private readonly listeners = new Set<(e: EntradaColaDe<T>[]) => void>();

  constructor(
    private readonly almacen: AlmacenClaveValor,
    private readonly clave: string,
    private readonly idDe: (operacion: T) => string,
  ) {}

  private async leer(): Promise<EntradaColaDe<T>[]> {
    if (this.cache) return this.cache;
    try {
      const crudo = await this.almacen.getItem(this.clave);
      const parsed: unknown = crudo ? JSON.parse(crudo) : [];
      this.cache = Array.isArray(parsed) ? (parsed as EntradaColaDe<T>[]) : [];
    } catch {
      this.cache = [];
    }
    return this.cache;
  }

  private mutar(fn: (entradas: EntradaColaDe<T>[]) => EntradaColaDe<T>[]): Promise<void> {
    const siguiente = this.cadena.then(async () => {
      const nuevas = fn(await this.leer());
      this.cache = nuevas;
      await this.almacen.setItem(this.clave, JSON.stringify(nuevas));
      this.listeners.forEach((l) => l(nuevas));
    });
    this.cadena = siguiente.catch(() => undefined);
    return siguiente;
  }

  async listar(): Promise<EntradaColaDe<T>[]> {
    await this.cadena;
    return [...(await this.leer())];
  }

  agregar(operacion: T): Promise<void> {
    const id = this.idDe(operacion);
    return this.mutar((e) =>
      e.some((x) => this.idDe(x.operacion) === id) ? e : [...e, { operacion, intentos: 0 }],
    );
  }

  actualizar(entrada: EntradaColaDe<T>): Promise<void> {
    const id = this.idDe(entrada.operacion);
    return this.mutar((e) => e.map((x) => (this.idDe(x.operacion) === id ? entrada : x)));
  }

  quitar(id: string): Promise<void> {
    return this.mutar((e) => e.filter((x) => this.idDe(x.operacion) !== id));
  }

  suscribir(listener: (entradas: EntradaColaDe<T>[]) => void): Cancelar {
    this.listeners.add(listener);
    void this.listar().then(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export class ColaVentasPersistente extends ColaPersistente<OperacionVenta> {
  constructor(almacen: AlmacenClaveValor, uid: string) {
    super(almacen, `bodega:outbox:${uid}`, (op) => op.ventaId);
  }
}

/** Cargos y abonos manuales de fiado sin confirmar (D-24). Clave propia: no toca ventas. */
export class ColaMovimientosPersistente extends ColaPersistente<OperacionMovimiento> {
  constructor(almacen: AlmacenClaveValor, uid: string) {
    super(almacen, `bodega:outbox-fiado:${uid}`, (op) => op.id);
  }
}
