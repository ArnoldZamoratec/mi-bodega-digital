// Pruebas de las reglas propuestas (D-12) con el emulador de Firestore.
// Reproducen exactamente las escrituras que hacen la web v5.3 y la app móvil.
import { readFileSync } from 'node:fs';
import { after, before, beforeEach, describe, it } from 'node:test';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

const APP = 'mi-bodega-app';
const base = (uid) => `artifacts/${APP}/users/${uid}`;

// `emulators:exec` define FIRESTORE_EMULATOR_HOST; si no, el puerto de firebase.json.
const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8085').split(':');

let entorno;

before(async () => {
  entorno = await initializeTestEnvironment({
    projectId: 'demo-mi-bodega',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host, port: Number(port) },
  });
});

after(async () => {
  await entorno.cleanup();
});

beforeEach(async () => {
  await entorno.clearFirestore();
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${base('ana')}/productos/arroz`), {
      nombre: 'Arroz',
      precio: 4.2,
      stock: 10,
    });
    await setDoc(doc(db, `${base('ana')}/productos/pan`), {
      nombre: 'Pan',
      precio: 0.3,
      stock: null,
    });
    await setDoc(doc(db, `${base('ana')}/clientes/rosa`), { nombre: 'Rosa', telefono: '' });
    await setDoc(doc(db, `${base('ana')}/deudas/d1`), {
      clienteId: 'rosa',
      monto: 10,
      descripcion: 'Gaseosa',
      pagado: false,
    });
  });
});

const comoAna = () => entorno.authenticatedContext('ana').firestore();
const comoBeto = () => entorno.authenticatedContext('beto').firestore();
const anonimo = () => entorno.unauthenticatedContext().firestore();

describe('aislamiento entre bodegas (cierra R-01)', () => {
  it('el dueño lee sus datos', async () => {
    await assertSucceeds(getDoc(doc(comoAna(), `${base('ana')}/productos/arroz`)));
  });

  it('otro usuario autenticado NO lee ni escribe datos ajenos', async () => {
    await assertFails(getDoc(doc(comoBeto(), `${base('ana')}/productos/arroz`)));
    await assertFails(
      setDoc(doc(comoBeto(), `${base('ana')}/productos/x`), { nombre: 'X', precio: 1, stock: 1 }),
    );
  });

  it('sin sesión no hay acceso', async () => {
    await assertFails(getDoc(doc(anonimo(), `${base('ana')}/productos/arroz`)));
  });

  it('rutas fuera de artifacts/{app}/users/{uid} quedan cerradas', async () => {
    await assertFails(setDoc(doc(comoAna(), 'otra/coleccion'), { a: 1 }));
  });
});

describe('compatibilidad con la web v5.3', () => {
  it('inventario: addDoc / updateDoc con {nombre, precio, stock} y stock vacío (null)', async () => {
    const db = comoAna();
    const ref = await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/productos`), {
        nombre: 'Leche',
        precio: 3.9,
        stock: null,
      }),
    );
    await assertSucceeds(updateDoc(ref, { nombre: 'Leche Gloria', precio: 4.1, stock: 12 }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('venta de la web: addDoc venta + cargo fiado + increment(-n) de stock', async () => {
    const db = comoAna();
    const venta = await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/ventas`), {
        items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 2 }],
        total: 8.4,
        metodoDePago: 'Fiado',
        clienteId: 'rosa',
        fecha: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/deudas`), {
        clienteId: 'rosa',
        monto: 8.4,
        descripcion: 'Arroz (x2)',
        fecha: serverTimestamp(),
        ventaId: venta.id,
        pagado: false,
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/productos/arroz`), { stock: increment(-2) }),
    );
    // B-10: la web también hace increment sobre stock null; debe seguir permitido.
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/productos/pan`), { stock: increment(-1) }),
    );
  });

  it('fiado de la web: abono, botón "Pagar" (solo pagado) y eliminar movimiento', async () => {
    const db = comoAna();
    await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/deudas`), {
        clienteId: 'rosa',
        monto: -10,
        descripcion: 'Pago',
        fecha: serverTimestamp(),
        pagado: false,
        metodoPago: 'Efectivo',
      }),
    );
    await assertSucceeds(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { pagado: true }));
    await assertSucceeds(deleteDoc(doc(db, `${base('ana')}/deudas/d1`)));
  });

  it('clientes de la web: crear y editar {nombre, telefono}', async () => {
    const db = comoAna();
    await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/clientes`), { nombre: 'Juan', telefono: '999888777' }),
    );
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/clientes/rosa`), { nombre: 'Rosa M.', telefono: '1' }),
    );
  });
});

describe('app móvil', () => {
  it('transacción idempotente de venta (D-05)', async () => {
    const db = comoAna();
    const ventaRef = doc(db, `${base('ana')}/ventas/v-movil-1`);
    const escribir = () =>
      runTransaction(db, async (tx) => {
        const existe = await tx.get(ventaRef);
        if (existe.exists()) return 'ya-existia';
        const prod = doc(db, `${base('ana')}/productos/arroz`);
        await tx.get(prod);
        tx.set(ventaRef, {
          items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 }],
          total: 4.2,
          metodoDePago: 'Efectivo',
          clienteId: null,
          fecha: serverTimestamp(),
        });
        tx.update(prod, { stock: increment(-1) });
        return 'escrita';
      });
    await assertSucceeds(escribir());
    await assertSucceeds(escribir());
    const snap = await getDoc(doc(db, `${base('ana')}/productos/arroz`));
    if (snap.get('stock') !== 9) throw new Error(`stock esperado 9, obtenido ${snap.get('stock')}`);
  });

  it('anulación por contraasiento: devuelve stock y borra el cargo fiado', async () => {
    const db = comoAna();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const prod = doc(db, `${base('ana')}/productos/arroz`);
        await tx.get(prod);
        tx.set(doc(db, `${base('ana')}/ventas/v9-anulada`), {
          items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: -2 }],
          total: -8.4,
          metodoDePago: 'Fiado',
          clienteId: 'rosa',
          anulaA: 'v9',
          motivoAnulacion: 'Cobro equivocado',
          fecha: serverTimestamp(),
        });
        tx.update(prod, { stock: increment(2) });
        tx.delete(doc(db, `${base('ana')}/deudas/d1`));
      }),
    );
  });

  it('rechaza anulaciones con total positivo o con id que no corresponde', async () => {
    const db = comoAna();
    const contra = (total) => ({
      items: [],
      total,
      metodoDePago: 'Efectivo',
      clienteId: null,
      anulaA: 'v9',
    });
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/v9-anulada`), contra(5)));
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/otro-id`), contra(-5)));
  });

  it('código de barras aditivo y configuración del negocio', async () => {
    const db = comoAna();
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/productos/arroz`), {
        nombre: 'Arroz',
        precio: 4.2,
        stock: 10,
        codigoBarras: '7750182000123',
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, `${base('ana')}/config/negocio`), {
        nombre: 'Bodega Ana',
        diasVencimientoFiado: 30,
      }),
    );
  });
});

describe('validación de datos', () => {
  it('rechaza producto sin nombre, precio no numérico o stock texto', async () => {
    const col = collection(comoAna(), `${base('ana')}/productos`);
    await assertFails(addDoc(col, { nombre: '', precio: 1, stock: 1 }));
    await assertFails(addDoc(col, { nombre: 'X', precio: '1', stock: 1 }));
    await assertFails(addDoc(col, { nombre: 'X', precio: 1, stock: 'mucho' }));
  });

  it('rechaza venta con método desconocido y no permite editar/borrar ventas', async () => {
    const db = comoAna();
    await assertFails(
      addDoc(collection(db, `${base('ana')}/ventas`), {
        items: [],
        total: 1,
        metodoDePago: 'Tarjeta',
      }),
    );
    await entorno.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `${base('ana')}/ventas/v1`), {
        items: [],
        total: 1,
        metodoDePago: 'Efectivo',
      }),
    );
    await assertFails(updateDoc(doc(db, `${base('ana')}/ventas/v1`), { total: 0 }));
    await assertFails(deleteDoc(doc(db, `${base('ana')}/ventas/v1`)));
  });

  it('rechaza movimientos de fiado con monto 0 y ediciones distintas de `pagado`', async () => {
    const db = comoAna();
    await assertFails(
      addDoc(collection(db, `${base('ana')}/deudas`), {
        clienteId: 'rosa',
        monto: 0,
        descripcion: 'x',
      }),
    );
    await assertFails(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { monto: 1 }));
  });
});

describe('endurecimiento (auditoría 2026-11)', () => {
  const ventaOk = (extra = {}) => ({
    items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 }],
    total: 4.2,
    metodoDePago: 'Efectivo',
    clienteId: null,
    fecha: serverTimestamp(),
    ...extra,
  });

  it('(a) otro usuario no lee ni escribe productos, ventas ni deudas ajenas', async () => {
    await entorno.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `${base('ana')}/ventas/v1`), ventaOk({ fecha: new Date() })),
    );
    const beto = comoBeto();
    for (const ruta of ['productos/arroz', 'ventas/v1', 'deudas/d1']) {
      await assertFails(getDoc(doc(beto, `${base('ana')}/${ruta}`)));
    }
    await assertFails(
      updateDoc(doc(beto, `${base('ana')}/productos/arroz`), { stock: increment(-1) }),
    );
    await assertFails(deleteDoc(doc(beto, `${base('ana')}/productos/arroz`)));
    await assertFails(setDoc(doc(beto, `${base('ana')}/ventas/v2`), ventaOk()));
    await assertFails(
      addDoc(collection(beto, `${base('ana')}/deudas`), {
        clienteId: 'rosa',
        monto: 5,
        descripcion: 'x',
        fecha: serverTimestamp(),
      }),
    );
    await assertFails(updateDoc(doc(beto, `${base('ana')}/deudas/d1`), { pagado: true }));
    await assertFails(deleteDoc(doc(beto, `${base('ana')}/deudas/d1`)));
  });

  it('(b) un appId distinto de mi-bodega-app se rechaza aunque sea el propio uid', async () => {
    const db = comoAna();
    const otra = 'artifacts/otra-app/users/ana';
    await assertFails(setDoc(doc(db, `${otra}/productos/x`), { nombre: 'X', precio: 1, stock: 1 }));
    await assertFails(getDoc(doc(db, `${otra}/productos/x`)));
    await assertFails(setDoc(doc(db, `${otra}/ventas/v1`), ventaOk()));
  });

  it('(c) venta con total negativo y sin anulaA se rechaza', async () => {
    await assertFails(
      setDoc(doc(comoAna(), `${base('ana')}/ventas/neg`), ventaOk({ total: -4.2 })),
    );
  });

  it('(d) venta con fecha del cliente (no serverTimestamp) se rechaza', async () => {
    const db = comoAna();
    await assertFails(
      setDoc(doc(db, `${base('ana')}/ventas/f1`), ventaOk({ fecha: Timestamp.now() })),
    );
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/f2`), ventaOk({ fecha: null })));
    const { fecha: _sinFecha, ...sinFecha } = ventaOk();
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/f3`), sinFecha));
  });

  it('(e) venta Fiado sin clienteId string se rechaza', async () => {
    const db = comoAna();
    await assertFails(
      setDoc(doc(db, `${base('ana')}/ventas/fi1`), ventaOk({ metodoDePago: 'Fiado' })),
    );
    await assertFails(
      setDoc(
        doc(db, `${base('ana')}/ventas/fi2`),
        ventaOk({ metodoDePago: 'Fiado', clienteId: 123 }),
      ),
    );
    await assertSucceeds(
      setDoc(
        doc(db, `${base('ana')}/ventas/fi3`),
        ventaOk({ metodoDePago: 'Fiado', clienteId: 'rosa' }),
      ),
    );
  });

  it('(f) una deuda no puede volver a pagado=false', async () => {
    const db = comoAna();
    await assertFails(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { pagado: false }));
    await assertSucceeds(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { pagado: true }));
    await assertFails(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { pagado: false }));
  });

  it('(g) venta, cargo y abono con el campo aditivo creadaEn (D-26) se permiten', async () => {
    const db = comoAna();
    const creadaEn = Timestamp.fromMillis(Date.now() - 9 * 60 * 60 * 1000); // cobrada sin red
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const ventaRef = doc(db, `${base('ana')}/ventas/v-offline`);
        const prod = doc(db, `${base('ana')}/productos/arroz`);
        await tx.get(ventaRef);
        await tx.get(prod);
        tx.set(ventaRef, ventaOk({ metodoDePago: 'Fiado', clienteId: 'rosa', creadaEn }));
        tx.set(doc(db, `${base('ana')}/deudas/cargo-offline`), {
          clienteId: 'rosa',
          monto: 4.2,
          descripcion: 'Arroz (x1)',
          ventaId: 'v-offline',
          pagado: false,
          fecha: serverTimestamp(),
          creadaEn,
          origen: 'movil',
        });
        tx.update(prod, { stock: increment(-1) });
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, `${base('ana')}/deudas/abono-offline`), {
        clienteId: 'rosa',
        monto: -2,
        descripcion: 'Pago de: Arroz (x1)',
        pagado: false,
        metodoPago: 'Yape/Plin',
        deudaOrigenId: 'cargo-offline',
        fecha: serverTimestamp(),
        creadaEn,
        origen: 'movil',
      }),
    );
  });

  it('(h) producto con una clave desconocida se rechaza al crear; editar uno heredado sigue permitido', async () => {
    const db = comoAna();
    await assertFails(
      addDoc(collection(db, `${base('ana')}/productos`), {
        nombre: 'X',
        precio: 1,
        stock: 1,
        malicioso: true,
      }),
    );
    // Decisión 2026-11: en edición no se exige lista cerrada de claves, para que productos
    // heredados con campos extra se puedan seguir editando (se validan tipos igual).
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/productos/arroz`), {
        nombre: 'Arroz',
        precio: 4.2,
        stock: 10,
        extra: 'x',
      }),
    );
    await assertFails(
      updateDoc(doc(db, `${base('ana')}/productos/arroz`), { nombre: '', precio: 4.2, stock: 10 }),
    );
  });
});

describe('cobranza (D-27): clientes.ultimoRecordatorio', () => {
  it('se puede anotar un Timestamp y la web sigue editando el cliente', async () => {
    const db = comoAna();
    const hace = Timestamp.fromMillis(Date.now() - 60 * 60 * 1000); // enviado sin red
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/clientes/rosa`), { ultimoRecordatorio: hace }),
    );
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/clientes/rosa`), { nombre: 'Rosa M.', telefono: '1' }),
    );
    await assertSucceeds(
      setDoc(doc(db, `${base('ana')}/clientes/nuevo`), {
        nombre: 'Nuevo',
        telefono: '',
        ultimoRecordatorio: Timestamp.now(),
      }),
    );
  });

  it('rechaza texto, fechas muy futuras y escrituras ajenas', async () => {
    const ref = (db) => doc(db, `${base('ana')}/clientes/rosa`);
    await assertFails(updateDoc(ref(comoAna()), { ultimoRecordatorio: 'ayer' }));
    await assertFails(
      updateDoc(ref(comoAna()), {
        ultimoRecordatorio: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000),
      }),
    );
    await assertFails(updateDoc(ref(comoBeto()), { ultimoRecordatorio: Timestamp.now() }));
  });
});

describe('caja (D-28)', () => {
  const cajaRef = (db, id = 'c1') => doc(db, `${base('ana')}/cajas/${id}`);
  const movRef = (db, id = 'm1', cajaId = 'c1') =>
    doc(db, `${base('ana')}/cajas/${cajaId}/movimientos/${id}`);
  const apertura = (extra = {}) => ({
    estado: 'abierta',
    apertura: { monto: 50, fecha: serverTimestamp(), creadaEn: Timestamp.now(), ...extra },
    origen: 'movil',
  });
  const cierre = (extra = {}) => ({
    estado: 'cerrada',
    cierre: {
      contado: 58,
      esperado: 60,
      diferencia: -2,
      fecha: serverTimestamp(),
      creadaEn: Timestamp.now(),
      ...extra,
    },
  });
  const movimiento = (extra = {}) => ({
    tipo: 'egreso',
    monto: 7,
    motivo: 'Pago al panadero',
    fecha: serverTimestamp(),
    creadaEn: Timestamp.now(),
    ...extra,
  });

  it('flujo de la app: abrir, egreso y cerrar con transacciones idempotentes', async () => {
    const db = comoAna();
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(cajaRef(db));
        tx.set(cajaRef(db), apertura());
      }),
    );
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(movRef(db));
        tx.set(movRef(db), movimiento());
      }),
    );
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(cajaRef(db));
        tx.update(cajaRef(db), cierre());
      }),
    );
    await assertSucceeds(getDoc(cajaRef(db)));
    await assertSucceeds(getDoc(movRef(db)));
  });

  it('flujo de la web (web/src/mappersCaja.ts): apertura con creadaEn y SIN origen', async () => {
    const db = comoAna();
    const ref = cajaRef(db, 'web1');
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(ref);
        tx.set(ref, {
          estado: 'abierta',
          apertura: { monto: 100, fecha: serverTimestamp(), creadaEn: Timestamp.now() },
        });
      }),
    );
    // `origen` distinto de 'movil' no se acepta: la web no lo escribe.
    await assertFails(setDoc(cajaRef(db, 'web2'), { ...apertura(), origen: 'web' }));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        const m = movRef(db, 'mw1', 'web1');
        await tx.get(m);
        tx.set(m, movimiento({ tipo: 'ingreso', motivo: 'x'.repeat(80) }));
      }),
    );
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(ref);
        tx.update(ref, cierre({ contado: 100, esperado: 87.3, diferencia: 12.7 }));
      }),
    );
  });

  it('una caja cerrada es inmutable: no se reabre, recierra, recibe movimientos ni se borra', async () => {
    const db = comoAna();
    await assertSucceeds(setDoc(cajaRef(db), apertura()));
    await assertSucceeds(updateDoc(cajaRef(db), cierre()));
    await assertFails(updateDoc(cajaRef(db), { estado: 'abierta' }));
    await assertFails(updateDoc(cajaRef(db), cierre({ contado: 60, diferencia: 0 })));
    await assertFails(setDoc(movRef(db, 'tarde'), movimiento()));
    await assertFails(deleteDoc(cajaRef(db)));
  });

  it('valida la apertura: estado, monto, fecha del servidor y claves conocidas', async () => {
    const db = comoAna();
    await assertFails(setDoc(cajaRef(db, 'a'), { ...apertura(), estado: 'cerrada' }));
    await assertFails(setDoc(cajaRef(db, 'b'), apertura({ monto: -1 })));
    await assertFails(setDoc(cajaRef(db, 'c'), apertura({ monto: '50' })));
    await assertFails(setDoc(cajaRef(db, 'd'), apertura({ monto: 100001 })));
    await assertFails(setDoc(cajaRef(db, 'e'), apertura({ fecha: Timestamp.now() })));
    await assertFails(setDoc(cajaRef(db, 'f'), { ...apertura(), extra: true }));
    await assertFails(setDoc(cajaRef(db, 'g'), apertura({ otro: 1 })));
    await assertFails(
      setDoc(
        cajaRef(db, 'h'),
        apertura({ creadaEn: Timestamp.fromMillis(Date.now() + 3 * 24 * 60 * 60 * 1000) }),
      ),
    );
    // Sin creadaEn (opcional) y con monto 0 es válido.
    await assertSucceeds(
      setDoc(cajaRef(db, 'ok'), {
        estado: 'abierta',
        apertura: { monto: 0, fecha: serverTimestamp() },
      }),
    );
  });

  it('valida el cierre: diferencia coherente, tipos y solo estado + cierre', async () => {
    const db = comoAna();
    await assertSucceeds(setDoc(cajaRef(db), apertura()));
    await assertFails(updateDoc(cajaRef(db), cierre({ diferencia: 5 })));
    await assertFails(updateDoc(cajaRef(db), cierre({ contado: -1, diferencia: -61 })));
    await assertFails(updateDoc(cajaRef(db), cierre({ fecha: Timestamp.now() })));
    await assertFails(updateDoc(cajaRef(db), { ...cierre(), apertura: { monto: 0 } }));
    await assertFails(updateDoc(cajaRef(db), { estado: 'cerrada' }));
    // Coma flotante: 10.1 - 10.3 = -0.2000000000000011 se acepta como -0.2.
    await assertSucceeds(
      updateDoc(cajaRef(db), cierre({ contado: 10.1, esperado: 10.3, diferencia: -0.2 })),
    );
  });

  it('valida movimientos: tipo, monto > 0, motivo; no se editan ni se borran', async () => {
    const db = comoAna();
    await assertSucceeds(setDoc(cajaRef(db), apertura()));
    await assertFails(setDoc(movRef(db, 'a'), movimiento({ tipo: 'robo' })));
    await assertFails(setDoc(movRef(db, 'b'), movimiento({ monto: 0 })));
    await assertFails(setDoc(movRef(db, 'c'), movimiento({ motivo: '' })));
    await assertFails(setDoc(movRef(db, 'd'), movimiento({ motivo: 'x'.repeat(81) })));
    await assertFails(setDoc(movRef(db, 'e'), movimiento({ fecha: Timestamp.now() })));
    await assertFails(setDoc(movRef(db, 'f'), movimiento({ extra: 1 })));
    await assertFails(setDoc(movRef(db, 'g', 'no-existe'), movimiento()));
    await assertSucceeds(setDoc(movRef(db, 'ok'), movimiento({ tipo: 'ingreso' })));
    await assertFails(updateDoc(movRef(db, 'ok'), { monto: 1 }));
    await assertFails(deleteDoc(movRef(db, 'ok')));
  });

  it('solo el dueño: otra cuenta no lee ni escribe cajas ajenas', async () => {
    await assertSucceeds(setDoc(cajaRef(comoAna()), apertura()));
    await assertFails(getDoc(cajaRef(comoBeto())));
    await assertFails(setDoc(cajaRef(comoBeto(), 'x'), apertura()));
    await assertFails(setDoc(movRef(comoBeto()), movimiento()));
    await assertFails(getDoc(movRef(anonimo())));
  });
});

// =============================================================================================
// Cajeros y roles (D-33, docs/roles.md). Cada fila de la tabla de permisos: dueño y cajero.
// =============================================================================================

const INV = `artifacts/${APP}/invitaciones`;
const CUENTAS = `artifacts/${APP}/cuentas`;
const DIA = 24 * 60 * 60 * 1000;
const comoCaro = () => entorno.authenticatedContext('caro').firestore(); // cajera activa de ana
const comoDesa = () => entorno.authenticatedContext('desa').firestore(); // cajera desactivada
const comoNico = () => entorno.authenticatedContext('nico').firestore(); // cuenta nueva

const miembroSemilla = (extra = {}) => ({
  rol: 'cajero',
  nombre: 'Caro',
  email: 'caro@x.pe',
  activo: true,
  desde: new Date(),
  invitacion: 'AAAAAAAA',
  ...extra,
});

async function sembrarEquipo() {
  await entorno.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${base('ana')}/miembros/caro`), miembroSemilla());
    await setDoc(
      doc(db, `${base('ana')}/miembros/desa`),
      miembroSemilla({ nombre: 'Desa', activo: false }),
    );
    await setDoc(doc(db, `${CUENTAS}/caro`), { bodega: 'ana', rol: 'cajero' });
    await setDoc(doc(db, `${CUENTAS}/desa`), { bodega: 'ana', rol: 'cajero' });
    await setDoc(doc(db, `${base('beto')}/productos/leche`), {
      nombre: 'Leche',
      precio: 4,
      stock: 5,
    });
    await setDoc(doc(db, `${base('ana')}/config/negocio`), { nombre: 'Bodega Ana' });
    await setDoc(doc(db, `${base('ana')}/cajas/abierta`), {
      estado: 'abierta',
      apertura: { monto: 10, fecha: new Date() },
    });
    const venta = {
      items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 }],
      total: 4.2,
      metodoDePago: 'Fiado',
      clienteId: 'rosa',
      fecha: new Date(),
    };
    await setDoc(doc(db, `${base('ana')}/ventas/v-caro`), {
      ...venta,
      vendidoPor: 'caro',
      vendidoPorNombre: 'Caro',
    });
    await setDoc(doc(db, `${base('ana')}/ventas/v-ana`), venta);
  });
}

const ventaCajero = (extra = {}) => ({
  items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 }],
  total: 4.2,
  metodoDePago: 'Efectivo',
  clienteId: null,
  fecha: serverTimestamp(),
  vendidoPor: 'caro',
  vendidoPorNombre: 'Caro',
  ...extra,
});
const abonoCajero = (extra = {}) => ({
  clienteId: 'rosa',
  monto: -2,
  descripcion: 'Pago',
  fecha: serverTimestamp(),
  pagado: false,
  metodoPago: 'Efectivo',
  origen: 'movil',
  registradoPor: 'caro',
  registradoPorNombre: 'Caro',
  ...extra,
});
const cargoCajero = (ventaId, extra = {}) => ({
  clienteId: 'rosa',
  monto: 4.2,
  descripcion: 'Arroz (x1)',
  ventaId,
  pagado: false,
  fecha: serverTimestamp(),
  origen: 'movil',
  registradoPor: 'caro',
  registradoPorNombre: 'Caro',
  ...extra,
});
const aperturaCajero = (extra = {}) => ({
  estado: 'abierta',
  apertura: { monto: 20, fecha: serverTimestamp(), creadaEn: Timestamp.now() },
  origen: 'movil',
  ...extra,
});

describe('roles (D-33): cajero activo, fila por fila', () => {
  beforeEach(() => sembrarEquipo());

  it('ver productos y clientes: sí (lectura y consulta)', async () => {
    const db = comoCaro();
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/productos/arroz`)));
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/clientes/rosa`)));
    await assertSucceeds(getDocs(collection(db, `${base('ana')}/productos`)));
    await assertSucceeds(getDocs(collection(db, `${base('ana')}/clientes`)));
  });

  it('crear o editar productos (precio, nombre, stock manual) y borrarlos: no', async () => {
    const db = comoCaro();
    const arroz = doc(db, `${base('ana')}/productos/arroz`);
    await assertFails(
      addDoc(collection(db, `${base('ana')}/productos`), { nombre: 'X', precio: 1, stock: 1 }),
    );
    await assertFails(updateDoc(arroz, { nombre: 'Arroz', precio: 9, stock: 10 }));
    await assertFails(updateDoc(arroz, { precio: 9 }));
    // Stock "manual" hacia arriba (reponer) tampoco: eso es editar inventario.
    await assertFails(updateDoc(arroz, { stock: 50 }));
    await assertFails(deleteDoc(arroz));
  });

  it('descontar stock al vender (increment negativo): sí; devolver o tocar stock no controlado: no', async () => {
    const db = comoCaro();
    const arroz = doc(db, `${base('ana')}/productos/arroz`);
    await assertSucceeds(updateDoc(arroz, { stock: increment(-2) }));
    await assertFails(updateDoc(arroz, { stock: increment(2) }));
    await assertFails(updateDoc(doc(db, `${base('ana')}/productos/pan`), { stock: increment(-1) }));
    await assertFails(updateDoc(arroz, { stock: increment(-1), precio: 1 }));
  });

  it('crear clientes: sí (para poder fiar)', async () => {
    await assertSucceeds(
      addDoc(collection(comoCaro(), `${base('ana')}/clientes`), { nombre: 'Juan', telefono: '' }),
    );
  });

  it('editar o borrar clientes: no', async () => {
    const rosa = doc(comoCaro(), `${base('ana')}/clientes/rosa`);
    await assertFails(updateDoc(rosa, { nombre: 'Rosa M.', telefono: '1' }));
    await assertFails(updateDoc(rosa, { ultimoRecordatorio: Timestamp.now(), limiteCredito: 500 }));
    await assertFails(deleteDoc(rosa));
  });

  it('registrar venta: sí con vendidoPor == su uid; sin autoría o suplantando: no', async () => {
    const db = comoCaro();
    const venta = (id) => doc(db, `${base('ana')}/ventas/${id}`);
    await assertSucceeds(setDoc(venta('c1'), ventaCajero()));
    const { vendidoPor: _a, ...sinUid } = ventaCajero();
    const { vendidoPorNombre: _b, ...sinNombre } = ventaCajero();
    await assertFails(setDoc(venta('c2'), sinUid));
    await assertFails(setDoc(venta('c3'), sinNombre));
    await assertFails(setDoc(venta('c4'), ventaCajero({ vendidoPor: 'ana' })));
    await assertFails(setDoc(venta('c5'), ventaCajero({ vendidoPorNombre: '' })));
    await assertFails(setDoc(venta('c6'), ventaCajero({ vendidoPorNombre: 'x'.repeat(61) })));
    // Las validaciones de siempre también aplican al cajero.
    await assertFails(setDoc(venta('c7'), ventaCajero({ fecha: Timestamp.now() })));
    await assertFails(setDoc(venta('c8'), ventaCajero({ metodoDePago: 'Fiado' })));
  });

  it('venta del cajero en una transacción (venta + cargo fiado + stock de 6 productos)', async () => {
    const db = comoCaro();
    await entorno.withSecurityRulesDisabled(async (ctx) => {
      for (const id of ['p1', 'p2', 'p3', 'p4', 'p5']) {
        await setDoc(doc(ctx.firestore(), `${base('ana')}/productos/${id}`), {
          nombre: id,
          precio: 1,
          stock: 10,
        });
      }
    });
    const ventaRef = doc(db, `${base('ana')}/ventas/c-tx`);
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        if ((await tx.get(ventaRef)).exists()) return;
        const prods = ['arroz', 'p1', 'p2', 'p3', 'p4', 'p5'].map((id) =>
          doc(db, `${base('ana')}/productos/${id}`),
        );
        for (const p of prods) await tx.get(p);
        tx.set(ventaRef, ventaCajero({ metodoDePago: 'Fiado', clienteId: 'rosa', total: 9.2 }));
        tx.set(doc(db, `${base('ana')}/deudas/cargo-tx`), cargoCajero('c-tx', { monto: 9.2 }));
        for (const p of prods) tx.update(p, { stock: increment(-1) });
      }),
    );
  });

  it('anular venta (contraasiento): no', async () => {
    await assertFails(
      setDoc(doc(comoCaro(), `${base('ana')}/ventas/v-caro-anulada`), {
        items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: -1 }],
        total: -4.2,
        metodoDePago: 'Fiado',
        clienteId: 'rosa',
        anulaA: 'v-caro',
        fecha: serverTimestamp(),
        vendidoPor: 'caro',
        vendidoPorNombre: 'Caro',
      }),
    );
  });

  it('ver ventas: sí (las necesita la caja); editarlas o borrarlas: no', async () => {
    const db = comoCaro();
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/ventas/v-ana`)));
    await assertSucceeds(
      getDocs(
        query(
          collection(db, `${base('ana')}/ventas`),
          where('fecha', '>=', Timestamp.fromMillis(0)),
        ),
      ),
    );
    await assertFails(updateDoc(doc(db, `${base('ana')}/ventas/v-caro`), { total: 0 }));
    await assertFails(deleteDoc(doc(db, `${base('ana')}/ventas/v-caro`)));
  });

  it('fiar (cargo por su venta) y registrar abonos: sí con registradoPor == su uid', async () => {
    const db = comoCaro();
    const deuda = (id) => doc(db, `${base('ana')}/deudas/${id}`);
    await assertSucceeds(setDoc(deuda('cargo-caro'), cargoCajero('v-caro')));
    await assertSucceeds(setDoc(deuda('abono-caro'), abonoCajero()));
    const { registradoPor: _a, ...sinAutor } = abonoCajero();
    await assertFails(setDoc(deuda('abono-2'), sinAutor));
    await assertFails(setDoc(deuda('abono-3'), abonoCajero({ registradoPor: 'ana' })));
    await assertFails(setDoc(deuda('abono-4'), abonoCajero({ pagado: true })));
  });

  it('fiar sin venta (cargo manual): no, ni colgado de una venta ajena, inexistente o menor', async () => {
    const db = comoCaro();
    const deuda = (id) => doc(db, `${base('ana')}/deudas/${id}`);
    const { ventaId: _v, ...manual } = cargoCajero('x');
    await assertFails(setDoc(deuda('m1'), manual));
    await assertFails(setDoc(deuda('m2'), cargoCajero('no-existe')));
    await assertFails(setDoc(deuda('m3'), cargoCajero('v-ana')));
    await assertFails(setDoc(deuda('m4'), cargoCajero('v-caro', { monto: 50 })));
    await assertFails(setDoc(deuda('m5'), cargoCajero('v-caro', { clienteId: 'otro' })));
  });

  it('borrar movimientos de fiado y marcar "pagado": no', async () => {
    const db = comoCaro();
    await assertFails(deleteDoc(doc(db, `${base('ana')}/deudas/d1`)));
    await assertFails(updateDoc(doc(db, `${base('ana')}/deudas/d1`), { pagado: true }));
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/deudas/d1`)));
  });

  it('marcar recordatorio (ultimoRecordatorio): sí', async () => {
    const rosa = doc(comoCaro(), `${base('ana')}/clientes/rosa`);
    await assertSucceeds(updateDoc(rosa, { ultimoRecordatorio: Timestamp.now() }));
    await assertFails(updateDoc(rosa, { ultimoRecordatorio: 'hoy' }));
  });

  it('caja: abrir, movimientos y cerrar con su uid; sin autoría o suplantando: no', async () => {
    const db = comoCaro();
    const caja = doc(db, `${base('ana')}/cajas/c-caro`);
    await assertFails(setDoc(caja, aperturaCajero()));
    await assertFails(setDoc(caja, aperturaCajero({ abiertaPor: 'ana', abiertaPorNombre: 'Ana' })));
    await assertSucceeds(
      runTransaction(db, async (tx) => {
        await tx.get(caja);
        tx.set(caja, aperturaCajero({ abiertaPor: 'caro', abiertaPorNombre: 'Caro' }));
      }),
    );
    await assertSucceeds(getDoc(caja));
    const mov = (id) => doc(db, `${base('ana')}/cajas/c-caro/movimientos/${id}`);
    const movimiento = {
      tipo: 'egreso',
      monto: 5,
      motivo: 'Bolsas',
      fecha: serverTimestamp(),
      creadaEn: Timestamp.now(),
    };
    await assertFails(setDoc(mov('m0'), movimiento));
    await assertFails(
      setDoc(mov('m1'), { ...movimiento, registradoPor: 'ana', registradoPorNombre: 'Ana' }),
    );
    await assertSucceeds(
      setDoc(mov('m2'), { ...movimiento, registradoPor: 'caro', registradoPorNombre: 'Caro' }),
    );
    await assertSucceeds(getDocs(collection(db, `${base('ana')}/cajas/c-caro/movimientos`)));
    const cierre = {
      estado: 'cerrada',
      cierre: { contado: 15, esperado: 15, diferencia: 0, fecha: serverTimestamp() },
    };
    await assertFails(updateDoc(caja, cierre));
    await assertFails(updateDoc(caja, { ...cierre, cerradaPor: 'ana', cerradaPorNombre: 'Ana' }));
    await assertSucceeds(
      updateDoc(caja, { ...cierre, cerradaPor: 'caro', cerradaPorNombre: 'Caro' }),
    );
    await assertFails(deleteDoc(caja));
  });

  it('caja: el cajero puede cerrar la caja que abrió el dueño', async () => {
    await assertSucceeds(
      updateDoc(doc(comoCaro(), `${base('ana')}/cajas/abierta`), {
        estado: 'cerrada',
        cierre: { contado: 10, esperado: 10, diferencia: 0, fecha: serverTimestamp() },
        cerradaPor: 'caro',
        cerradaPorNombre: 'Caro',
      }),
    );
  });

  it('configuración del negocio: solo lectura', async () => {
    const config = doc(comoCaro(), `${base('ana')}/config/negocio`);
    await assertSucceeds(getDoc(config));
    await assertFails(setDoc(config, { nombre: 'Mía' }));
    await assertFails(setDoc(config, { nombre: 'Mía' }, { merge: true }));
  });

  it('invitar, desactivar o borrar cajeros: no (ni reactivarse a sí misma)', async () => {
    const db = comoCaro();
    await assertFails(
      setDoc(doc(db, `${INV}/BBBBBBBB`), {
        dueno: 'caro',
        rol: 'cajero',
        creada: serverTimestamp(),
        expira: Timestamp.fromMillis(Date.now() + DIA),
        usadaPor: null,
        nombreBodega: 'X',
      }),
    );
    await assertFails(updateDoc(doc(db, `${base('ana')}/miembros/desa`), { activo: true }));
    await assertFails(updateDoc(doc(db, `${base('ana')}/miembros/caro`), { nombre: 'Jefa' }));
    await assertFails(deleteDoc(doc(db, `${base('ana')}/miembros/desa`)));
    await assertFails(getDocs(collection(db, `${base('ana')}/miembros`)));
    await assertFails(getDoc(doc(db, `${base('ana')}/miembros/desa`)));
    // Su propio miembro sí lo lee (la app comprueba si sigue activa).
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/miembros/caro`)));
  });

  it('un cajero de la bodega A no toca la bodega B', async () => {
    const db = comoCaro();
    const leche = doc(db, `${base('beto')}/productos/leche`);
    await assertFails(getDoc(leche));
    await assertFails(updateDoc(leche, { stock: increment(-1) }));
    await assertFails(setDoc(doc(db, `${base('beto')}/ventas/x`), ventaCajero()));
    await assertFails(setDoc(doc(db, `${base('beto')}/deudas/x`), abonoCajero()));
    await assertFails(getDoc(doc(db, `${base('beto')}/config/negocio`)));
    // Ni con otro appId.
    await assertFails(getDoc(doc(db, `artifacts/otra-app/users/ana/productos/arroz`)));
  });
});

describe('roles (D-33): cajero desactivado o quitado pierde todo', () => {
  beforeEach(() => sembrarEquipo());

  it('desactivado: no lee ni escribe nada de la bodega', async () => {
    const db = comoDesa();
    const rutas = [
      'productos/arroz',
      'clientes/rosa',
      'ventas/v-ana',
      'deudas/d1',
      'cajas/abierta',
      'config/negocio',
    ];
    for (const ruta of rutas) await assertFails(getDoc(doc(db, `${base('ana')}/${ruta}`)));
    await assertFails(getDocs(collection(db, `${base('ana')}/ventas`)));
    await assertFails(
      updateDoc(doc(db, `${base('ana')}/productos/arroz`), { stock: increment(-1) }),
    );
    const autoria = { vendidoPor: 'desa', vendidoPorNombre: 'Desa' };
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/d1`), ventaCajero(autoria)));
    await assertFails(
      setDoc(
        doc(db, `${base('ana')}/deudas/d2`),
        abonoCajero({ registradoPor: 'desa', registradoPorNombre: 'Desa' }),
      ),
    );
    await assertFails(
      addDoc(collection(db, `${base('ana')}/clientes`), { nombre: 'Juan', telefono: '' }),
    );
    await assertFails(
      updateDoc(doc(db, `${base('ana')}/clientes/rosa`), { ultimoRecordatorio: Timestamp.now() }),
    );
    await assertFails(
      setDoc(
        doc(db, `${base('ana')}/cajas/x`),
        aperturaCajero({ abiertaPor: 'desa', abiertaPorNombre: 'Desa' }),
      ),
    );
    await assertFails(
      setDoc(doc(db, `${base('ana')}/cajas/abierta/movimientos/x`), {
        tipo: 'ingreso',
        monto: 1,
        motivo: 'x',
        fecha: serverTimestamp(),
        registradoPor: 'desa',
        registradoPorNombre: 'Desa',
      }),
    );
    // Sí puede leer su propio miembro para saber que fue desactivada.
    await assertSucceeds(getDoc(doc(db, `${base('ana')}/miembros/desa`)));
  });

  it('el dueño desactiva y borra: el acceso se corta en la siguiente solicitud', async () => {
    const ana = comoAna();
    const arroz = () => doc(comoCaro(), `${base('ana')}/productos/arroz`);
    const miembroCaro = doc(ana, `${base('ana')}/miembros/caro`);
    await assertSucceeds(getDoc(arroz()));
    await assertSucceeds(updateDoc(miembroCaro, { activo: false }));
    await assertFails(getDoc(arroz()));
    await assertSucceeds(updateDoc(miembroCaro, { activo: true }));
    await assertSucceeds(getDoc(arroz()));
    await assertSucceeds(deleteDoc(miembroCaro));
    await assertFails(getDoc(arroz()));
    await assertFails(setDoc(doc(comoCaro(), `${base('ana')}/ventas/z`), ventaCajero()));
  });

  it('un miembro con rol distinto de cajero no da acceso', async () => {
    await entorno.withSecurityRulesDisabled((ctx) =>
      setDoc(
        doc(ctx.firestore(), `${base('ana')}/miembros/caro`),
        miembroSemilla({ rol: 'dueno' }),
      ),
    );
    await assertFails(getDoc(doc(comoCaro(), `${base('ana')}/productos/arroz`)));
  });
});

describe('roles (D-33): el dueño gestiona su equipo y sigue igual', () => {
  beforeEach(() => sembrarEquipo());

  it('lista miembros; solo cambia activo/nombre; borra', async () => {
    const ana = comoAna();
    const ref = doc(ana, `${base('ana')}/miembros/caro`);
    await assertSucceeds(getDocs(collection(ana, `${base('ana')}/miembros`)));
    await assertSucceeds(updateDoc(ref, { nombre: 'Carolina' }));
    await assertSucceeds(updateDoc(ref, { activo: false, nombre: 'Caro' }));
    await assertFails(updateDoc(ref, { activo: 'no' }));
    await assertFails(updateDoc(ref, { nombre: '' }));
    await assertFails(updateDoc(ref, { rol: 'dueno' }));
    await assertFails(updateDoc(ref, { invitacion: 'CCCCCCCC' }));
    await assertFails(updateDoc(ref, { email: 'otro@x.pe' }));
    // El dueño no puede fabricar miembros (solo los crea el cajero al aceptar).
    await assertFails(setDoc(doc(ana, `${base('ana')}/miembros/nico`), miembroSemilla()));
    await assertSucceeds(deleteDoc(ref));
    // Otro dueño no toca el equipo ajeno.
    await assertFails(getDocs(collection(comoBeto(), `${base('ana')}/miembros`)));
    await assertFails(updateDoc(doc(comoBeto(), `${base('ana')}/miembros/desa`), { activo: true }));
  });

  it('escrituras de versiones viejas (sin autoría) siguen aceptadas para el dueño', async () => {
    const db = comoAna();
    const { vendidoPor: _a, vendidoPorNombre: _b, ...vieja } = ventaCajero();
    await assertSucceeds(setDoc(doc(db, `${base('ana')}/ventas/vieja`), vieja));
    await assertSucceeds(
      addDoc(collection(db, `${base('ana')}/deudas`), {
        clienteId: 'rosa',
        monto: 3,
        descripcion: 'Fiado manual',
        fecha: serverTimestamp(),
        pagado: false,
      }),
    );
    await assertSucceeds(
      setDoc(doc(db, `${base('ana')}/cajas/abierta/movimientos/v1`), {
        tipo: 'ingreso',
        monto: 1,
        motivo: 'Sencillo',
        fecha: serverTimestamp(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db, `${base('ana')}/cajas/abierta`), {
        estado: 'cerrada',
        cierre: { contado: 10, esperado: 10, diferencia: 0, fecha: serverTimestamp() },
      }),
    );
  });

  it('el dueño puede sellar su autoría, pero no a nombre de otro', async () => {
    const db = comoAna();
    const ventaAna = ventaCajero({ vendidoPor: 'ana', vendidoPorNombre: 'Ana' });
    await assertSucceeds(setDoc(doc(db, `${base('ana')}/ventas/a1`), ventaAna));
    await assertFails(setDoc(doc(db, `${base('ana')}/ventas/a2`), ventaCajero()));
    await assertSucceeds(
      setDoc(
        doc(db, `${base('ana')}/cajas/a1`),
        aperturaCajero({ abiertaPor: 'ana', abiertaPorNombre: 'Ana' }),
      ),
    );
    await assertFails(
      setDoc(
        doc(db, `${base('ana')}/cajas/a2`),
        aperturaCajero({ abiertaPor: 'caro', abiertaPorNombre: 'Caro' }),
      ),
    );
    await assertFails(
      setDoc(doc(db, `${base('ana')}/deudas/a3`), abonoCajero({ registradoPor: 'caro' })),
    );
  });

  it('la cajera sigue siendo dueña de su propia ruta (sin migración)', async () => {
    await assertSucceeds(
      setDoc(doc(comoCaro(), `${base('caro')}/productos/x`), { nombre: 'X', precio: 1, stock: 1 }),
    );
  });
});

describe('roles (D-33): invitaciones y aceptación', () => {
  beforeEach(() => sembrarEquipo());

  const invitacion = (extra = {}) => ({
    dueno: 'ana',
    rol: 'cajero',
    creada: serverTimestamp(),
    expira: Timestamp.fromMillis(Date.now() + 7 * DIA - 60 * 60 * 1000),
    usadaPor: null,
    nombreBodega: 'Bodega Ana',
    ...extra,
  });
  /** Invitación ya guardada (sin reglas) para probar la aceptación. */
  const sembrarInvitacion = (codigo, extra = {}) =>
    entorno.withSecurityRulesDisabled((ctx) =>
      setDoc(doc(ctx.firestore(), `${INV}/${codigo}`), {
        ...invitacion(),
        creada: new Date(),
        ...extra,
      }),
    );

  /** La transacción de la app: invitación usada + miembro + cuenta. */
  const aceptar = (db, uid, codigo, opciones = {}) => {
    const { dueno = 'ana', cuenta = true, miembro = {}, inv = true } = opciones;
    return runTransaction(db, async (tx) => {
      const invRef = doc(db, `${INV}/${codigo}`);
      await tx.get(invRef);
      if (inv) tx.update(invRef, { usadaPor: uid });
      tx.set(doc(db, `${base(dueno)}/miembros/${uid}`), {
        rol: 'cajero',
        nombre: 'Nico',
        email: 'nico@x.pe',
        activo: true,
        desde: serverTimestamp(),
        invitacion: codigo,
        ...miembro,
      });
      if (cuenta) tx.set(doc(db, `${CUENTAS}/${uid}`), { bodega: dueno, rol: 'cajero' });
    });
  };

  it('el dueño crea, lista y borra sus invitaciones', async () => {
    const ana = comoAna();
    await assertSucceeds(setDoc(doc(ana, `${INV}/ABCDEFGH`), invitacion()));
    await assertSucceeds(getDocs(query(collection(ana, INV), where('dueno', '==', 'ana'))));
    await assertFails(getDocs(collection(ana, INV)));
    await assertFails(getDocs(query(collection(comoBeto(), INV), where('dueno', '==', 'ana'))));
    await assertFails(deleteDoc(doc(comoBeto(), `${INV}/ABCDEFGH`)));
    await assertFails(updateDoc(doc(ana, `${INV}/ABCDEFGH`), { expira: Timestamp.now() }));
    await assertSucceeds(deleteDoc(doc(ana, `${INV}/ABCDEFGH`)));
  });

  it('rechaza invitaciones mal formadas', async () => {
    const ana = comoAna();
    const crear = (codigo, extra) => setDoc(doc(ana, `${INV}/${codigo}`), invitacion(extra));
    await assertFails(crear('ABCDEFG0')); // carácter ambiguo
    await assertFails(crear('ABCDEFGHJ')); // largo
    await assertFails(crear('abcdefgh')); // minúsculas
    await assertFails(crear('ABCDEFGH', { dueno: 'beto' }));
    await assertFails(crear('ABCDEFGH', { rol: 'dueno' }));
    await assertFails(crear('ABCDEFGH', { usadaPor: 'nico' }));
    await assertFails(crear('ABCDEFGH', { creada: Timestamp.now() }));
    await assertFails(crear('ABCDEFGH', { expira: Timestamp.fromMillis(Date.now() + 8 * DIA) }));
    await assertFails(crear('ABCDEFGH', { expira: Timestamp.fromMillis(Date.now() - 1000) }));
    await assertFails(crear('ABCDEFGH', { nombreBodega: '' }));
    await assertFails(crear('ABCDEFGH', { extra: 1 }));
    const { nombreBodega: _n, ...sinNombre } = invitacion();
    await assertFails(setDoc(doc(ana, `${INV}/ABCDEFGH`), sinNombre));
    await assertFails(setDoc(doc(anonimo(), `${INV}/ABCDEFGH`), invitacion()));
  });

  it('aceptar una vez: invitación usada + miembro + cuenta, y ya trabaja en la bodega', async () => {
    await sembrarInvitacion('KMNPQRST');
    const nico = comoNico();
    await assertSucceeds(getDoc(doc(nico, `${INV}/KMNPQRST`)));
    await assertSucceeds(aceptar(nico, 'nico', 'KMNPQRST'));
    await assertSucceeds(getDoc(doc(nico, `${CUENTAS}/nico`)));
    await assertSucceeds(getDoc(doc(nico, `${base('ana')}/miembros/nico`)));
    await assertSucceeds(getDoc(doc(nico, `${base('ana')}/productos/arroz`)));
    await assertSucceeds(
      setDoc(
        doc(nico, `${base('ana')}/ventas/n1`),
        ventaCajero({ vendidoPor: 'nico', vendidoPorNombre: 'Nico' }),
      ),
    );
    // Segundo uso del mismo código, por otra cuenta o por la misma.
    const otro = entorno.authenticatedContext('otro').firestore();
    await assertFails(aceptar(otro, 'otro', 'KMNPQRST'));
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { cuenta: false }));
    // La cuenta no se reescribe ni se lee la ajena.
    await assertFails(setDoc(doc(nico, `${CUENTAS}/nico`), { bodega: 'beto', rol: 'cajero' }));
    await assertFails(getDoc(doc(otro, `${CUENTAS}/nico`)));
  });

  it('rechaza invitación vencida, inexistente, de otro dueño o la propia', async () => {
    await sembrarInvitacion('VENCDA22', { expira: Timestamp.fromMillis(Date.now() - 1000) });
    await sembrarInvitacion('DEBETX22', { dueno: 'beto', nombreBodega: 'Bodega Beto' });
    await sembrarInvitacion('PRPA2222');
    const nico = comoNico();
    await assertFails(aceptar(nico, 'nico', 'VENCDA22'));
    // Inexistente: el SDK ni siquiera envía el update; el miembro solo se rechaza igual.
    await assertSucceeds(getDoc(doc(nico, `${INV}/NXSTE222`)));
    await assertFails(aceptar(nico, 'nico', 'NXSTE222', { inv: false }));
    // Invitación de beto usada para entrar en la bodega de ana.
    await assertFails(aceptar(nico, 'nico', 'DEBETX22', { dueno: 'ana' }));
    // El dueño no puede ser cajero de sí mismo.
    await assertFails(aceptar(comoAna(), 'ana', 'PRPA2222'));
    // La de beto sí sirve para la bodega de beto.
    await assertSucceeds(aceptar(nico, 'nico', 'DEBETX22', { dueno: 'beto' }));
  });

  it('rechaza un miembro forjado sin invitación o con datos indebidos', async () => {
    await sembrarInvitacion('KMNPQRST');
    const nico = comoNico();
    // Sin marcar la invitación como usada en la misma transacción.
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { inv: false }));
    // Sin invitación alguna.
    await assertFails(
      setDoc(doc(nico, `${base('ana')}/miembros/nico`), {
        rol: 'cajero',
        nombre: 'Nico',
        activo: true,
        desde: serverTimestamp(),
        invitacion: 'ZZZZZZZZ',
      }),
    );
    // Campos distintos de lo permitido.
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { miembro: { rol: 'dueno' } }));
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { miembro: { activo: false } }));
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { miembro: { extra: true } }));
    await assertFails(aceptar(nico, 'nico', 'KMNPQRST', { miembro: { desde: Timestamp.now() } }));
    // Miembro con el uid de otra persona.
    await assertFails(
      runTransaction(nico, async (tx) => {
        const invRef = doc(nico, `${INV}/KMNPQRST`);
        await tx.get(invRef);
        tx.update(invRef, { usadaPor: 'nico' });
        tx.set(
          doc(nico, `${base('ana')}/miembros/zoe`),
          miembroSemilla({ invitacion: 'KMNPQRST', desde: serverTimestamp() }),
        );
      }),
    );
    // Quemar la invitación sin crear el miembro, o marcarla usada por otro.
    await assertFails(updateDoc(doc(nico, `${INV}/KMNPQRST`), { usadaPor: 'nico' }));
    await assertFails(updateDoc(doc(nico, `${INV}/KMNPQRST`), { usadaPor: 'zoe' }));
    // Todo lo anterior falló: la invitación sigue libre y se puede aceptar bien.
    await assertSucceeds(aceptar(nico, 'nico', 'KMNPQRST'));
  });

  it('quitado: no vuelve a entrar reutilizando la invitación que ya usó', async () => {
    await sembrarInvitacion('KMNPQRST');
    const nico = comoNico();
    await assertSucceeds(aceptar(nico, 'nico', 'KMNPQRST'));
    await assertSucceeds(deleteDoc(doc(comoAna(), `${base('ana')}/miembros/nico`)));
    await assertFails(
      setDoc(doc(nico, `${base('ana')}/miembros/nico`), {
        rol: 'cajero',
        nombre: 'Nico',
        activo: true,
        desde: serverTimestamp(),
        invitacion: 'KMNPQRST',
      }),
    );
    // Con una invitación nueva de la misma bodega sí (su cuenta ya apunta aquí).
    await sembrarInvitacion('NVA23456');
    await assertSucceeds(aceptar(nico, 'nico', 'NVA23456', { cuenta: false }));
  });

  it('cuentas: solo después del miembro, activo y de la misma bodega', async () => {
    const nico = comoNico();
    const cuenta = doc(nico, `${CUENTAS}/nico`);
    const miembroNico = (activo) =>
      entorno.withSecurityRulesDisabled((ctx) =>
        setDoc(doc(ctx.firestore(), `${base('ana')}/miembros/nico`), miembroSemilla({ activo })),
      );
    // Sin miembro.
    await assertFails(setDoc(cuenta, { bodega: 'ana', rol: 'cajero' }));
    // Con miembro desactivado.
    await miembroNico(false);
    await assertFails(setDoc(cuenta, { bodega: 'ana', rol: 'cajero' }));
    // Con miembro activo: sí, pero solo con los campos y valores esperados.
    await miembroNico(true);
    await assertFails(setDoc(cuenta, { bodega: 'ana', rol: 'dueno' }));
    await assertFails(setDoc(cuenta, { bodega: 'ana', rol: 'cajero', extra: 1 }));
    await assertFails(setDoc(doc(comoBeto(), `${CUENTAS}/nico`), { bodega: 'ana', rol: 'cajero' }));
    await assertSucceeds(setDoc(cuenta, { bodega: 'ana', rol: 'cajero' }));
  });

  it('una cuenta pertenece a una sola bodega; la deja solo cuando ya no es cajero activo', async () => {
    await sembrarInvitacion('DEBETX22', { dueno: 'beto', nombreBodega: 'Bodega Beto' });
    const caro = comoCaro();
    // Caro (cajera activa de ana) no puede entrar a beto: su cuenta apunta a ana.
    await assertFails(aceptar(caro, 'caro', 'DEBETX22', { dueno: 'beto' }));
    await assertFails(aceptar(caro, 'caro', 'DEBETX22', { dueno: 'beto', cuenta: false }));
    // Tampoco puede borrar su cuenta mientras sigue activa en ana.
    await assertFails(deleteDoc(doc(caro, `${CUENTAS}/caro`)));
    // El dueño la quita: ya puede borrar su cuenta y aceptar la de beto.
    await assertSucceeds(deleteDoc(doc(comoAna(), `${base('ana')}/miembros/caro`)));
    await assertSucceeds(deleteDoc(doc(caro, `${CUENTAS}/caro`)));
    await assertSucceeds(aceptar(caro, 'caro', 'DEBETX22', { dueno: 'beto' }));
    // Desa (desactivada) también puede dejar su cuenta.
    await assertSucceeds(deleteDoc(doc(comoDesa(), `${CUENTAS}/desa`)));
  });
});
