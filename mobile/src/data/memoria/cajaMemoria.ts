import type { Cliente } from '@/domain/entities';
import type { AlError, Cancelar, ResultadoConfirmacion } from '@/domain/ports';
import type { RemotoCaja } from '@/domain/portsCaja';
import type { RepositorioRecordatorios } from '@/domain/portsCobranza';
import type { Caja, MovimientoCaja, OperacionCaja } from '@/domain/rules/caja';

import { ErrorSimulado, type BaseDatosMemoria } from './repositoriosMemoria';

/**
 * Caja en memoria con la misma semántica que `CajaFirestore` (transacción idempotente,
 * caja cerrada inmutable). Para pruebas de integración y de UI.
 */
export class CajaMemoria implements RemotoCaja {
  cajas = new Map<string, Caja>();
  movimientos = new Map<string, MovimientoCaja>();
  escrituras = 0;
  private secuencia = 0;
  private readonly oyentes = new Set<() => void>();

  constructor(private readonly db: BaseDatosMemoria) {}

  nuevoId(): string {
    return `caja-${++this.secuencia}`;
  }

  nuevoIdMovimiento(cajaId: string): string {
    return `${cajaId}-mov-${++this.secuencia}`;
  }

  async confirmar(op: OperacionCaja): Promise<ResultadoConfirmacion> {
    if (this.db.modo === 'sin-red') throw new ErrorSimulado('unavailable');
    if (this.db.modo === 'sin-permiso') throw new ErrorSimulado('permission-denied');
    if (this.db.modo === 'colgado') return new Promise<never>(() => undefined);
    const fecha = this.db.reloj();
    const creadaEn = new Date(op.creadaEn);
    const resultado = ((): ResultadoConfirmacion => {
      switch (op.tipo) {
        case 'abrir':
          if (this.cajas.has(op.cajaId)) return 'ya-existia';
          this.cajas.set(op.cajaId, {
            id: op.cajaId,
            estado: 'abierta',
            apertura: { monto: op.monto, fecha, creadaEn },
          });
          return 'escrita';
        case 'movimiento': {
          if (this.movimientos.has(op.id)) return 'ya-existia';
          const caja = this.cajas.get(op.cajaId);
          // Igual que las reglas: solo se agregan movimientos a una caja abierta.
          if (!caja || caja.estado !== 'abierta') throw new ErrorSimulado('permission-denied');
          this.movimientos.set(op.id, {
            id: op.id,
            cajaId: op.cajaId,
            ...op.movimiento,
            fecha,
            creadaEn,
          });
          return 'escrita';
        }
        case 'cerrar': {
          const caja = this.cajas.get(op.cajaId);
          if (!caja) throw new ErrorSimulado('failed-precondition');
          if (caja.estado === 'cerrada') return 'ya-existia';
          this.cajas.set(op.cajaId, {
            ...caja,
            estado: 'cerrada',
            cierre: { ...op.cierre, fecha, creadaEn },
          });
          return 'escrita';
        }
      }
    })();
    if (resultado === 'escrita') {
      this.escrituras += 1;
      this.oyentes.forEach((o) => o());
    }
    return resultado;
  }

  private escuchar(emitir: () => void): Cancelar {
    emitir();
    this.oyentes.add(emitir);
    return () => {
      this.oyentes.delete(emitir);
    };
  }

  observarCajas(onDatos: (cajas: Caja[]) => void, _onError?: AlError): Cancelar {
    return this.escuchar(() => onDatos([...this.cajas.values()]));
  }

  observarMovimientos(
    cajaId: string,
    onDatos: (m: MovimientoCaja[]) => void,
    _onError?: AlError,
  ): Cancelar {
    return this.escuchar(() =>
      onDatos([...this.movimientos.values()].filter((m) => m.cajaId === cajaId)),
    );
  }
}

/** Anota recordatorios sobre una lista de clientes en memoria. */
export class RecordatoriosMemoria implements RepositorioRecordatorios {
  readonly registrados: { clienteId: string; fecha: Date }[] = [];

  constructor(private readonly clientes?: Map<string, Cliente>) {}

  async registrar(clienteId: string, fecha: Date): Promise<void> {
    this.registrados.push({ clienteId, fecha });
    const c = this.clientes?.get(clienteId);
    if (c) this.clientes?.set(clienteId, { ...c, ultimoRecordatorio: fecha });
  }
}
