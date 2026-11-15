import type { MovimientoFiado } from '@/domain/entities';
import type {
  AlError,
  Cancelar,
  ColaMovimientos,
  ColaVentas,
  RemotoFiado,
  RepositorioFiado,
} from '@/domain/ports';
import {
  conPendientes,
  movimientosPendientes,
  type AbonoNuevo,
  type CargoNuevo,
  type OperacionMovimiento,
} from '@/domain/rules/fiado';
import { enRangoEfectivo, type RangoFechas } from '@/domain/rules/reportes';
import type { OperacionVenta } from '@/domain/rules/venta';

interface Dependencias {
  remoto: RemotoFiado;
  cola: ColaMovimientos;
  /** Solo se lee: los cargos de ventas fiadas pendientes también cuentan en el saldo. */
  colaVentas: ColaVentas;
  sincronizar: () => unknown;
  enLinea: () => boolean;
  ahora?: () => number;
  /** Última copia confirmada, para ver saldos al abrir la app sin red (CacheCatalogo). */
  cache?: {
    leer<T>(nombre: string): Promise<T[] | null>;
    guardar<T>(nombre: string, datos: readonly T[]): Promise<void>;
  };
}

const CLAVE_CACHE = 'movimientos';

/**
 * Fiado "outbox-first" (D-24). Un cargo o abono se guarda primero en el teléfono y la
 * pantalla vuelve al instante; se confirma en Firestore cuando hay red. Las lecturas unen
 * lo confirmado con lo pendiente, así el saldo es correcto aunque se cierre la app sin
 * conexión. Pantallas y casos de uso no cambian: ven un `RepositorioFiado` normal.
 */
export class FiadoOffline implements RepositorioFiado {
  constructor(private readonly deps: Dependencias) {}

  observarTodos(onDatos: (m: MovimientoFiado[]) => void, onError: AlError): Cancelar {
    return this.combinar(
      (cb) => this.deps.remoto.observarTodos(cb, onError),
      () => true,
      onDatos,
      true,
    );
  }

  observarCliente(
    clienteId: string,
    onDatos: (m: MovimientoFiado[]) => void,
    onError: AlError,
  ): Cancelar {
    return this.combinar(
      (cb) => this.deps.remoto.observarCliente(clienteId, cb, onError),
      (m) => m.clienteId === clienteId,
      onDatos,
    );
  }

  observarRango(
    rango: RangoFechas,
    onDatos: (m: MovimientoFiado[]) => void,
    onError: AlError,
  ): Cancelar {
    return this.combinar(
      (cb) => this.deps.remoto.observarRango(rango, cb, onError),
      (m) => enRangoEfectivo(m, rango),
      onDatos,
    );
  }

  crearCargo(cargo: CargoNuevo): Promise<string> {
    return this.encolar({
      id: this.deps.remoto.nuevoId(),
      tipo: 'cargo',
      datos: cargo,
      creadaEn: this.ahora(),
    });
  }

  crearAbono(abono: AbonoNuevo): Promise<string> {
    return this.encolar({
      id: this.deps.remoto.nuevoId(),
      tipo: 'abono',
      datos: abono,
      creadaEn: this.ahora(),
    });
  }

  async eliminar(id: string): Promise<void> {
    const pendiente = (await this.deps.cola.listar()).some((e) => e.operacion.id === id);
    if (pendiente) return this.deps.cola.quitar(id);
    return this.deps.remoto.eliminar(id);
  }

  private ahora(): number {
    return (this.deps.ahora ?? Date.now)();
  }

  private async encolar(op: OperacionMovimiento): Promise<string> {
    await this.deps.cola.agregar(op);
    if (this.deps.enLinea()) void this.deps.sincronizar();
    return op.id;
  }

  /** JSON guarda las fechas como texto: se reconstruyen al leer. */
  private async leerCache(): Promise<MovimientoFiado[] | null> {
    const crudos = await this.deps.cache?.leer<MovimientoFiado>(CLAVE_CACHE);
    return crudos
      ? crudos.map(({ creadaEn, ...m }) => ({
          ...m,
          fecha: m.fecha ? new Date(m.fecha) : null,
          ...(creadaEn ? { creadaEn: new Date(creadaEn) } : {}),
        }))
      : null;
  }

  /**
   * Emite solo cuando hay una base completa (servidor o, sin red, la última copia
   * guardada): un saldo armado solo con lo pendiente sería un número incorrecto.
   */
  private combinar(
    suscribirRemoto: (cb: (m: MovimientoFiado[]) => void) => Cancelar,
    filtro: (m: MovimientoFiado) => boolean,
    onDatos: (m: MovimientoFiado[]) => void,
    guardarEnCache = false,
  ): Cancelar {
    let remotos: MovimientoFiado[] | null = null;
    let activo = true;
    let manuales: OperacionMovimiento[] = [];
    let ventas: OperacionVenta[] = [];

    const emitir = () => {
      if (!remotos) return;
      onDatos(conPendientes(remotos, movimientosPendientes(manuales, ventas).filter(filtro)));
    };

    void this.leerCache().then((guardados) => {
      if (!activo || remotos || !guardados) return;
      remotos = guardados.filter(filtro);
      emitir();
    });
    const cancelarRemoto = suscribirRemoto((m) => {
      remotos = m;
      if (guardarEnCache) void this.deps.cache?.guardar(CLAVE_CACHE, m);
      emitir();
    });
    const cancelarCola = this.deps.cola.suscribir((e) => {
      manuales = e.map((x) => x.operacion);
      emitir();
    });
    const cancelarVentas = this.deps.colaVentas.suscribir((e) => {
      ventas = e.map((x) => x.operacion);
      emitir();
    });
    return () => {
      activo = false;
      cancelarRemoto();
      cancelarCola();
      cancelarVentas();
    };
  }
}
