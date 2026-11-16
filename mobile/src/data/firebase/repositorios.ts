import {
  addDoc,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  increment,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type Firestore,
  type Query,
  type QuerySnapshot,
} from 'firebase/firestore';

import type { ClienteDatos, ConfigNegocio, ProductoDatos, Venta } from '@/domain/entities';
import type {
  AlError,
  Cancelar,
  RepositorioClientes,
  RepositorioConfig,
  RepositorioFiado,
  RepositorioProductos,
  RemotoFiado,
  RepositorioVentas,
  ResultadoConfirmacion,
} from '@/domain/ports';
import type { AbonoNuevo, CargoNuevo, OperacionMovimiento } from '@/domain/rules/fiado';
import { enRangoEfectivo, rangoConsulta, type RangoFechas } from '@/domain/rules/reportes';
import type { OperacionVenta } from '@/domain/rules/venta';

import { aCliente, aConfig, aMovimiento, aProducto, aVenta, deProducto } from '../mappers';
import type { Rutas } from './rutas';

/** `estimate`: la fecha pendiente de un serverTimestamp se muestra con la hora local. */
const mapear = <T>(
  snap: QuerySnapshot<DocumentData>,
  fn: (id: string, d: DocumentData) => T,
): T[] => snap.docs.map((d) => fn(d.id, d.data({ serverTimestamps: 'estimate' })));

const aError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

/**
 * D-31: con el SDK roto ("AsyncQueue is already failed") `onSnapshot` y su cancelación
 * lanzan de forma síncrona. Ni suscribirse ni cancelar debe tumbar una pantalla (un error en
 * la limpieza de un efecto llega al ErrorBoundary): el error va a `onError` y la
 * cancelación se vuelve inocua. Al recrear la instancia los listeners se vuelven a abrir.
 */
export function escucharSeguro(suscribir: () => Cancelar, onError: AlError): Cancelar {
  let cancelar: Cancelar;
  try {
    cancelar = suscribir();
  } catch (e) {
    onError(aError(e));
    return () => undefined;
  }
  return () => {
    try {
      cancelar();
    } catch {
      // Instancia ya rota o terminada: no hay nada que cancelar.
    }
  };
}

/**
 * Listener que ignora las respuestas "desde caché" hasta que el servidor confirmó una vez.
 * En RN el SDK solo cachea en memoria: al abrir la app sin red responde de inmediato con
 * una lista VACÍA que no es la verdad (y antes borraba la caché persistente, D-05). Hasta
 * que llegue el servidor, la UI usa `CacheCatalogo`. Ya confirmada, la caché en memoria
 * está completa y sí se usa sin red.
 */
export function escucharConfirmado<T>(
  consulta: Query<DocumentData>,
  fn: (id: string, d: DocumentData) => T,
  onDatos: (datos: T[]) => void,
  onError: AlError,
): Cancelar {
  let confirmado = false;
  return escucharSeguro(
    () =>
      onSnapshot(
        consulta,
        (snap) => {
          if (!snap.metadata.fromCache) confirmado = true;
          if (confirmado) onDatos(mapear(snap, fn));
        },
        (e) => onError(aError(e)),
      ),
    onError,
  );
}

export class ProductosFirestore implements RepositorioProductos {
  constructor(private readonly rutas: Rutas) {}

  observar(onDatos: Parameters<RepositorioProductos['observar']>[0], onError: AlError): Cancelar {
    return escucharConfirmado(this.rutas.coleccion('productos'), aProducto, onDatos, onError);
  }

  async crear(datos: ProductoDatos): Promise<string> {
    const ref = await addDoc(this.rutas.coleccion('productos'), deProducto(datos));
    return ref.id;
  }

  actualizar(id: string, datos: ProductoDatos): Promise<void> {
    return updateDoc(doc(this.rutas.coleccion('productos'), id), {
      ...deProducto(datos),
      // Si el usuario borró el código, se elimina el campo (la web nunca lo usa).
      ...(datos.codigoBarras ? {} : { codigoBarras: deleteField() }),
    });
  }

  eliminar(id: string): Promise<void> {
    return deleteDoc(doc(this.rutas.coleccion('productos'), id));
  }
}

export class ClientesFirestore implements RepositorioClientes {
  constructor(private readonly rutas: Rutas) {}

  observar(onDatos: Parameters<RepositorioClientes['observar']>[0], onError: AlError): Cancelar {
    return escucharConfirmado(this.rutas.coleccion('clientes'), aCliente, onDatos, onError);
  }

  async crear(datos: ClienteDatos): Promise<string> {
    const ref = await addDoc(this.rutas.coleccion('clientes'), {
      nombre: datos.nombre,
      telefono: datos.telefono,
    });
    return ref.id;
  }

  actualizar(id: string, datos: ClienteDatos): Promise<void> {
    return updateDoc(doc(this.rutas.coleccion('clientes'), id), {
      nombre: datos.nombre,
      telefono: datos.telefono,
    });
  }
}

/**
 * D-26: se consulta `fecha` (servidor) desde el inicio hasta fin + margen, porque una venta
 * cobrada sin conexión puede sincronizarse días después. Luego se filtra en memoria por
 * fecha efectiva (`creadaEn ?? fecha`) con `soloDelRango`.
 */
const rangoTimestamps = (rango: RangoFechas) => {
  const consulta = rangoConsulta(rango);
  return [
    where('fecha', '>=', Timestamp.fromDate(consulta.inicio)),
    where('fecha', '<=', Timestamp.fromDate(consulta.fin)),
  ] as const;
};

const soloDelRango =
  <T extends { fecha: Date | null; creadaEn?: Date }>(
    rango: RangoFechas,
    onDatos: (d: T[]) => void,
  ) =>
  (datos: T[]) =>
    onDatos(datos.filter((d) => enRangoEfectivo(d, rango)));

/** Hora del teléfono (epoch ms) como Timestamp: campo aditivo `creadaEn` (D-26). */
const creadaEn = (ms: number) => ({ creadaEn: Timestamp.fromMillis(ms) });

export class FiadoFirestore implements RemotoFiado {
  constructor(
    private readonly db: Firestore,
    private readonly rutas: Rutas,
  ) {}

  nuevoId(): string {
    return doc(this.rutas.coleccion('deudas')).id;
  }

  /** Idempotente: si `deudas/{id}` ya existe (reintento tras un timeout), no reescribe. */
  confirmar(op: OperacionMovimiento): Promise<ResultadoConfirmacion> {
    const ref = doc(this.rutas.coleccion('deudas'), op.id);
    return runTransaction(this.db, async (tx) => {
      if ((await tx.get(ref)).exists()) return 'ya-existia' as const;
      tx.set(ref, {
        ...op.datos,
        fecha: serverTimestamp(),
        ...creadaEn(op.creadaEn),
        origen: 'movil',
      });
      return 'escrita' as const;
    });
  }

  observarTodos(
    onDatos: Parameters<RepositorioFiado['observarTodos']>[0],
    onError: AlError,
  ): Cancelar {
    return escucharConfirmado(this.rutas.coleccion('deudas'), aMovimiento, onDatos, onError);
  }

  observarCliente(
    clienteId: string,
    onDatos: Parameters<RepositorioFiado['observarCliente']>[1],
    onError: AlError,
  ): Cancelar {
    return escucharConfirmado(
      query(this.rutas.coleccion('deudas'), where('clienteId', '==', clienteId)),
      aMovimiento,
      onDatos,
      onError,
    );
  }

  /** Solo rango de fecha (índice simple). `monto < 0` se filtra en el dominio (B-06). */
  observarRango(
    rango: RangoFechas,
    onDatos: Parameters<RepositorioFiado['observarRango']>[1],
    onError: AlError,
  ): Cancelar {
    return escucharConfirmado(
      query(this.rutas.coleccion('deudas'), ...rangoTimestamps(rango)),
      aMovimiento,
      soloDelRango(rango, onDatos),
      onError,
    );
  }

  async crearCargo(cargo: CargoNuevo): Promise<string> {
    const ref = await addDoc(this.rutas.coleccion('deudas'), {
      ...cargo,
      fecha: serverTimestamp(),
      origen: 'movil',
    });
    return ref.id;
  }

  async crearAbono(abono: AbonoNuevo): Promise<string> {
    const ref = await addDoc(this.rutas.coleccion('deudas'), {
      ...abono,
      fecha: serverTimestamp(),
      origen: 'movil',
    });
    return ref.id;
  }

  eliminar(id: string): Promise<void> {
    return deleteDoc(doc(this.rutas.coleccion('deudas'), id));
  }
}

export class VentasFirestore implements RepositorioVentas {
  constructor(
    private readonly db: Firestore,
    private readonly rutas: Rutas,
  ) {}

  nuevoId(): string {
    return doc(this.rutas.coleccion('ventas')).id;
  }

  nuevoIdCargo(): string {
    return doc(this.rutas.coleccion('deudas')).id;
  }

  /**
   * Transacción idempotente (D-05): lee `ventas/{ventaId}`; si ya existe no hace nada.
   * Si no, escribe venta + cargo fiado + `increment(-n)` en cada producto, todo o nada
   * (corrige B-03). Productos eliminados mientras la venta estaba pendiente se omiten.
   */
  confirmar(op: OperacionVenta): Promise<ResultadoConfirmacion> {
    const ventaRef = doc(this.rutas.coleccion('ventas'), op.ventaId);
    return runTransaction(this.db, async (tx) => {
      const existente = await tx.get(ventaRef);
      if (existente.exists()) return 'ya-existia' as const;

      const productosRefs = op.deltasStock.map((d) => ({
        ref: doc(this.rutas.coleccion('productos'), d.productoId),
        delta: d.delta,
      }));
      const productos = await Promise.all(productosRefs.map((p) => tx.get(p.ref)));

      // `fecha` sigue siendo serverTimestamp (las reglas exigen fecha == request.time);
      // `creadaEn` guarda la hora real del cobro para los reportes (D-26).
      tx.set(ventaRef, { ...op.venta, fecha: serverTimestamp(), ...creadaEn(op.creadaEn) });
      if (op.cargo && op.cargoId) {
        tx.set(doc(this.rutas.coleccion('deudas'), op.cargoId), {
          ...op.cargo,
          fecha: serverTimestamp(),
          ...creadaEn(op.creadaEn),
          origen: 'movil',
        });
      }
      productosRefs.forEach((p, i) => {
        const snap = productos[i];
        // Igual que la web: stock null (no controlado) no se toca.
        if (snap?.exists() && snap.get('stock') !== null && snap.get('stock') !== undefined) {
          tx.update(p.ref, { stock: increment(p.delta) });
        }
      });
      return 'escrita' as const;
    });
  }

  /**
   * Contraasiento + devolución de stock + borrado del cargo fiado, en una transacción.
   * Las reglas propuestas (D-12) solo permiten crear ventas: no se edita ni borra la
   * original. El cargo se busca antes (las transacciones del SDK web no admiten consultas).
   */
  async anular(op: OperacionVenta, original: Venta): Promise<ResultadoConfirmacion> {
    const ventaRef = doc(this.rutas.coleccion('ventas'), op.ventaId);
    const cargos =
      original.metodoDePago === 'Fiado'
        ? (
            await getDocs(
              query(this.rutas.coleccion('deudas'), where('ventaId', '==', original.id)),
            )
          ).docs
        : [];
    return runTransaction(this.db, async (tx) => {
      const existente = await tx.get(ventaRef);
      if (existente.exists()) return 'ya-existia' as const;

      const productosRefs = op.deltasStock.map((d) => ({
        ref: doc(this.rutas.coleccion('productos'), d.productoId),
        delta: d.delta,
      }));
      const productos = await Promise.all(productosRefs.map((p) => tx.get(p.ref)));

      tx.set(ventaRef, { ...op.venta, fecha: serverTimestamp(), ...creadaEn(op.creadaEn) });
      productosRefs.forEach((p, i) => {
        const snap = productos[i];
        if (snap?.exists() && snap.get('stock') !== null && snap.get('stock') !== undefined) {
          tx.update(p.ref, { stock: increment(p.delta) });
        }
      });
      // Los abonos ya hechos a ese cargo se conservan: quedan como saldo a favor del cliente.
      cargos.forEach((c) => tx.delete(c.ref));
      return 'escrita' as const;
    });
  }

  observarRango(
    rango: RangoFechas,
    onDatos: Parameters<RepositorioVentas['observarRango']>[1],
    onError: AlError,
  ): Cancelar {
    return escucharSeguro(
      () =>
        onSnapshot(
          query(this.rutas.coleccion('ventas'), ...rangoTimestamps(rango)),
          (snap) => soloDelRango(rango, onDatos)(mapear(snap, aVenta)),
          (e) => onError(aError(e)),
        ),
      onError,
    );
  }
}

export class ConfigFirestore implements RepositorioConfig {
  constructor(private readonly rutas: Rutas) {}

  observar(onDatos: (c: ConfigNegocio) => void, onError: AlError): Cancelar {
    return escucharSeguro(
      () =>
        onSnapshot(
          this.rutas.configNegocio(),
          (snap) => onDatos(aConfig(snap.data())),
          (e) => onError(aError(e)),
        ),
      onError,
    );
  }

  guardar(config: ConfigNegocio): Promise<void> {
    return setDoc(this.rutas.configNegocio(), { ...config }, { merge: true });
  }
}
