import {
  armarAnulacion,
  CAMPOS_CONSULTA_RANGO,
  sellarMovimientoFiado,
  sellarVenta,
  type OperacionVenta,
} from '@bodegon/core';
import {
  addDoc,
  deleteDoc,
  doc,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

import { actualizarDatos, type FuenteDatos } from './datos';
import { auth, db } from './firebase';
import { registrarListener } from './listeners';
import { debeDescontarStock } from './logic/equipo';
import { unirConsultasRango } from './logic/rango';
import { aCliente, aMovimiento, aProducto, aVenta, porNombre } from './mappers';
import { aCaja, aMovimientoCaja, escrituraCaja, sellarEscrituraCaja } from './mappersCaja';
import { sesionActual } from './sesion';
import {
  getCajasCol,
  getClientesCol,
  getConfigNegocioDoc,
  getDeudasCol,
  getMovimientosCajaCol,
  getProductosCol,
  getVentasCol,
} from './store';

/**
 * Autoría (D-33): cada escritura lleva quién la hizo (`sellar*` del core con la sesión). Las
 * reglas la exigen al cajero y la aceptan del dueño. Rutas: `users/{bodega}` (store.ts), que
 * para el cajero es la bodega del dueño.
 *
 * Listeners de la sesión: UNO por colección (productos, clientes, libro de fiado y
 * config/negocio), registrados en listeners.ts para cerrarlos todos al salir (B-05).
 */
export function abrirListenersSesion(alError: (mensaje: string) => void): void {
  registrarListener(
    onSnapshot(
      query(getProductosCol()),
      (s) => actualizarDatos({ productos: s.docs.map((d) => aProducto(d.id, d.data())).sort(porNombre) }),
      (e) => {
        console.error('Error al cargar productos:', e);
        alError('No pudimos cargar tus productos. Revisa tu conexión.');
      },
    ),
  );
  registrarListener(
    onSnapshot(
      query(getClientesCol()),
      (s) => actualizarDatos({ clientes: s.docs.map((d) => aCliente(d.id, d.data())).sort(porNombre) }),
      (e) => {
        console.error('Error al cargar clientes:', e);
        alError('No pudimos cargar tus clientes. Revisa tu conexión.');
      },
    ),
  );
  registrarListener(
    onSnapshot(
      query(getDeudasCol()),
      (s) =>
        // 'estimate': un movimiento recién escrito ya tiene fecha (y su lugar en el historial).
        actualizarDatos({
          movimientos: s.docs.map((d) => aMovimiento(d.id, d.data({ serverTimestamps: 'estimate' }))),
        }),
      (e) => {
        console.error('Error al cargar el cuaderno de fiados:', e);
        alError('No pudimos cargar el cuaderno de fiados. Revisa tu conexión.');
      },
    ),
  );
  // Caja (D-28): pocas sesiones por usuario. 'estimate': la apertura recién escrita ya tiene hora.
  registrarListener(
    onSnapshot(
      query(getCajasCol()),
      (s) => actualizarDatos({ cajas: s.docs.map((d) => aCaja(d.id, d.data({ serverTimestamps: 'estimate' }))) }),
      (e) => {
        console.error('Error al cargar la caja:', e);
        alError('No pudimos cargar la caja. Revisa tu conexión.');
      },
    ),
  );
  // config/negocio (lo crea la app móvil): nombre para el ticket y el recordatorio.
  registrarListener(
    onSnapshot(
      getConfigNegocioDoc(),
      (snap) => {
        const nombre = snap.exists() ? snap.data().nombre : null;
        actualizarDatos({ nombreBodega: typeof nombre === 'string' && nombre.trim() ? nombre : null });
      },
      () => actualizarDatos({ nombreBodega: null }),
    ),
  );
}

export const fuenteFirestore: FuenteDatos = {
  nuevoIdVenta: () => doc(getVentasCol()).id,
  nuevoIdCargo: () => doc(getDeudasCol()).id,

  async cobrar(op: OperacionVenta) {
    // Transacción atómica: venta + cargo de fiado + stock, todo o nada (B-03).
    const sesion = sesionActual();
    await runTransaction(db, async (tx) => {
      const refs = op.deltasStock.map((d) => doc(getProductosCol(), d.productoId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      tx.set(doc(getVentasCol(), op.ventaId), sellarVenta({ ...op.venta, fecha: serverTimestamp() }, sesion));
      if (op.cargo && op.cargoId) {
        // El cargo lleva `ventaId`: las reglas del cajero lo comparan con SU venta fiada.
        tx.set(doc(getDeudasCol(), op.cargoId), sellarMovimientoFiado({ ...op.cargo, fecha: serverTimestamp() }, sesion));
      }
      // B-10: solo descuenta stock de productos que existen y tienen stock controlado. El cajero,
      // además, solo baja stock numérico (D-33): un `null` no se toca.
      snaps.forEach((snap, i) => {
        const ref = refs[i];
        const delta = op.deltasStock[i]?.delta;
        if (!ref || delta === undefined || !snap.exists()) return;
        if (!debeDescontarStock(snap.data().stock, delta, sesion)) return;
        tx.update(ref, { stock: increment(delta) });
      });
    });
  },

  async deshacerVenta(op: OperacionVenta) {
    // Contraasiento del core (id fijo "{venta}-anulada": no se puede anular dos veces) con el
    // mismo patrón que la app móvil: stock devuelto y el cargo de fiado de ESA venta borrado,
    // en la misma transacción. Las reglas permiten exactamente esto.
    const anulacion = armarAnulacion(
      { id: op.ventaId, ...op.venta, fecha: new Date(op.creadaEn) },
      'Deshecha al momento',
      Date.now(),
    );
    await runTransaction(db, async (tx) => {
      const ventaRef = doc(getVentasCol(), anulacion.ventaId);
      const existente = await tx.get(ventaRef);
      if (existente.exists()) return; // ya deshecha (doble clic o reintento)
      const refs = anulacion.deltasStock.map((d) => doc(getProductosCol(), d.productoId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      // Anular es solo del dueño (las reglas lo niegan al cajero); queda sellada con su nombre.
      tx.set(ventaRef, sellarVenta({ ...anulacion.venta, fecha: serverTimestamp() }, sesionActual()));
      snaps.forEach((snap, i) => {
        const ref = refs[i];
        const delta = anulacion.deltasStock[i]?.delta;
        if (!ref || delta === undefined || !snap.exists()) return;
        const stock = snap.data().stock;
        if (stock === null || stock === undefined) return;
        tx.update(ref, { stock: increment(delta) });
      });
      if (op.cargoId) tx.delete(doc(getDeudasCol(), op.cargoId));
    });
  },

  async guardarProducto(id, p) {
    if (id) await updateDoc(doc(getProductosCol(), id), { ...p });
    else await addDoc(getProductosCol(), { ...p });
  },
  async eliminarProducto(id) {
    await deleteDoc(doc(getProductosCol(), id));
  },
  async ajustarStock(id, delta) {
    // Las reglas permiten un update que solo cambia `stock`.
    await updateDoc(doc(getProductosCol(), id), { stock: increment(delta) });
  },
  async guardarCliente(id, c) {
    if (id) {
      await updateDoc(doc(getClientesCol(), id), { ...c });
      return id;
    }
    return (await addDoc(getClientesCol(), { ...c })).id;
  },
  async registrarMovimiento(m) {
    await addDoc(getDeudasCol(), sellarMovimientoFiado({ ...m, fecha: serverTimestamp() }, sesionActual()));
  },
  async eliminarMovimiento(id) {
    await deleteDoc(doc(getDeudasCol(), id));
  },
  async marcarRecordatorio(clienteId) {
    // D-27: hora de este equipo (las reglas aceptan hasta 1 día en el futuro).
    await updateDoc(doc(getClientesCol(), clienteId), { ultimoRecordatorio: Timestamp.now() });
  },

  observarRango(rango, onDatos, onError) {
    // D-32: una consulta por `fecha` y otra por `creadaEn` (mismo rango, índices simples) en
    // cada colección; se unen por id y se filtran por fecha efectiva. Una venta cobrada sin
    // conexión hace semanas cae en su día real, no en el de la sincronización.
    const desde = Timestamp.fromDate(rango.inicio);
    const hasta = Timestamp.fromDate(rango.fin);
    const n = CAMPOS_CONSULTA_RANGO.length;
    const ventas: (ReturnType<typeof aVenta>[] | null)[] = Array.from({ length: n }, () => null);
    const movimientos: (ReturnType<typeof aMovimiento>[] | null)[] = Array.from({ length: n }, () => null);
    const emitir = () => {
      if (!ventas.every(Boolean) || !movimientos.every(Boolean)) return;
      const u = unirConsultasRango(
        ventas as ReturnType<typeof aVenta>[][],
        movimientos as ReturnType<typeof aMovimiento>[][],
        rango,
      );
      onDatos(u.ventas, u.movimientos);
    };

    const cancelaciones = CAMPOS_CONSULTA_RANGO.flatMap((campo, i) => [
      registrarListener(
        onSnapshot(
          query(getVentasCol(), where(campo, '>=', desde), where(campo, '<=', hasta)),
          (s) => {
            ventas[i] = s.docs.map((d) => aVenta(d.id, d.data({ serverTimestamps: 'estimate' })));
            emitir();
          },
          (e) => {
            console.error('Error en listener de ventas:', e);
            onError('No pudimos traer las ventas. Revisa tu conexión.');
          },
        ),
      ),
      // B-06: sin filtro monto<0 (requeriría índice compuesto); el core filtra en memoria.
      registrarListener(
        onSnapshot(
          query(getDeudasCol(), where(campo, '>=', desde), where(campo, '<=', hasta)),
          (s) => {
            movimientos[i] = s.docs.map((d) => aMovimiento(d.id, d.data({ serverTimestamps: 'estimate' })));
            emitir();
          },
          (e) => {
            console.error('Error en listener de deudas:', e);
            onError('No pudimos traer los abonos. Revisa tu conexión.');
          },
        ),
      ),
    ]);
    return () => cancelaciones.forEach((c) => c());
  },

  nuevoIdCaja: () => doc(getCajasCol()).id,
  nuevoIdMovimientoCaja: (cajaId) => doc(getMovimientosCajaCol(cajaId)).id,

  async guardarCaja(op) {
    // Igual que mobile/src/data/firebase/cajaFirestore.ts: transacción idempotente con el id
    // generado aquí. `fecha` = serverTimestamp (las reglas exigen request.time) y
    // `creadaEn` = hora de este equipo (D-26).
    const w = sellarEscrituraCaja(
      escrituraCaja(op, serverTimestamp(), Timestamp.fromMillis(op.creadaEn)),
      sesionActual(),
    );
    const cajaRef = doc(getCajasCol(), w.cajaId);
    await runTransaction(db, async (tx) => {
      switch (w.tipo) {
        case 'crear-caja': {
          if ((await tx.get(cajaRef)).exists()) return; // reintento: ya estaba
          tx.set(cajaRef, w.datos);
          return;
        }
        case 'crear-movimiento': {
          const ref = doc(getMovimientosCajaCol(w.cajaId), w.movimientoId);
          if ((await tx.get(ref)).exists()) return;
          tx.set(ref, w.datos);
          return;
        }
        case 'cerrar-caja': {
          const snap = await tx.get(cajaRef);
          if (!snap.exists()) throw new Error('La caja no existe en el servidor');
          // Ya cerrada (reintento u otro equipo): las reglas no permiten tocarla otra vez.
          if (snap.get('estado') === 'cerrada') return;
          tx.update(cajaRef, w.datos);
          return;
        }
      }
    });
  },

  observarMovimientosCaja(cajaId, onDatos, onError) {
    return registrarListener(
      onSnapshot(
        query(getMovimientosCajaCol(cajaId)),
        (s) => onDatos(s.docs.map((d) => aMovimientoCaja(cajaId, d.id, d.data({ serverTimestamps: 'estimate' })))),
        (e) => {
          console.error('Error en listener de movimientos de caja:', e);
          onError('No pudimos traer los movimientos de la caja. Revisa tu conexión.');
        },
      ),
    );
  },

  async cerrarSesion() {
    await signOut(auth);
  },
};
