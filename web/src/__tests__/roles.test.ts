import { armarOperacionVenta, sesionDueno, type MovimientoFiado, type Sesion } from '@bodegon/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FuenteDatos } from '../datos';

/**
 * Cajeros y roles (D-33) en la web: lo que escribe la capa de datos (autoría y stock del
 * cajero, con Firestore simulado) y lo que muestra cada rol (permisos del core).
 */

// ---------- Firestore simulado: registra lo que escribe cada transacción ----------
interface Escritura {
  op: 'set' | 'update' | 'delete' | 'add';
  ruta: string;
  datos?: Record<string, unknown>;
}
const escrituras: Escritura[] = [];
const documentos = new Map<string, Record<string, unknown>>();

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn() }));
vi.mock('firebase/firestore', () => {
  const ref = (path: string) => ({ path, id: path.split('/').pop() });
  return {
    collection: (_db: unknown, path: string) => ref(path),
    doc: (base: { path: string } | unknown, ...partes: string[]) => {
      const p = typeof base === 'object' && base && 'path' in base ? (base as { path: string }).path : '';
      return ref([p, ...partes].filter(Boolean).join('/') || 'auto');
    },
    serverTimestamp: () => 'SELLO',
    increment: (n: number) => ({ increment: n }),
    Timestamp: { fromMillis: (n: number) => ({ ms: n }), fromDate: (d: Date) => ({ ms: d.getTime() }), now: () => ({ ms: 0 }) },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        get: async (r: { path: string }) => {
          const d = documentos.get(r.path);
          return { exists: () => !!d, data: () => d ?? {}, get: (k: string) => d?.[k] };
        },
        set: (r: { path: string }, datos: Record<string, unknown>) => escrituras.push({ op: 'set', ruta: r.path, datos }),
        update: (r: { path: string }, datos: Record<string, unknown>) => escrituras.push({ op: 'update', ruta: r.path, datos }),
        delete: (r: { path: string }) => escrituras.push({ op: 'delete', ruta: r.path }),
      };
      await fn(tx);
    },
    addDoc: async (r: { path: string }, datos: Record<string, unknown>) => {
      escrituras.push({ op: 'add', ruta: r.path, datos });
      return { id: 'nuevo' };
    },
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    getDoc: vi.fn(),
    onSnapshot: vi.fn(() => () => undefined),
    query: (r: unknown) => r,
    where: vi.fn(),
  };
});

const { fuenteFirestore } = await import('../fuenteFirestore');
const store = await import('../store');
const sesionMod = await import('../sesion');
const datosMod = await import('../datos');
const productos = await import('../views/productos');
const cobrar = await import('../views/cobrar');
const vender = await import('../views/vender');
const ajustes = await import('../views/ajustes');

const DUENO = 'dueno-1';
const ROSA = 'rosa-1';
const cajera: Sesion = { uid: ROSA, bodega: DUENO, rol: 'cajero', nombre: 'Rosa' };
const BASE = `artifacts/mi-bodega-app/users/${DUENO}`;

function entrarComo(s: Sesion): void {
  sesionMod.fijarSesion(s);
  store.setUserId(s.bodega);
}

beforeEach(() => {
  escrituras.length = 0;
  documentos.clear();
  document.body.innerHTML = `
    <div id="app"><section id="v"></section></div>
    <div id="panel-fondo" hidden></div>
    <aside id="panel" hidden></aside>
    <div id="aviso" hidden></div>`;
  datosMod.reiniciarDatos();
  store.resetState();
  vender.reiniciarVender();
});

describe('venta del cajero en Firestore', () => {
  const op = () =>
    armarOperacionVenta({
      carrito: [
        { id: 'arroz', nombre: 'Arroz', precio: 4.6, cantidad: 2 },
        { id: 'pan', nombre: 'Pan', precio: 0.3, cantidad: 5 },
      ],
      metodoDePago: 'Fiado',
      clienteId: 'c1',
      ventaId: 'v1',
      cargoId: 'd1',
      ahora: Date.now(),
    });

  it('en users/{bodega del dueño}, sellada con vendidoPor/registradoPor y sin tocar stock null', async () => {
    entrarComo(cajera);
    documentos.set(`${BASE}/productos/arroz`, { nombre: 'Arroz', precio: 4.6, stock: 10 });
    documentos.set(`${BASE}/productos/pan`, { nombre: 'Pan', precio: 0.3, stock: null });
    await fuenteFirestore.cobrar(op());

    const venta = escrituras.find((e) => e.ruta === `${BASE}/ventas/v1`);
    expect(venta?.datos).toMatchObject({ vendidoPor: ROSA, vendidoPorNombre: 'Rosa', fecha: 'SELLO', total: 10.7 });
    const cargo = escrituras.find((e) => e.ruta === `${BASE}/deudas/d1`);
    expect(cargo?.datos).toMatchObject({ registradoPor: ROSA, registradoPorNombre: 'Rosa', ventaId: 'v1', monto: 10.7 });
    const stock = escrituras.filter((e) => e.op === 'update');
    expect(stock).toEqual([{ op: 'update', ruta: `${BASE}/productos/arroz`, datos: { stock: { increment: -2 } } }]);
  });

  it('el dueño sigue igual (más su firma): stock controlado se descuenta como antes', async () => {
    entrarComo(sesionDueno(DUENO, 'Lucho'));
    documentos.set(`${BASE}/productos/arroz`, { stock: 10 });
    documentos.set(`${BASE}/productos/pan`, { stock: null });
    await fuenteFirestore.cobrar(op());
    expect(escrituras.find((e) => e.ruta.endsWith('/ventas/v1'))?.datos).toMatchObject({ vendidoPor: DUENO, vendidoPorNombre: 'Lucho' });
    expect(escrituras.filter((e) => e.op === 'update').map((e) => e.ruta)).toEqual([`${BASE}/productos/arroz`]);
  });

  it('abonos y movimientos de caja también llevan quién los hizo', async () => {
    entrarComo(cajera);
    await fuenteFirestore.registrarMovimiento({ clienteId: 'c1', monto: -5, descripcion: 'Abono', pagado: false, metodoPago: 'Efectivo' });
    expect(escrituras[0]).toMatchObject({ op: 'add', ruta: `${BASE}/deudas`, datos: { registradoPor: ROSA, registradoPorNombre: 'Rosa' } });

    documentos.set(`${BASE}/cajas/c1`, { estado: 'abierta' });
    await fuenteFirestore.guardarCaja({ id: 'c1-cierre', tipo: 'cerrar', cajaId: 'c1', cierre: { contado: 10, esperado: 10, diferencia: 0 }, creadaEn: 1 });
    expect(escrituras[1]).toMatchObject({ op: 'update', ruta: `${BASE}/cajas/c1`, datos: { cerradaPor: ROSA, cerradaPorNombre: 'Rosa' } });
  });
});

// ---------- Interfaz según el rol ----------
function fuenteFalsa(): FuenteDatos {
  return {
    nuevoIdVenta: () => 'v1',
    nuevoIdCargo: () => 'd1',
    cobrar: vi.fn(async () => undefined),
    deshacerVenta: vi.fn(async () => undefined),
    guardarProducto: vi.fn(async () => undefined),
    eliminarProducto: vi.fn(async () => undefined),
    ajustarStock: vi.fn(async () => undefined),
    guardarCliente: vi.fn(async () => 'nuevo'),
    registrarMovimiento: vi.fn(async () => undefined),
    eliminarMovimiento: vi.fn(async () => undefined),
    marcarRecordatorio: vi.fn(async () => undefined),
    observarRango: vi.fn(() => () => undefined),
    nuevoIdCaja: () => 'caja',
    nuevoIdMovimientoCaja: () => 'mc',
    guardarCaja: vi.fn(async () => undefined),
    observarMovimientosCaja: vi.fn(() => () => undefined),
    cerrarSesion: vi.fn(async () => undefined),
  };
}

describe('lo que ve el cajero (PERMISOS del core)', () => {
  const v = () => document.getElementById('v')!;

  it('Productos: ve el stock pero no lo ajusta, no edita ni crea productos', () => {
    entrarComo(cajera);
    datosMod.usarFuente(fuenteFalsa());
    productos.montarProductos(v());
    productos.mostrarProductos();
    datosMod.actualizarDatos({ productos: [{ id: 'p', nombre: 'Arroz', precio: 4.6, stock: 12 }] });
    productos.renderProductos(datosMod.datos());
    expect(v().querySelector('[data-stock]')).toBeNull();
    expect(v().querySelector('[data-editar]')).toBeNull();
    expect(v().querySelector<HTMLElement>('[data-nuevo-producto]')?.hidden).toBe(true);
    expect(v().textContent).toContain('12 en stock');
  });

  it('Productos del dueño: igual que antes', () => {
    entrarComo(sesionDueno(DUENO, 'Lucho'));
    datosMod.usarFuente(fuenteFalsa());
    productos.montarProductos(v());
    productos.mostrarProductos();
    datosMod.actualizarDatos({ productos: [{ id: 'p', nombre: 'Arroz', precio: 4.6, stock: 12 }] });
    productos.renderProductos(datosMod.datos());
    expect(v().querySelectorAll('[data-stock]')).toHaveLength(2);
    expect(v().querySelector('[data-editar]')).not.toBeNull();
    expect(v().querySelector<HTMLElement>('[data-nuevo-producto]')?.hidden).toBe(false);
  });

  const mov = (id: string, monto: number, extra: Partial<MovimientoFiado> & { autor?: { uid: string; nombre: string } } = {}) => ({
    id,
    clienteId: 'c1',
    monto,
    descripcion: id,
    fecha: new Date(Date.UTC(2026, 10, 1, 15)),
    pagado: false,
    ...extra,
  });

  it('Por cobrar: el cajero registra abonos, pero no edita al cliente, no fía sin venta ni borra', () => {
    entrarComo(cajera);
    datosMod.usarFuente(fuenteFalsa());
    cobrar.montarCobrar(v());
    datosMod.actualizarDatos({
      clientes: [{ id: 'c1', nombre: 'Rosa Quispe', telefono: '987 654 321' }],
      movimientos: [mov('Arroz', 12.5)],
    });
    cobrar.renderCobrar(datosMod.datos());
    document.querySelector<HTMLElement>('[data-cliente="c1"]')!.click();
    const panel = document.getElementById('panel')!;
    expect(panel.querySelector('#form-abono')).not.toBeNull();
    expect(panel.querySelector('[data-liquidar]')).not.toBeNull();
    expect(panel.querySelector('[data-editar-cliente]')).toBeNull();
    expect(panel.querySelector('#form-cargo')).toBeNull();
    expect(panel.querySelector('[data-eliminar]')).toBeNull();
    expect(panel.querySelector('[data-recordar]')).not.toBeNull();
  });

  it('cuaderno: "Registró: Rosa" para el dueño; nada para lo que anotó él mismo', () => {
    entrarComo(sesionDueno(DUENO, 'Lucho'));
    const div = document.createElement('div');
    div.innerHTML = cobrar.htmlHistorial([
      mov('Arroz', 12.5, { autor: { uid: ROSA, nombre: 'Rosa' } }),
      mov('Pan', 3, { autor: { uid: DUENO, nombre: 'Lucho' } }),
    ]);
    expect(div.textContent).toContain('Registró: Rosa');
    expect(div.textContent).not.toContain('Registró: Lucho');
    expect(div.querySelectorAll('[data-eliminar]')).toHaveLength(2);
  });

  it('Vender: tras cobrar, el cajero no tiene "Deshacer" (anular es del dueño)', async () => {
    entrarComo(cajera);
    const f = fuenteFalsa();
    datosMod.usarFuente(f);
    vender.montarVender(v());
    datosMod.actualizarDatos({ productos: [{ id: 'p', nombre: 'Arroz', precio: 4.6, stock: 3 }], clientes: [] });
    vender.renderVender(datosMod.datos());
    v().querySelector<HTMLElement>('[data-producto="p"]')!.click();
    v().querySelector<HTMLButtonElement>('#btn-cobrar')!.click();
    await vi.waitFor(() => expect(v().querySelector('[data-nueva-venta]')).not.toBeNull());
    expect(f.cobrar).toHaveBeenCalledOnce();
    expect(v().querySelector('[data-deshacer]')).toBeNull();
    expect(v().textContent).toContain('avísale al dueño');
  });

  it('Ajustes: Equipo y "Tengo un código" solo para el dueño', () => {
    sesionMod.fijarAccionesCuenta({ unirmeConCodigo: vi.fn() });
    entrarComo(sesionDueno(DUENO, 'Lucho'));
    ajustes.montarAjustes(v());
    expect(v().querySelector('a[href="#equipo"]')).not.toBeNull();
    expect(v().querySelector('[data-unirme]')).not.toBeNull();
    entrarComo(cajera);
    ajustes.mostrarAjustes();
    expect(v().querySelector('a[href="#equipo"]')).toBeNull();
    expect(v().querySelector('[data-unirme]')).toBeNull();
    expect(v().textContent).toContain('Bodega donde trabajas');
    sesionMod.fijarAccionesCuenta(null);
  });

  it('autoría: "Tú" para lo propio y el nombre guardado para lo de otro', () => {
    entrarComo(cajera);
    expect(sesionMod.nombreDeAutor({ uid: ROSA, nombre: 'Rosa' })).toBe('Tú');
    expect(sesionMod.nombreDeAutor({ uid: DUENO, nombre: '' })).toBe('Dueño');
    expect(sesionMod.esDeOtro({ uid: DUENO, nombre: 'Lucho' })).toBe(true);
    expect(sesionMod.esDeOtro(undefined)).toBe(false);
    expect(sesionMod.permite('verReportes')).toBe(false);
    sesionMod.fijarSesion(null);
    expect(sesionMod.permite('registrarVenta')).toBe(false);
  });
});
