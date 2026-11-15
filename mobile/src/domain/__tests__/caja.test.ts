import type { MovimientoFiado, Venta } from '../entities';
import { ErrorDominio } from '../errors';
import type { RepositorioCaja } from '../portsCaja';
import {
  armarApertura,
  armarCierre,
  armarMovimientoCaja,
  arqueo,
  cajaAbierta,
  cajasConPendientes,
  historialCajas,
  idCierre,
  movimientosCajaConPendientes,
  resumenCaja,
  type Caja,
  type MovimientoCaja,
  type OperacionCaja,
} from '../rules/caja';
import { abrirCaja, cerrarCaja, registrarMovimientoCaja } from '../usecases/caja';

const h = (hora: number, min = 0, dia = 15) => new Date(2026, 10, dia, hora, min);

const abierta = (extra: Partial<Caja> = {}): Caja => ({
  id: 'c1',
  estado: 'abierta',
  apertura: { monto: 50, fecha: h(8), creadaEn: h(8) },
  ...extra,
});

const venta = (
  id: string,
  total: number,
  fecha: Date | null,
  extra: Partial<Venta> = {},
): Pick<Venta, 'id' | 'total' | 'metodoDePago' | 'fecha' | 'creadaEn'> => ({
  id,
  total,
  metodoDePago: 'Efectivo',
  fecha,
  ...extra,
});

const abono = (
  monto: number,
  fecha: Date | null,
  extra: Partial<MovimientoFiado> = {},
): Pick<MovimientoFiado, 'monto' | 'metodoPago' | 'fecha' | 'creadaEn'> => ({
  monto,
  metodoPago: 'Efectivo',
  fecha,
  ...extra,
});

const codigo = (fn: () => unknown): string | undefined => {
  try {
    fn();
  } catch (e) {
    return e instanceof ErrorDominio ? e.codigo : 'otro';
  }
  return undefined;
};

describe('apertura', () => {
  it('abre con monto inicial (0 permitido) redondeado a céntimos', () => {
    expect(armarApertura([], 'c1', 50.005, 1)).toEqual({
      id: 'c1',
      tipo: 'abrir',
      cajaId: 'c1',
      monto: 50.01,
      creadaEn: 1,
    });
    expect(armarApertura([], 'c1', 0, 1)).toMatchObject({ monto: 0 });
  });

  it('una sola caja abierta a la vez', () => {
    expect(codigo(() => armarApertura([abierta()], 'c2', 10, 1))).toBe('CAJA_YA_ABIERTA');
    const cerrada: Caja = { ...abierta(), estado: 'cerrada' };
    expect(codigo(() => armarApertura([cerrada], 'c2', 10, 1))).toBeUndefined();
  });

  it('rechaza montos negativos, no numéricos o absurdos', () => {
    expect(codigo(() => armarApertura([], 'c', -1, 1))).toBe('MONTO_INVALIDO');
    expect(codigo(() => armarApertura([], 'c', Number.NaN, 1))).toBe('MONTO_INVALIDO');
    expect(codigo(() => armarApertura([], 'c', 100_000.01, 1))).toBe('MONTO_INVALIDO');
  });
});

describe('movimientos manuales', () => {
  it('ingreso/egreso con monto > 0 y motivo limpio (máx. 80)', () => {
    const op = armarMovimientoCaja(abierta(), 'm1', 'egreso', 12.3, '  Pago   al  panadero ', 5);
    expect(op).toEqual({
      id: 'm1',
      tipo: 'movimiento',
      cajaId: 'c1',
      movimiento: { tipo: 'egreso', monto: 12.3, motivo: 'Pago al panadero' },
      creadaEn: 5,
    });
    const largo = armarMovimientoCaja(abierta(), 'm2', 'ingreso', 1, 'x'.repeat(200), 5);
    expect(largo.tipo === 'movimiento' && largo.movimiento.motivo.length).toBe(80);
  });

  it('valida caja abierta, monto y motivo', () => {
    const cerrada: Caja = { ...abierta(), estado: 'cerrada' };
    expect(codigo(() => armarMovimientoCaja(undefined, 'm', 'ingreso', 1, 'x', 1))).toBe(
      'CAJA_NO_ABIERTA',
    );
    expect(codigo(() => armarMovimientoCaja(cerrada, 'm', 'ingreso', 1, 'x', 1))).toBe(
      'CAJA_NO_ABIERTA',
    );
    expect(codigo(() => armarMovimientoCaja(abierta(), 'm', 'ingreso', 0, 'x', 1))).toBe(
      'MONTO_INVALIDO',
    );
    expect(codigo(() => armarMovimientoCaja(abierta(), 'm', 'egreso', 5, '   ', 1))).toBe(
      'MOTIVO_VACIO',
    );
    expect(
      codigo(() => armarMovimientoCaja(abierta(), 'm', 'otro' as unknown as 'ingreso', 5, 'x', 1)),
    ).toBe('MONTO_INVALIDO');
  });
});

describe('arqueo y cierre', () => {
  it('diferencia = contado − esperado en céntimos', () => {
    expect(arqueo(100, 100)).toEqual({ diferencia: 0, resultado: 'cuadra' });
    expect(arqueo(100.3, 100.1)).toEqual({ diferencia: 0.2, resultado: 'sobrante' });
    expect(arqueo(95, 100.5)).toEqual({ diferencia: -5.5, resultado: 'faltante' });
  });

  it('el cierre guarda contado, esperado y diferencia; id idempotente', () => {
    expect(armarCierre(abierta(), 98, 100.5, 9)).toEqual({
      id: idCierre('c1'),
      tipo: 'cerrar',
      cajaId: 'c1',
      cierre: { contado: 98, esperado: 100.5, diferencia: -2.5 },
      creadaEn: 9,
    });
    expect(codigo(() => armarCierre(abierta({ estado: 'cerrada' }), 1, 1, 1))).toBe(
      'CAJA_NO_ABIERTA',
    );
    expect(codigo(() => armarCierre(abierta(), -1, 1, 1))).toBe('MONTO_INVALIDO');
  });
});

describe('resumenCaja (esperado)', () => {
  const base = { caja: abierta(), ahora: h(20) };

  it('inicial + ventas en efectivo + abonos en efectivo + ingresos − egresos', () => {
    const movimientosCaja: Pick<MovimientoCaja, 'cajaId' | 'tipo' | 'monto'>[] = [
      { cajaId: 'c1', tipo: 'ingreso', monto: 20 },
      { cajaId: 'c1', tipo: 'egreso', monto: 15.5 },
      { cajaId: 'otra', tipo: 'ingreso', monto: 999 },
    ];
    const r = resumenCaja({
      ...base,
      ventas: [
        venta('v1', 10.1, h(9)),
        venta('v2', 4.2, h(10), { metodoDePago: 'Yape/Plin' }),
        venta('v3', 30, h(11), { metodoDePago: 'Fiado' }),
        venta('v4', 7, h(7, 59)), // antes de abrir
      ],
      movimientosFiado: [
        abono(-5, h(12)),
        abono(-3, h(12), { metodoPago: 'Yape/Plin' }),
        abono(8, h(12)), // cargo
      ],
      movimientosCaja,
    });
    expect(r).toEqual({
      inicial: 50,
      ventasEfectivo: 10.1,
      abonosEfectivo: 5,
      ingresos: 20,
      egresos: 15.5,
      esperado: 69.6,
    });
  });

  it('las anulaciones (contraasiento, D-22) restan', () => {
    const r = resumenCaja({
      ...base,
      ventas: [
        venta('v1', 10, h(9)),
        venta('v1-anulada', -10, h(10), { anulaA: 'v1' } as Partial<Venta>),
        // Anulación de una venta de ayer: también sale del cajón hoy.
        venta('v0-anulada', -4, h(11)),
      ],
      movimientosFiado: [],
      movimientosCaja: [],
    });
    expect(r.ventasEfectivo).toBe(-4);
    expect(r.esperado).toBe(46);
  });

  it('usa la fecha efectiva (D-26) y suma una sola vez lo que está en el outbox y en el servidor', () => {
    const r = resumenCaja({
      ...base,
      ventas: [
        // Cobrada a las 9:00 sin señal, sincronizada a las 21:00 (después de "ahora"): cuenta.
        venta('v1', 3, h(21), { creadaEn: h(9) }),
        // Cobrada ayer, sincronizada hoy: no es de esta sesión.
        venta('v2', 100, h(9), { creadaEn: h(22, 0, 14) }),
        venta('v3', 2, h(10)),
      ],
      ventasPendientes: [
        { ventaId: 'v3', creadaEn: h(10).getTime(), venta: { total: 2, metodoDePago: 'Efectivo' } },
        {
          ventaId: 'p1',
          creadaEn: h(13).getTime(),
          venta: { total: 1.5, metodoDePago: 'Efectivo' },
        },
        { ventaId: 'p2', creadaEn: h(13).getTime(), venta: { total: 9, metodoDePago: 'Fiado' } },
        { ventaId: 'p3', creadaEn: h(7).getTime(), venta: { total: 9, metodoDePago: 'Efectivo' } },
      ],
      movimientosFiado: [abono(-2, null, { creadaEn: h(14) })],
      movimientosCaja: [],
    });
    expect(r.ventasEfectivo).toBe(6.5);
    expect(r.abonosEfectivo).toBe(2);
    expect(r.esperado).toBe(58.5);
  });

  it('una caja cerrada solo cuenta hasta su cierre; sin fecha de apertura usa "ahora"', () => {
    const cerrada: Caja = {
      ...abierta(),
      estado: 'cerrada',
      cierre: { contado: 0, esperado: 0, diferencia: 0, fecha: h(12), creadaEn: h(12) },
    };
    const ventas = [venta('a', 1, h(11)), venta('b', 1, h(13))];
    expect(
      resumenCaja({
        caja: cerrada,
        ventas,
        movimientosFiado: [],
        movimientosCaja: [],
        ahora: h(20),
      }).ventasEfectivo,
    ).toBe(1);
    const sinFecha = abierta({ apertura: { monto: 0, fecha: null } });
    expect(
      resumenCaja({
        caja: sinFecha,
        ventas,
        movimientosFiado: [],
        movimientosCaja: [],
        ahora: h(20),
      }).ventasEfectivo,
    ).toBe(0);
  });
});

describe('cajas con pendientes del outbox', () => {
  const apertura: OperacionCaja = {
    id: 'c9',
    tipo: 'abrir',
    cajaId: 'c9',
    monto: 30,
    creadaEn: h(9).getTime(),
  };

  it('una apertura pendiente aparece como caja abierta "por enviar"', () => {
    const cajas = cajasConPendientes([], [apertura]);
    expect(cajas).toHaveLength(1);
    expect(cajaAbierta(cajas)).toMatchObject({
      id: 'c9',
      pendiente: true,
      apertura: { monto: 30 },
    });
  });

  it('un cierre pendiente la muestra cerrada; si el servidor ya la cerró, gana el servidor', () => {
    const cierre = armarCierre(abierta({ id: 'c9' }), 30, 30, h(18).getTime());
    const cajas = cajasConPendientes([], [apertura, cierre]);
    expect(cajaAbierta(cajas)).toBeUndefined();
    expect(historialCajas(cajas)[0]).toMatchObject({
      estado: 'cerrada',
      pendiente: true,
      cierre: { contado: 30, fecha: h(18) },
    });

    const remota: Caja = {
      id: 'c9',
      estado: 'cerrada',
      apertura: { monto: 30, fecha: h(9) },
      cierre: { contado: 31, esperado: 30, diferencia: 1, fecha: h(18) },
    };
    expect(cajasConPendientes([remota], [apertura, cierre])).toEqual([remota]);
  });

  it('historial: solo cerradas, la más reciente primero; cajaAbierta toma la más reciente', () => {
    const c = (id: string, estado: Caja['estado'], dia: number): Caja => ({
      id,
      estado,
      apertura: { monto: 0, fecha: h(8, 0, dia) },
    });
    const cajas = [
      c('a', 'cerrada', 10),
      c('b', 'cerrada', 12),
      c('x', 'abierta', 11),
      c('y', 'abierta', 13),
    ];
    expect(historialCajas(cajas).map((x) => x.id)).toEqual(['b', 'a']);
    expect(cajaAbierta(cajas)?.id).toBe('y');
  });

  it('movimientos: une confirmados y pendientes de esa caja, más reciente primero', () => {
    const remotos: MovimientoCaja[] = [
      { id: 'm1', cajaId: 'c1', tipo: 'ingreso', monto: 5, motivo: 'a', fecha: h(9) },
      { id: 'm9', cajaId: 'otra', tipo: 'ingreso', monto: 5, motivo: 'a', fecha: h(9) },
    ];
    const ops: OperacionCaja[] = [
      armarMovimientoCaja(abierta(), 'm1', 'ingreso', 5, 'a', h(9).getTime()), // ya llegó
      armarMovimientoCaja(abierta(), 'm2', 'egreso', 3, 'b', h(10).getTime()),
      armarMovimientoCaja(abierta({ id: 'otra' }), 'm3', 'egreso', 3, 'b', h(10).getTime()),
    ];
    const lista = movimientosCajaConPendientes(remotos, ops, 'c1');
    expect(lista.map((m) => [m.id, m.pendiente ?? false])).toEqual([
      ['m2', true],
      ['m1', false],
    ]);
  });
});

describe('casos de uso', () => {
  const repo = () => {
    const guardadas: OperacionCaja[] = [];
    const r: RepositorioCaja = {
      nuevoId: () => 'nueva',
      nuevoIdMovimiento: (cajaId) => `${cajaId}-m`,
      observarCajas: () => () => undefined,
      observarMovimientos: () => () => undefined,
      guardar: async (op) => {
        guardadas.push(op);
      },
    };
    return { r, guardadas };
  };

  it('abrir, mover y cerrar guardan la operación', async () => {
    const { r, guardadas } = repo();
    expect(await abrirCaja(r, [], 20, 1)).toBe('nueva');
    expect(await registrarMovimientoCaja(r, abierta(), 'ingreso', 5, 'Sencillo', 2)).toBe('c1-m');
    await cerrarCaja(r, abierta(), 75, 75, 3);
    expect(guardadas.map((o) => o.tipo)).toEqual(['abrir', 'movimiento', 'cerrar']);
  });

  it('los errores de validación llegan como promesa rechazada y no guardan nada', async () => {
    const { r, guardadas } = repo();
    await expect(abrirCaja(r, [abierta()], 20)).rejects.toThrow(ErrorDominio);
    await expect(registrarMovimientoCaja(r, undefined, 'ingreso', 5, 'x')).rejects.toThrow(
      'No hay una caja abierta',
    );
    await expect(cerrarCaja(r, undefined, 1, 1)).rejects.toThrow(ErrorDominio);
    expect(guardadas).toHaveLength(0);
  });
});
