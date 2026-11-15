import { describe, expect, it } from 'vitest';

import { aCliente, aFecha, aMovimiento, aProducto, aVenta } from '../mappers';

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe('mappers Firestore → core', () => {
  it('aFecha acepta Timestamp, Date y null', () => {
    expect(aFecha(ts('2026-11-15T10:00:00Z'))?.toISOString()).toBe('2026-11-15T10:00:00.000Z');
    expect(aFecha(new Date('2026-11-15T10:00:00Z'))).toBeInstanceOf(Date);
    expect(aFecha(null)).toBeNull();
    expect(aFecha(undefined)).toBeNull();
    expect(aFecha('2026-11-15')).toBeNull();
  });

  it('producto heredado: stock ausente/null = sin control', () => {
    expect(aProducto('p', { nombre: 'Pan', precio: 0.5 }).stock).toBeNull();
    expect(aProducto('p', { nombre: 'Pan', precio: 0.5, stock: null }).stock).toBeNull();
    expect(aProducto('p', { nombre: 'Pan', precio: '0.5', stock: 3 })).toEqual({
      id: 'p',
      nombre: 'Pan',
      precio: 0.5,
      stock: 3,
    });
  });

  it('cliente sin teléfono', () => {
    expect(aCliente('c', { nombre: 'Rosa' })).toEqual({ id: 'c', nombre: 'Rosa', telefono: '' });
  });

  it('venta: conserva creadaEn (D-26) y anulaA', () => {
    const v = aVenta('v', {
      items: [{ id: 'p', nombre: 'Pan', precio: 1, cantidad: 2 }],
      total: 2,
      metodoDePago: 'Efectivo',
      clienteId: null,
      fecha: ts('2026-11-16T05:10:00Z'),
      creadaEn: ts('2026-11-16T04:50:00Z'),
      anulaA: 'x',
    });
    expect(v.creadaEn?.toISOString()).toBe('2026-11-16T04:50:00.000Z');
    expect(v.anulaA).toBe('x');
    expect(v.items).toHaveLength(1);
  });

  it('venta sin items ni fecha no rompe', () => {
    const v = aVenta('v', { total: 'abc' });
    expect(v.items).toEqual([]);
    expect(v.total).toBe(0);
    expect(v.fecha).toBeNull();
    expect('creadaEn' in v).toBe(false);
  });

  it('movimiento: pagado estricto y método de abono solo si es conocido', () => {
    const m = aMovimiento('d', {
      clienteId: 'c',
      monto: -5,
      descripcion: 'Abono',
      fecha: ts('2026-11-15T15:00:00Z'),
      pagado: 'true',
      metodoPago: 'Tarjeta',
    });
    expect(m.pagado).toBe(false);
    expect(m.metodoPago).toBeUndefined();
    expect(aMovimiento('d', { metodoPago: 'Yape/Plin' }).metodoPago).toBe('Yape/Plin');
  });
});
