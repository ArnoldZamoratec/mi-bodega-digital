import AsyncStorage from '@react-native-async-storage/async-storage';

import { CONFIG_NEGOCIO_POR_DEFECTO } from '@/domain/entities';

import { mensajeDeError } from '../firebase/errores';
import { CacheCatalogo } from '../local/cacheCatalogo';
import { aCliente, aConfig, aMovimiento, aProducto, aVenta, deProducto, fecha } from '../mappers';

const ts = (d: Date) => ({ toDate: () => d });

describe('mappers (tolerantes a datos escritos por la web)', () => {
  it('producto: stock null/ausente/string y precio string', () => {
    expect(aProducto('1', { nombre: 'Arroz', precio: '4.5', stock: '3' })).toEqual({
      id: '1',
      nombre: 'Arroz',
      precio: 4.5,
      stock: 3,
    });
    expect(aProducto('2', { nombre: 'Pan', precio: 0.3, stock: null }).stock).toBeNull();
    expect(aProducto('3', { nombre: 'X', precio: 1 }).stock).toBeNull();
    expect(aProducto('4', { precio: 'abc', stock: 'abc' })).toMatchObject({
      nombre: '(sin nombre)',
      precio: 0,
      stock: null,
    });
    expect(
      aProducto('5', { nombre: 'Y', precio: 1, stock: 2, codigoBarras: ' 775 ' }).codigoBarras,
    ).toBe('775');
  });

  it('producto → Firestore solo incluye codigoBarras si existe', () => {
    expect(deProducto({ nombre: 'A', precio: 1, stock: null })).toEqual({
      nombre: 'A',
      precio: 1,
      stock: null,
    });
    expect(deProducto({ nombre: 'A', precio: 1, stock: 2, codigoBarras: '9' })).toHaveProperty(
      'codigoBarras',
      '9',
    );
  });

  it('cliente sin teléfono', () => {
    expect(aCliente('c', { nombre: 'Ana' })).toEqual({ id: 'c', nombre: 'Ana', telefono: '' });
  });

  it('venta con items y fecha Timestamp', () => {
    const d = new Date(2026, 0, 1);
    const v = aVenta('v', {
      items: [{ id: 'a', nombre: 'Arroz', precio: 4, cantidad: 2 }, null, 'basura'],
      total: 8,
      metodoDePago: 'Yape/Plin',
      clienteId: null,
      fecha: ts(d),
    });
    expect(v.items).toHaveLength(1);
    expect(v.metodoDePago).toBe('Yape/Plin');
    expect(v.fecha).toBe(d);
    expect(aVenta('w', { metodoDePago: '???', clienteId: '' })).toMatchObject({
      metodoDePago: 'Efectivo',
      clienteId: null,
      fecha: null,
      items: [],
    });
  });

  it('movimiento: cargo de venta y abono con método', () => {
    expect(
      aMovimiento('m', {
        clienteId: 'c',
        monto: 10,
        descripcion: 'x',
        pagado: false,
        ventaId: 'v',
      }),
    ).toMatchObject({
      ventaId: 'v',
      pagado: false,
    });
    const abono = aMovimiento('a', {
      clienteId: 'c',
      monto: -5,
      metodoPago: 'Efectivo',
      deudaOrigenId: 'm',
    });
    expect(abono).toMatchObject({ metodoPago: 'Efectivo', deudaOrigenId: 'm', pagado: false });
    expect(aMovimiento('b', { monto: -1, metodoPago: 'Otro', pagado: 'si' })).not.toHaveProperty(
      'metodoPago',
    );
  });

  it('creadaEn (D-26): se lee si es fecha válida; ausente en documentos de la web', () => {
    const cobro = new Date(2026, 9, 19, 23, 50);
    expect(aVenta('v', { total: 1, creadaEn: ts(cobro) }).creadaEn).toBe(cobro);
    expect(aVenta('w', { total: 1 })).not.toHaveProperty('creadaEn');
    expect(aVenta('x', { total: 1, creadaEn: 'ayer' })).not.toHaveProperty('creadaEn');
    expect(aMovimiento('m', { monto: 5, creadaEn: ts(cobro) }).creadaEn).toBe(cobro);
    expect(aMovimiento('n', { monto: 5 })).not.toHaveProperty('creadaEn');
  });

  it('fecha acepta Date, epoch y Timestamp', () => {
    const d = new Date(5);
    expect(fecha(d)).toBe(d);
    expect(fecha(5)?.getTime()).toBe(5);
    expect(fecha('2026')).toBeNull();
  });

  it('config: defaults y saneamiento', () => {
    expect(aConfig(undefined)).toEqual(CONFIG_NEGOCIO_POR_DEFECTO);
    expect(
      aConfig({ nombre: 'Bodega Rosita', diasVencimientoFiado: 0, horaRecordatorioFiado: 30 }),
    ).toMatchObject({
      nombre: 'Bodega Rosita',
      diasVencimientoFiado: 1,
      horaRecordatorioFiado: 9,
    });
    expect(aConfig({ horaRecordatorioFiado: null, alertasStockBajo: false })).toMatchObject({
      horaRecordatorioFiado: null,
      alertasStockBajo: false,
    });
  });
});

describe('mensajes de error', () => {
  it('traduce códigos de Firebase al español', () => {
    expect(mensajeDeError({ code: 'auth/invalid-credential' })).toMatch(/Credenciales/);
    expect(mensajeDeError({ code: 'permission-denied' })).toMatch(/permiso/);
    expect(mensajeDeError(new Error('raro'), 'Falló')).toBe('Falló');
  });
});

describe('caché de catálogo', () => {
  it('guarda y lee por usuario, tolera datos corruptos', async () => {
    const cache = new CacheCatalogo(AsyncStorage, 'u1');
    expect(await cache.leer('productos')).toBeNull();
    await cache.guardar('productos', [{ id: 1 }]);
    expect(await cache.leer('productos')).toEqual([{ id: 1 }]);
    expect(await new CacheCatalogo(AsyncStorage, 'u2').leer('productos')).toBeNull();
    await AsyncStorage.setItem('bodega:cache:u1:clientes', '{no json');
    expect(await cache.leer('clientes')).toBeNull();
  });
});
