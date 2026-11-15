import type { MovimientoFiado } from '../entities';
import { ErrorDominio } from '../errors';
import {
  armarAbono,
  armarCargo,
  armarLiquidacion,
  calcularSaldo,
  cargoMasAntiguoPendiente,
  cargosVencidos,
  estadoDeCargos,
  ordenarCronologico,
  saldosPorCliente,
} from '../rules/fiado';

const dia = (d: number) => new Date(2026, 0, d, 10, 0, 0);

const mov = (
  id: string,
  monto: number,
  fecha: Date | null,
  extra: Partial<MovimientoFiado> = {},
): MovimientoFiado => ({
  id,
  clienteId: 'c1',
  monto,
  descripcion: id,
  fecha,
  pagado: false,
  ...extra,
});

describe('saldo (misma fórmula que la web)', () => {
  it('suma cargos no pagados y resta abonos', () => {
    const movs = [mov('c1', 10, dia(1)), mov('c2', 5.5, dia(2)), mov('a1', -3, dia(3))];
    expect(calcularSaldo(movs)).toBe(12.5);
  });

  it('ignora cargos marcados como pagados por la web', () => {
    expect(calcularSaldo([mov('c1', 10, dia(1), { pagado: true }), mov('c2', 4, dia(2))])).toBe(4);
  });

  it('reproduce el bug B-01 de la web con datos heredados (saldo a favor falso)', () => {
    // Web: abono -10 + marca el cargo origen como pagado ⇒ saldo -10.
    const heredado = [mov('c1', 10, dia(1), { pagado: true }), mov('a1', -10, dia(2))];
    expect(calcularSaldo(heredado)).toBe(-10);
  });

  it('con la semántica móvil (abono sin marcar pagado) el saldo queda en cero', () => {
    const movil = [mov('c1', 10, dia(1)), mov('a1', -10, dia(2))];
    expect(calcularSaldo(movil)).toBe(0);
  });

  it('agrupa saldos por cliente en una sola pasada', () => {
    const movs = [
      mov('x', 10, dia(1)),
      mov('y', 7, dia(1), { clienteId: 'c2' }),
      mov('z', -2, dia(2)),
    ];
    expect(saldosPorCliente(movs)).toEqual(
      new Map([
        ['c1', 8],
        ['c2', 7],
      ]),
    );
  });
});

describe('estado de cargos (FIFO)', () => {
  it('imputa abonos del más antiguo al más nuevo', () => {
    const movs = [
      mov('c2', 8, dia(5)),
      mov('c1', 10, dia(1)),
      mov('a1', -12, dia(6)),
      mov('c3', 3, dia(7)),
    ];
    const estados = estadoDeCargos(movs).map((c) => [c.movimiento.id, c.estado, c.pendiente]);
    expect(estados).toEqual([
      ['c1', 'cubierto', 0],
      ['c2', 'parcial', 6],
      ['c3', 'pendiente', 3],
    ]);
  });

  it('respeta cargos pagados heredados sin consumir abonos', () => {
    const movs = [
      mov('c1', 10, dia(1), { pagado: true }),
      mov('c2', 5, dia(2)),
      mov('a1', -5, dia(3)),
    ];
    expect(estadoDeCargos(movs).map((c) => c.estado)).toEqual(['pagado', 'cubierto']);
  });

  it('la suma de pendientes coincide con el saldo positivo', () => {
    const movs = [mov('c1', 10, dia(1)), mov('c2', 2.35, dia(2)), mov('a1', -4.1, dia(3))];
    const pendiente = estadoDeCargos(movs).reduce((a, c) => a + c.pendiente, 0);
    expect(Math.round(pendiente * 100)).toBe(Math.round(calcularSaldo(movs) * 100));
  });

  it('pre-llena el pago con el cargo pendiente más antiguo (RN-09)', () => {
    const movs = [mov('c1', 10, dia(1)), mov('c2', 4, dia(2)), mov('a1', -10, dia(3))];
    const c = cargoMasAntiguoPendiente(movs);
    expect(c?.movimiento.id).toBe('c2');
    expect(c?.pendiente).toBe(4);
    expect(cargoMasAntiguoPendiente([])).toBeUndefined();
  });

  it('ordena cronológicamente y deja al final los de fecha pendiente', () => {
    const orden = ordenarCronologico([mov('b', 1, null), mov('a', 1, dia(2)), mov('c', 1, dia(1))]);
    expect(orden.map((m) => m.id)).toEqual(['c', 'a', 'b']);
  });

  it('detecta cargos vencidos según días configurados', () => {
    const ahora = new Date(2026, 1, 15);
    const movs = [
      mov('viejo', 10, dia(1)),
      mov('nuevo', 5, new Date(2026, 1, 10)),
      mov('sinFecha', 3, null),
    ];
    expect(cargosVencidos(movs, ahora, 30).map((c) => c.movimiento.id)).toEqual(['viejo']);
    expect(cargosVencidos(movs, ahora, 3).map((c) => c.movimiento.id)).toEqual(['viejo', 'nuevo']);
  });
});

describe('armado de movimientos', () => {
  it('cargo manual valida monto y descripción', () => {
    expect(armarCargo('c1', 12.345, '  Gaseosa  ')).toEqual({
      clienteId: 'c1',
      monto: 12.35,
      descripcion: 'Gaseosa',
      pagado: false,
    });
    expect(() => armarCargo('c1', 0, 'x')).toThrow(new ErrorDominio('MONTO_INVALIDO'));
    expect(() => armarCargo('c1', Number.NaN, 'x')).toThrow(ErrorDominio);
    expect(() => armarCargo('c1', 5, '   ')).toThrow(new ErrorDominio('DESCRIPCION_VACIA'));
  });

  it('abono con monto negativo y método de pago, sin marcar pagado', () => {
    expect(armarAbono('c1', 7.5, 'Pago', 'Yape/Plin', 'c9')).toEqual({
      clienteId: 'c1',
      monto: -7.5,
      descripcion: 'Pago',
      pagado: false,
      metodoPago: 'Yape/Plin',
      deudaOrigenId: 'c9',
    });
    expect(armarAbono('c1', -3, 'Pago', 'Efectivo').monto).toBe(-3);
    expect(armarAbono('c1', 3, 'Pago', 'Efectivo')).not.toHaveProperty('deudaOrigenId');
    expect(() => armarAbono('c1', 0, 'Pago', 'Efectivo')).toThrow(ErrorDominio);
    expect(() => armarAbono('c1', 2, '', 'Efectivo')).toThrow(ErrorDominio);
    // @ts-expect-error método fuera del contrato
    expect(() => armarAbono('c1', 2, 'x', 'Fiado')).toThrow(
      new ErrorDominio('METODO_PAGO_INVALIDO'),
    );
  });

  it('liquidar crea un abono por lo que falta del cargo (B-02)', () => {
    const movs = [mov('c1', 10, dia(1)), mov('a1', -4, dia(2))];
    expect(armarLiquidacion(movs, 'c1', 'Efectivo')).toMatchObject({
      monto: -6,
      descripcion: 'Pago de: c1',
      deudaOrigenId: 'c1',
    });
    expect(() =>
      armarLiquidacion([mov('c1', 3, dia(1)), mov('a', -3, dia(2))], 'c1', 'Efectivo'),
    ).toThrow(new ErrorDominio('SIN_DEUDA_PENDIENTE'));
    expect(() => armarLiquidacion(movs, 'no-existe', 'Efectivo')).toThrow(ErrorDominio);
  });
});
