import type { Firestore } from 'firebase/firestore';

import { CajaFirestore } from '@/data/firebase/cajaFirestore';
import { FiadoFirestore, VentasFirestore } from '@/data/firebase/repositorios';
import { Rutas } from '@/data/firebase/rutas';
import { aVenta } from '@/data/mappers';
import { aCaja, revivirCaja } from '@/data/mappersCaja';
import { sesionDueno, type Sesion } from '@/domain/rules/roles';
import type { OperacionVenta } from '@/domain/rules/venta';

/**
 * D-33: cada escritura lleva la autoría de la sesión (también las que salen del outbox), en
 * la ruta de la bodega (`users/{dueño}`), con los nombres de campo exactos de las reglas.
 */

type Ref = { ruta: string };
type Escritura = { tipo: 'set' | 'update'; ruta: string; datos: Record<string, unknown> };
const mockEscrituras: Escritura[] = [];
const mockDocumentos = new Map<string, Record<string, unknown>>();

jest.mock('firebase/firestore', () => {
  const actual = jest.requireActual<typeof import('firebase/firestore')>('firebase/firestore');
  return {
    ...actual,
    collection: (_db: unknown, ruta: string) => ({ ruta }),
    doc: (padre: Ref, id?: string) => ({ ruta: `${padre.ruta}/${id ?? 'nuevo'}` }),
    serverTimestamp: () => 'HORA_SERVIDOR',
    increment: (n: number) => ({ incremento: n }),
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: async (ref: Ref) => {
          const d = mockDocumentos.get(ref.ruta);
          return { exists: () => !!d, get: (campo: string) => d?.[campo] };
        },
        set: (ref: Ref, datos: Record<string, unknown>) =>
          mockEscrituras.push({ tipo: 'set', ruta: ref.ruta, datos }),
        update: (ref: Ref, datos: Record<string, unknown>) =>
          mockEscrituras.push({ tipo: 'update', ruta: ref.ruta, datos }),
      }),
  };
});

const db = {} as Firestore;
const rosa: Sesion = { uid: 'cajero1', bodega: 'dueno1', rol: 'cajero', nombre: 'Rosa' };
const lucho = sesionDueno('dueno1', 'Lucho');
const BASE = 'artifacts/mi-bodega-app/users/dueno1';

const ventaFiada: OperacionVenta = {
  ventaId: 'v1',
  cargoId: 'c1',
  venta: {
    items: [
      { id: 'arroz', nombre: 'Arroz', precio: 4, cantidad: 2 },
      { id: 'pan', nombre: 'Pan', precio: 0.5, cantidad: 4 },
    ],
    total: 10,
    metodoDePago: 'Fiado',
    clienteId: 'cli1',
  },
  cargo: { clienteId: 'cli1', monto: 10, descripcion: 'Arroz (x2)', ventaId: 'v1', pagado: false },
  deltasStock: [
    { productoId: 'arroz', delta: -2 },
    { productoId: 'pan', delta: -4 },
  ],
  creadaEn: Date.now(),
};

beforeEach(() => {
  mockEscrituras.length = 0;
  mockDocumentos.clear();
  mockDocumentos.set(`${BASE}/productos/arroz`, { stock: 10 });
  // Stock heredado como texto (lo escribía la web vieja).
  mockDocumentos.set(`${BASE}/productos/pan`, { stock: '20' });
});

const de = (ruta: string) => mockEscrituras.find((e) => e.ruta === ruta);

describe('Autoría al confirmar el outbox (D-33)', () => {
  it('venta fiada del cajero: en la bodega del dueño, con vendidoPor y registradoPor', async () => {
    const ventas = new VentasFirestore(db, new Rutas(db, 'mi-bodega-app', rosa.bodega), rosa);
    await expect(ventas.confirmar(ventaFiada)).resolves.toBe('escrita');

    expect(de(`${BASE}/ventas/v1`)?.datos).toMatchObject({
      vendidoPor: 'cajero1',
      vendidoPorNombre: 'Rosa',
      fecha: 'HORA_SERVIDOR',
    });
    expect(de(`${BASE}/deudas/c1`)?.datos).toMatchObject({
      registradoPor: 'cajero1',
      registradoPorNombre: 'Rosa',
      ventaId: 'v1',
    });
    // El cajero solo baja stock numérico: el stock en texto se omite (las reglas lo negarían).
    expect(de(`${BASE}/productos/arroz`)?.datos).toEqual({ stock: { incremento: -2 } });
    expect(de(`${BASE}/productos/pan`)).toBeUndefined();
  });

  it('el dueño firma con su uid y conserva el comportamiento de stock de siempre', async () => {
    const ventas = new VentasFirestore(db, new Rutas(db, 'mi-bodega-app', 'dueno1'), lucho);
    await ventas.confirmar(ventaFiada);
    expect(de(`${BASE}/ventas/v1`)?.datos).toMatchObject({
      vendidoPor: 'dueno1',
      vendidoPorNombre: 'Lucho',
    });
    expect(de(`${BASE}/productos/pan`)?.datos).toEqual({ stock: { incremento: -4 } });
  });

  it('sin sesión (compatibilidad) no agrega campos de autoría', async () => {
    const ventas = new VentasFirestore(db, new Rutas(db, 'mi-bodega-app', 'dueno1'));
    await ventas.confirmar(ventaFiada);
    expect(de(`${BASE}/ventas/v1`)?.datos).not.toHaveProperty('vendidoPor');
    expect(de(`${BASE}/deudas/c1`)?.datos).not.toHaveProperty('registradoPor');
  });

  it('abono del outbox de fiado', async () => {
    const fiado = new FiadoFirestore(db, new Rutas(db, 'mi-bodega-app', 'dueno1'), rosa);
    await fiado.confirmar({
      id: 'a1',
      tipo: 'abono',
      datos: {
        clienteId: 'cli1',
        monto: -5,
        descripcion: 'Pago',
        pagado: false,
        metodoPago: 'Efectivo',
      },
      creadaEn: Date.now(),
    });
    expect(de(`${BASE}/deudas/a1`)?.datos).toMatchObject({
      monto: -5,
      registradoPor: 'cajero1',
      registradoPorNombre: 'Rosa',
      origen: 'movil',
    });
  });

  it('caja: apertura, movimiento y cierre con abiertaPor, registradoPor y cerradaPor', async () => {
    const caja = new CajaFirestore(db, new Rutas(db, 'mi-bodega-app', 'dueno1'), rosa);
    const ahora = Date.now();
    await caja.confirmar({ id: 'k1', tipo: 'abrir', cajaId: 'k1', monto: 50, creadaEn: ahora });
    expect(de(`${BASE}/cajas/k1`)?.datos).toMatchObject({
      estado: 'abierta',
      abiertaPor: 'cajero1',
      abiertaPorNombre: 'Rosa',
    });

    await caja.confirmar({
      id: 'm1',
      tipo: 'movimiento',
      cajaId: 'k1',
      movimiento: { tipo: 'egreso', monto: 10, motivo: 'Proveedor' },
      creadaEn: ahora,
    });
    expect(de(`${BASE}/cajas/k1/movimientos/m1`)?.datos).toMatchObject({
      registradoPor: 'cajero1',
      registradoPorNombre: 'Rosa',
    });

    mockDocumentos.set(`${BASE}/cajas/k1`, { estado: 'abierta' });
    await caja.confirmar({
      id: 'k1-cierre',
      tipo: 'cerrar',
      cajaId: 'k1',
      cierre: { contado: 40, esperado: 40, diferencia: 0 },
      creadaEn: ahora,
    });
    const cierre = mockEscrituras.find((e) => e.tipo === 'update');
    expect(cierre?.datos).toMatchObject({
      estado: 'cerrada',
      cerradaPor: 'cajero1',
      cerradaPorNombre: 'Rosa',
    });
    // Solo las claves que las reglas permiten cambiar al cerrar.
    expect(Object.keys(cierre?.datos ?? {}).sort()).toEqual(
      ['cerradaPor', 'cerradaPorNombre', 'cierre', 'estado'].sort(),
    );
  });
});

describe('Lectura de la autoría (mappers)', () => {
  it('la venta conserva vendidoPor/vendidoPorNombre; las viejas quedan igual', () => {
    expect(aVenta('v1', { total: 5, vendidoPor: 'c1', vendidoPorNombre: 'Rosa' })).toMatchObject({
      vendidoPor: 'c1',
      vendidoPorNombre: 'Rosa',
    });
    expect(aVenta('v2', { total: 5 })).not.toHaveProperty('vendidoPor');
    expect(aVenta('v3', { total: 5, vendidoPor: 42 })).not.toHaveProperty('vendidoPor');
  });

  it('la caja conserva quién abrió y cerró, también al revivir la caché', () => {
    const caja = aCaja('k1', {
      estado: 'cerrada',
      apertura: { monto: 1 },
      abiertaPor: 'c1',
      abiertaPorNombre: 'Rosa',
      cerradaPor: 'd1',
      cerradaPorNombre: 'Lucho',
    });
    const revivida = revivirCaja(JSON.parse(JSON.stringify(caja)) as typeof caja);
    expect(revivida).toMatchObject({ abiertaPorNombre: 'Rosa', cerradaPorNombre: 'Lucho' });
  });
});
