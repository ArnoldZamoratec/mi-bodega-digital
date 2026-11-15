import type { AlError, Cancelar, Cola } from '@/domain/ports';
import type { RemotoCaja, RepositorioCaja } from '@/domain/portsCaja';
import {
  cajasConPendientes,
  movimientosCajaConPendientes,
  type Caja,
  type MovimientoCaja,
  type OperacionCaja,
} from '@/domain/rules/caja';

import { revivirCaja, revivirMovimientoCaja } from '../mappersCaja';
import { ColaPersistente, type AlmacenClaveValor } from './colaVentas';

/** Outbox de la caja (D-28). Clave propia por usuario: no toca ventas ni fiado. */
export class ColaCajaPersistente extends ColaPersistente<OperacionCaja> {
  constructor(almacen: AlmacenClaveValor, uid: string) {
    super(almacen, `bodega:outbox-caja:${uid}`, (op) => op.id);
  }
}

export type ColaCaja = Cola<OperacionCaja>;

interface Dependencias {
  remoto: RemotoCaja;
  cola: ColaCaja;
  sincronizar: () => unknown;
  enLinea: () => boolean;
  /** Última copia confirmada, para abrir la pantalla sin red tras reiniciar (D-05). */
  cache?: {
    leer<T>(nombre: string): Promise<T[] | null>;
    guardar<T>(nombre: string, datos: readonly T[]): Promise<void>;
  };
}

const CACHE_CAJAS = 'cajas';
const cacheMovimientos = (cajaId: string) => `caja-movimientos:${cajaId}`;

/**
 * Caja "outbox-first", igual que el fiado (D-24): abrir, registrar un movimiento o cerrar
 * se guarda primero en el teléfono y la pantalla responde al instante. Las lecturas unen
 * lo confirmado con lo pendiente.
 */
export class CajaOffline implements RepositorioCaja {
  constructor(private readonly deps: Dependencias) {}

  nuevoId(): string {
    return this.deps.remoto.nuevoId();
  }

  nuevoIdMovimiento(cajaId: string): string {
    return this.deps.remoto.nuevoIdMovimiento(cajaId);
  }

  async guardar(op: OperacionCaja): Promise<void> {
    await this.deps.cola.agregar(op);
    if (this.deps.enLinea()) void this.deps.sincronizar();
  }

  observarCajas(onDatos: (cajas: Caja[]) => void, onError: AlError): Cancelar {
    return this.combinar<Caja>(
      CACHE_CAJAS,
      revivirCaja,
      (cb) => this.deps.remoto.observarCajas(cb, onError),
      (remotas, ops) => cajasConPendientes(remotas, ops),
      onDatos,
    );
  }

  observarMovimientos(
    cajaId: string,
    onDatos: (movimientos: MovimientoCaja[]) => void,
    onError: AlError,
  ): Cancelar {
    return this.combinar<MovimientoCaja>(
      cacheMovimientos(cajaId),
      revivirMovimientoCaja,
      (cb) => this.deps.remoto.observarMovimientos(cajaId, cb, onError),
      (remotos, ops) => movimientosCajaConPendientes(remotos, ops, cajaId),
      onDatos,
    );
  }

  /**
   * Emite solo con una base completa (servidor o, sin red, la última copia guardada), como
   * `FiadoOffline`: un esperado calculado sin los movimientos confirmados sería falso.
   */
  private combinar<T>(
    claveCache: string,
    revivir: (t: T) => T,
    suscribirRemoto: (cb: (datos: T[]) => void) => Cancelar,
    unir: (remotos: T[], ops: OperacionCaja[]) => T[],
    onDatos: (datos: T[]) => void,
  ): Cancelar {
    let remotos: T[] | null = null;
    let activo = true;
    let ops: OperacionCaja[] = [];

    const emitir = () => {
      if (remotos) onDatos(unir(remotos, ops));
    };

    void this.deps.cache?.leer<T>(claveCache).then((guardados) => {
      if (!activo || remotos || !guardados) return;
      remotos = guardados.map(revivir);
      emitir();
    });
    const cancelarRemoto = suscribirRemoto((datos) => {
      remotos = datos;
      void this.deps.cache?.guardar(claveCache, datos);
      emitir();
    });
    const cancelarCola = this.deps.cola.suscribir((e) => {
      ops = e.map((x) => x.operacion);
      emitir();
    });
    return () => {
      activo = false;
      cancelarRemoto();
      cancelarCola();
    };
  }
}
