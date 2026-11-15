import { armarAnulacion, rangoConsulta, type OperacionVenta } from '@bodegon/core';
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
import { aCliente, aMovimiento, aProducto, aVenta, porNombre } from './mappers';
import {
  getClientesCol,
  getConfigNegocioDoc,
  getDeudasCol,
  getProductosCol,
  getVentasCol,
} from './store';

/**
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
    await runTransaction(db, async (tx) => {
      const refs = op.deltasStock.map((d) => doc(getProductosCol(), d.productoId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      tx.set(doc(getVentasCol(), op.ventaId), { ...op.venta, fecha: serverTimestamp() });
      if (op.cargo && op.cargoId) {
        tx.set(doc(getDeudasCol(), op.cargoId), { ...op.cargo, fecha: serverTimestamp() });
      }
      // B-10: solo descuenta stock de productos que existen y tienen stock controlado.
      snaps.forEach((snap, i) => {
        const ref = refs[i];
        const delta = op.deltasStock[i]?.delta;
        if (!ref || delta === undefined || !snap.exists()) return;
        const stock = snap.data().stock;
        if (stock === null || stock === undefined) return;
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

      tx.set(ventaRef, { ...anulacion.venta, fecha: serverTimestamp() });
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
    await addDoc(getDeudasCol(), { ...m, fecha: serverTimestamp() });
  },
  async eliminarMovimiento(id) {
    await deleteDoc(doc(getDeudasCol(), id));
  },
  async marcarRecordatorio(clienteId) {
    // D-27: hora de este equipo (las reglas aceptan hasta 1 día en el futuro).
    await updateDoc(doc(getClientesCol(), clienteId), { ultimoRecordatorio: Timestamp.now() });
  },

  observarRango(rango, onDatos, onError) {
    // D-26: se consulta por `fecha` hasta fin + margen (ventas sin conexión sincronizadas
    // después); el core filtra por fecha efectiva.
    const consulta = rangoConsulta(rango);
    const desde = Timestamp.fromDate(consulta.inicio);
    const hasta = Timestamp.fromDate(consulta.fin);
    let ventas: ReturnType<typeof aVenta>[] = [];
    let movimientos: ReturnType<typeof aMovimiento>[] = [];
    let listas = { ventas: false, movimientos: false };
    const emitir = () => {
      if (listas.ventas && listas.movimientos) onDatos(ventas, movimientos);
    };

    const cancelarVentas = registrarListener(
      onSnapshot(
        query(getVentasCol(), where('fecha', '>=', desde), where('fecha', '<=', hasta)),
        (s) => {
          ventas = s.docs.map((d) => aVenta(d.id, d.data({ serverTimestamps: 'estimate' })));
          listas = { ...listas, ventas: true };
          emitir();
        },
        (e) => {
          console.error('Error en listener de ventas:', e);
          onError('No pudimos traer las ventas. Revisa tu conexión.');
        },
      ),
    );
    // B-06: sin filtro monto<0 (requeriría índice compuesto); el core filtra en memoria.
    const cancelarDeudas = registrarListener(
      onSnapshot(
        query(getDeudasCol(), where('fecha', '>=', desde), where('fecha', '<=', hasta)),
        (s) => {
          movimientos = s.docs.map((d) => aMovimiento(d.id, d.data({ serverTimestamps: 'estimate' })));
          listas = { ...listas, movimientos: true };
          emitir();
        },
        (e) => {
          console.error('Error en listener de deudas:', e);
          onError('No pudimos traer los abonos. Revisa tu conexión.');
        },
      ),
    );
    return () => {
      cancelarVentas();
      cancelarDeudas();
    };
  },

  async cerrarSesion() {
    await signOut(auth);
  },
};
