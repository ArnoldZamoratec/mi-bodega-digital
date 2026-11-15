import {
  collection,
  doc,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

import type { AlError, Cancelar, ResultadoConfirmacion } from '@/domain/ports';
import type { RemotoCaja } from '@/domain/portsCaja';
import type { RepositorioRecordatorios } from '@/domain/portsCobranza';
import type { Caja, MovimientoCaja, OperacionCaja } from '@/domain/rules/caja';

import { aCaja, aMovimientoCaja } from '../mappersCaja';
import { escucharConfirmado } from './repositorios';
import type { Rutas } from './rutas';

/**
 * Caja en Firestore (D-28), bajo el mismo uid:
 *   cajas/{cajaId}                   documento de la sesión
 *   cajas/{cajaId}/movimientos/{id}  ingresos y egresos manuales (solo se crean)
 * Cada escritura es una transacción idempotente con id generado en el teléfono, como las
 * ventas (D-05): reenviar desde el outbox nunca duplica.
 */
export class CajaFirestore implements RemotoCaja {
  constructor(
    private readonly db: Firestore,
    private readonly rutas: Rutas,
  ) {}

  private cajas() {
    return collection(this.db, `${this.rutas.base()}/cajas`);
  }

  private movimientos(cajaId: string) {
    return collection(this.db, `${this.rutas.base()}/cajas/${cajaId}/movimientos`);
  }

  nuevoId(): string {
    return doc(this.cajas()).id;
  }

  nuevoIdMovimiento(cajaId: string): string {
    return doc(this.movimientos(cajaId)).id;
  }

  confirmar(op: OperacionCaja): Promise<ResultadoConfirmacion> {
    const cajaRef = doc(this.cajas(), op.cajaId);
    const creadaEn = Timestamp.fromMillis(op.creadaEn);
    return runTransaction(this.db, async (tx) => {
      switch (op.tipo) {
        case 'abrir': {
          if ((await tx.get(cajaRef)).exists()) return 'ya-existia' as const;
          tx.set(cajaRef, {
            estado: 'abierta',
            // `fecha` del servidor (las reglas exigen request.time) y la hora real (D-26).
            apertura: { monto: op.monto, fecha: serverTimestamp(), creadaEn },
            origen: 'movil',
          });
          return 'escrita' as const;
        }
        case 'movimiento': {
          const ref = doc(this.movimientos(op.cajaId), op.id);
          if ((await tx.get(ref)).exists()) return 'ya-existia' as const;
          tx.set(ref, { ...op.movimiento, fecha: serverTimestamp(), creadaEn });
          return 'escrita' as const;
        }
        case 'cerrar': {
          const snap = await tx.get(cajaRef);
          // Su apertura nunca llegó (p. ej. quedó bloqueada): error permanente, así la entrada
          // queda visible y no frena al resto del outbox reintentando para siempre.
          if (!snap.exists()) {
            throw Object.assign(new Error('La caja no existe en el servidor'), {
              code: 'failed-precondition',
            });
          }
          // Ya cerrada (reintento): las reglas no permiten tocar una caja cerrada.
          if (snap.exists() && snap.get('estado') === 'cerrada') return 'ya-existia' as const;
          tx.update(cajaRef, {
            estado: 'cerrada',
            cierre: { ...op.cierre, fecha: serverTimestamp(), creadaEn },
          });
          return 'escrita' as const;
        }
      }
    });
  }

  observarCajas(onDatos: (cajas: Caja[]) => void, onError: AlError): Cancelar {
    return escucharConfirmado(this.cajas(), aCaja, onDatos, onError);
  }

  observarMovimientos(
    cajaId: string,
    onDatos: (movimientos: MovimientoCaja[]) => void,
    onError: AlError,
  ): Cancelar {
    return escucharConfirmado(
      this.movimientos(cajaId),
      (id, d) => aMovimientoCaja(cajaId, id, d),
      onDatos,
      onError,
    );
  }
}

/**
 * `clientes/{id}.ultimoRecordatorio` (D-27). No se espera al servidor: con el SDK en
 * memoria, sin señal la promesa de `updateDoc` no termina hasta reconectar, pero el
 * listener ya muestra el cambio. Un fallo (p. ej. permisos) solo se registra: el
 * recordatorio ya salió por WhatsApp y no debe mostrarse como error.
 */
export class RecordatoriosFirestore implements RepositorioRecordatorios {
  constructor(private readonly rutas: Rutas) {}

  async registrar(clienteId: string, fecha: Date): Promise<void> {
    updateDoc(doc(this.rutas.coleccion('clientes'), clienteId), {
      ultimoRecordatorio: Timestamp.fromDate(fecha),
    }).catch((e: unknown) => {
      console.warn('No se pudo anotar el recordatorio', e);
    });
  }
}
