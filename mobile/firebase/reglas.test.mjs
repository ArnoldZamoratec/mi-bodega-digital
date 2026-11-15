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
  increment,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
