import type { Caja, MovimientoCaja } from '@/domain/rules/caja';

import { aCliente, revivirCliente } from '../mappers';
import { aCaja, aMovimientoCaja, revivirCaja, revivirMovimientoCaja } from '../mappersCaja';

const ts = (d: Date) => ({ toDate: () => d });
const f = new Date(2026, 10, 15, 8);
const g = new Date(2026, 10, 15, 20);

describe('cliente.ultimoRecordatorio (D-27)', () => {
  it('se lee como Date solo si es válido', () => {
    expect(aCliente('c', { nombre: 'Ana', ultimoRecordatorio: ts(f) }).ultimoRecordatorio).toEqual(
      f,
    );
    expect(aCliente('c', { nombre: 'Ana', ultimoRecordatorio: 'ayer' })).toEqual({
      id: 'c',
      nombre: 'Ana',
      telefono: '',
    });
  });

  it('la caché JSON se revive', () => {
    const json = JSON.parse(
      JSON.stringify({ id: 'c', nombre: 'Ana', telefono: '', ultimoRecordatorio: f }),
    ) as Parameters<typeof revivirCliente>[0];
    expect(revivirCliente(json).ultimoRecordatorio).toEqual(f);
    const sinCampo = { id: 'c', nombre: 'Ana', telefono: '' };
    expect(revivirCliente(sinCampo)).toBe(sinCampo);
    const roto = { ...sinCampo, ultimoRecordatorio: 'x' as unknown as Date };
    expect(revivirCliente(roto)).toEqual(sinCampo);
  });
});

describe('caja (D-28)', () => {
  it('caja abierta y cerrada; estado desconocido = cerrada', () => {
    expect(
      aCaja('c1', {
        estado: 'abierta',
        apertura: { monto: '50', fecha: ts(f), creadaEn: ts(f) },
      }),
    ).toEqual({ id: 'c1', estado: 'abierta', apertura: { monto: 50, fecha: f, creadaEn: f } });
    expect(
      aCaja('c2', {
        estado: 'cerrada',
        apertura: { monto: 0, fecha: null },
        cierre: { contado: 10, esperado: 12, diferencia: -2, fecha: ts(g) },
      }),
    ).toEqual({
      id: 'c2',
      estado: 'cerrada',
      apertura: { monto: 0, fecha: null },
      cierre: { contado: 10, esperado: 12, diferencia: -2, fecha: g },
    });
    expect(aCaja('c3', { estado: 'rara' })).toMatchObject({
      estado: 'cerrada',
      apertura: { monto: 0, fecha: null },
    });
  });

  it('movimiento: tipo desconocido = ingreso, motivo no texto = vacío', () => {
    expect(
      aMovimientoCaja('c1', 'm1', { tipo: 'egreso', monto: 7, motivo: 'Pan', fecha: ts(f) }),
    ).toEqual({ id: 'm1', cajaId: 'c1', tipo: 'egreso', monto: 7, motivo: 'Pan', fecha: f });
    expect(aMovimientoCaja('c1', 'm2', { tipo: 'x', monto: 'abc', motivo: 3 })).toMatchObject({
      tipo: 'ingreso',
      monto: 0,
      motivo: '',
      fecha: null,
    });
  });

  it('revive cajas y movimientos guardados como JSON', () => {
    const caja: Caja = {
      id: 'c',
      estado: 'cerrada',
      apertura: { monto: 1, fecha: f, creadaEn: f },
      cierre: { contado: 1, esperado: 1, diferencia: 0, fecha: null, creadaEn: g },
    };
    expect(revivirCaja(JSON.parse(JSON.stringify(caja)) as Caja)).toEqual(caja);
    const abierta: Caja = { id: 'a', estado: 'abierta', apertura: { monto: 1, fecha: null } };
    expect(revivirCaja(JSON.parse(JSON.stringify(abierta)) as Caja)).toEqual(abierta);

    const mov: MovimientoCaja = {
      id: 'm',
      cajaId: 'c',
      tipo: 'ingreso',
      monto: 2,
      motivo: 'x',
      fecha: f,
      creadaEn: g,
    };
    expect(revivirMovimientoCaja(JSON.parse(JSON.stringify(mov)) as MovimientoCaja)).toEqual(mov);
    expect(
      revivirMovimientoCaja({ ...mov, fecha: 'basura' as unknown as Date, creadaEn: undefined }),
    ).toEqual({ id: 'm', cajaId: 'c', tipo: 'ingreso', monto: 2, motivo: 'x', fecha: null });
  });
});
