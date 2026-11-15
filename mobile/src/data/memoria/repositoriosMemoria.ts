import type { MovimientoFiado, Producto, Venta } from '@/domain/entities';
import type {
  AlError,
  Cancelar,
  RemotoFiado,
  RepositorioVentas,
  ResultadoConfirmacion,
} from '@/domain/ports';
import type { AbonoNuevo, CargoNuevo, OperacionMovimiento } from '@/domain/rules/fiado';
import { enRangoEfectivo, type RangoFechas } from '@/domain/rules/reportes';
import type { OperacionVenta } from '@/domain/rules/venta';

/**
 * Implementaciones en memoria de los puertos, con la misma semántica que Firestore
 * (transacción idempotente, stock null intacto). Se usan en pruebas de integración.
 */

export class ErrorSimulado extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export class BaseDatosMemoria {
  productos = new Map<string, Producto>();
  ventas = new Map<string, Venta>();
  deudas = new Map<string, MovimientoFiado>();
  /** Simula falta de red: las escrituras quedan colgadas o fallan. */
  modo: 'online' | 'sin-red' | 'colgado' | 'sin-permiso' = 'online';
  reloj = () => new Date(2026, 0, 15, 12);
}

let secuencia = 0;
const nuevoId = (prefijo: string) => `${prefijo}-${++secuencia}`;

export class VentasMemoria implements RepositorioVentas {
  escrituras = 0;
  constructor(private readonly db: BaseDatosMemoria) {}

  nuevoId(): string {
    return nuevoId('venta');
  }

  nuevoIdCargo(): string {
    return nuevoId('cargo');
  }

  async confirmar(op: OperacionVenta): Promise<ResultadoConfirmacion> {
    if (this.db.modo === 'sin-red') throw new ErrorSimulado('unavailable');
    if (this.db.modo === 'sin-permiso') throw new ErrorSimulado('permission-denied');
    if (this.db.modo === 'colgado') return new Promise<never>(() => undefined);
    if (this.db.ventas.has(op.ventaId)) return 'ya-existia';

    const fecha = this.db.reloj();
    const creadaEn = new Date(op.creadaEn);
    this.db.ventas.set(op.ventaId, { id: op.ventaId, ...op.venta, fecha, creadaEn });
    if (op.cargo && op.cargoId) {
      this.db.deudas.set(op.cargoId, { id: op.cargoId, ...op.cargo, fecha, creadaEn });
    }
    for (const d of op.deltasStock) {
      const p = this.db.productos.get(d.productoId);
      if (p && p.stock !== null) this.db.productos.set(p.id, { ...p, stock: p.stock + d.delta });
    }
    this.escrituras += 1;
    return 'escrita';
  }

  async anular(op: OperacionVenta, original: Venta): Promise<ResultadoConfirmacion> {
    if (this.db.modo === 'sin-red') throw new ErrorSimulado('unavailable');
    if (this.db.modo === 'sin-permiso') throw new ErrorSimulado('permission-denied');
    if (this.db.ventas.has(op.ventaId)) return 'ya-existia';

    this.db.ventas.set(op.ventaId, {
      id: op.ventaId,
      ...op.venta,
      fecha: this.db.reloj(),
      creadaEn: new Date(op.creadaEn),
    });
    for (const d of op.deltasStock) {
      const p = this.db.productos.get(d.productoId);
      if (p && p.stock !== null) this.db.productos.set(p.id, { ...p, stock: p.stock + d.delta });
    }
    if (original.metodoDePago === 'Fiado') {
      for (const [id, m] of this.db.deudas)
        if (m.ventaId === original.id) this.db.deudas.delete(id);
    }
    this.escrituras += 1;
    return 'escrita';
  }

  observarRango(rango: RangoFechas, onDatos: (v: Venta[]) => void): Cancelar {
    onDatos([...this.db.ventas.values()].filter((v) => enRangoEfectivo(v, rango)));
    return () => undefined;
  }
}

export class FiadoMemoria implements RemotoFiado {
  constructor(private readonly db: BaseDatosMemoria) {}

  nuevoId(): string {
    return nuevoId('mov');
  }

  async confirmar(op: OperacionMovimiento): Promise<ResultadoConfirmacion> {
    if (this.db.modo === 'sin-red') throw new ErrorSimulado('unavailable');
    if (this.db.modo === 'sin-permiso') throw new ErrorSimulado('permission-denied');
    if (this.db.modo === 'colgado') return new Promise<never>(() => undefined);
    if (this.db.deudas.has(op.id)) return 'ya-existia';
    this.db.deudas.set(op.id, {
      id: op.id,
      ...op.datos,
      fecha: this.db.reloj(),
      creadaEn: new Date(op.creadaEn),
    });
    return 'escrita';
  }

  private todos(): MovimientoFiado[] {
    return [...this.db.deudas.values()];
  }

  observarTodos(onDatos: (m: MovimientoFiado[]) => void, _onError?: AlError): Cancelar {
    onDatos(this.todos());
    return () => undefined;
  }

  observarCliente(
    clienteId: string,
    onDatos: (m: MovimientoFiado[]) => void,
    _onError?: AlError,
  ): Cancelar {
    onDatos(this.todos().filter((m) => m.clienteId === clienteId));
    return () => undefined;
  }

  observarRango(
    rango: RangoFechas,
    onDatos: (m: MovimientoFiado[]) => void,
    _onError?: AlError,
  ): Cancelar {
    onDatos(this.todos().filter((m) => enRangoEfectivo(m, rango)));
    return () => undefined;
  }

  private async crear(datos: CargoNuevo | AbonoNuevo): Promise<string> {
    if (this.db.modo !== 'online') throw new ErrorSimulado('unavailable');
    const id = nuevoId('mov');
    this.db.deudas.set(id, { id, ...datos, fecha: this.db.reloj() });
    return id;
  }

  crearCargo(cargo: CargoNuevo): Promise<string> {
    return this.crear(cargo);
  }

  crearAbono(abono: AbonoNuevo): Promise<string> {
    return this.crear(abono);
  }

  async eliminar(id: string): Promise<void> {
    this.db.deudas.delete(id);
  }
}
