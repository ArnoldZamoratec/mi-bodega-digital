import type { MovimientoFiado, Venta } from '../entities';
import { ErrorDominio } from '../errors';
import {
  claveDia,
  crearRango,
  enRangoEfectivo,
  fechaEfectiva,
  generarReporte,
  MARGEN_SINCRONIZACION_MS,
  rangoConsulta,
  rangoPredefinido,
  resumenVentas,
} from '../rules/reportes';

const venta = (
  id: string,
  total: number,
  metodoDePago: Venta['metodoDePago'],
  fecha: Date | null,
  items: Venta['items'] = [],
): Venta => ({ id, total, metodoDePago, clienteId: null, fecha, items });

const abono = (
  id: string,
  monto: number,
  fecha: Date,
  metodoPago?: 'Efectivo' | 'Yape/Plin',
): MovimientoFiado => ({
  id,
  clienteId: 'c',
  monto,
  descripcion: '',
  fecha,
  pagado: false,
  ...(metodoPago ? { metodoPago } : {}),
});

const item = (nombre: string, cantidad: number) => ({ id: nombre, nombre, precio: 1, cantidad });

describe('resumenVentas (vendido hoy)', () => {
  const hoy = crearRango(new Date(2026, 9, 20), new Date(2026, 9, 20));
  const pendiente = (ventaId: string, total: number, creadaEn: Date) => ({
    ventaId,
    creadaEn: creadaEn.getTime(),
    venta: { total },
  });

  it('suma sincronizadas y pendientes del día, sin duplicar ni errores de redondeo', () => {
    const r = resumenVentas(
      [
        { id: 'a', total: 0.1 },
        { id: 'b', total: 0.2 },
      ],
      [
        pendiente('b', 0.2, new Date(2026, 9, 20, 10)), // ya sincronizada: no se repite
        pendiente('c', 3.5, new Date(2026, 9, 20, 23, 59)),
        pendiente('ayer', 50, new Date(2026, 9, 19, 23, 59)),
      ],
      hoy,
    );
    expect(r).toEqual({ total: 3.8, cantidad: 3 });
  });

  it('una venta anulada el mismo día no suma monto ni cantidad', () => {
    const r = resumenVentas(
      [
        { id: 'a', total: 10 },
        { id: 'a-anulada', total: -10, anulaA: 'a' },
        { id: 'b', total: 4.5 },
      ],
      [],
      hoy,
    );
    expect(r).toEqual({ total: 4.5, cantidad: 1 });
  });

  it('día sin ventas', () => {
    expect(resumenVentas([], [], hoy)).toEqual({ total: 0, cantidad: 0 });
  });
});

describe('rango de fechas (RN-08)', () => {
  it('cubre el día local completo', () => {
    const r = crearRango(new Date(2026, 2, 3, 15), new Date(2026, 2, 4, 1));
    expect(r.inicio).toEqual(new Date(2026, 2, 3, 0, 0, 0, 0));
    expect(r.fin).toEqual(new Date(2026, 2, 4, 23, 59, 59, 999));
  });

  it('rechaza fin anterior a inicio', () => {
    expect(() => crearRango(new Date(2026, 2, 5), new Date(2026, 2, 4))).toThrow(
      new ErrorDominio('RANGO_FECHAS_INVALIDO'),
    );
  });

  it('rangos predefinidos', () => {
    const ahora = new Date(2026, 2, 10, 18);
    expect(rangoPredefinido('hoy', ahora).inicio).toEqual(new Date(2026, 2, 10));
    expect(rangoPredefinido('ayer', ahora).inicio).toEqual(new Date(2026, 2, 9));
    expect(rangoPredefinido('semana', ahora).inicio).toEqual(new Date(2026, 2, 4));
    expect(rangoPredefinido('mes', ahora).inicio).toEqual(new Date(2026, 2, 1));
    expect(rangoPredefinido('mes', ahora).fin).toEqual(new Date(2026, 2, 10, 23, 59, 59, 999));
  });

  it('clave de día en hora local (B-04)', () => {
    // 20:30 local nunca debe caer en el día siguiente.
    expect(claveDia(new Date(2026, 11, 31, 20, 30))).toBe('2026-12-31');
  });
});

describe('generarReporte (port de reports.js)', () => {
  const rango = crearRango(new Date(2026, 0, 1), new Date(2026, 0, 31));

  it('separa ingresos por método y deja fiado fuera de ingresos (RN-06)', () => {
    const ventas = [
      venta('1', 10.1, 'Efectivo', new Date(2026, 0, 2, 9), [item('Arroz', 2)]),
      venta('2', 20.2, 'Yape/Plin', new Date(2026, 0, 2, 21), [item('Leche', 1), item('Arroz', 1)]),
      venta('3', 30, 'Fiado', new Date(2026, 0, 3), [item('Pan', 10)]),
      venta('fuera', 99, 'Efectivo', new Date(2026, 1, 1)),
      venta('pendiente', 50, 'Efectivo', null),
    ];
    const movs = [
      abono('a1', -5, new Date(2026, 0, 3), 'Efectivo'),
      abono('a2', -2.5, new Date(2026, 0, 4), 'Yape/Plin'),
      abono('sinMetodo', -1, new Date(2026, 0, 4)),
      { ...abono('cargo', 30, new Date(2026, 0, 3)), monto: 30 },
    ];

    const r = generarReporte(ventas, movs, rango);
    expect(r.totalEfectivo).toBe(15.1);
    expect(r.totalYape).toBe(22.7);
    expect(r.totalIngresos).toBe(37.8);
    expect(r.totalFiado).toBe(30);
    expect(r.totalAbonos).toBe(7.5);
    // "Cómo se vendió": solo ventas, sin abonos (no se mezclan con los ingresos).
    expect(r.ventasEfectivo).toBe(10.1);
    expect(r.ventasYape).toBe(20.2);
    expect(r.totalVendido).toBe(60.3);
    expect(r.cantidadVentas).toBe(3);
    expect(r.ticketPromedio).toBe(20.1);
    expect(r.topProductos).toEqual([
      { nombre: 'Pan', cantidad: 10 },
      { nombre: 'Arroz', cantidad: 3 },
      { nombre: 'Leche', cantidad: 1 },
    ]);
    expect(r.serieDiaria).toEqual([
      { dia: '2026-01-02', ingresos: 30.3 },
      { dia: '2026-01-03', ingresos: 5 },
      { dia: '2026-01-04', ingresos: 2.5 },
    ]);
  });

  it('anulaciones: se cancelan en el mismo rango; las de otro día restan sin contar', () => {
    const ventas = [
      venta('a', 10, 'Efectivo', new Date(2026, 0, 5), [item('Arroz', 2)]),
      {
        ...venta('a-anulada', -10, 'Efectivo', new Date(2026, 0, 5), [item('Arroz', -2)]),
        anulaA: 'a',
      },
      venta('b', 6, 'Yape/Plin', new Date(2026, 0, 6), [item('Leche', 1)]),
      // Venta del mes anterior anulada dentro del rango.
      {
        ...venta('viejo-anulada', -3, 'Efectivo', new Date(2026, 0, 7), [item('Pan', -10)]),
        anulaA: 'viejo',
      },
    ];
    const r = generarReporte(ventas, [], rango);
    expect(r.cantidadVentas).toBe(1);
    expect(r.totalYape).toBe(6);
    expect(r.totalEfectivo).toBe(-3);
    expect(r.totalVendido).toBe(3);
    expect(r.topProductos).toEqual([{ nombre: 'Leche', cantidad: 1 }]);
  });

  it('limita el top a 5 y reporta vacío sin datos', () => {
    const ventas = [
      venta(
        '1',
        1,
        'Efectivo',
        new Date(2026, 0, 2),
        ['a', 'b', 'c', 'd', 'e', 'f'].map((n, i) => item(n, 6 - i)),
      ),
    ];
    expect(generarReporte(ventas, [], rango).topProductos.map((p) => p.nombre)).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
    ]);
    const vacio = generarReporte([], [], rango);
    expect(vacio.totalIngresos).toBe(0);
    expect(vacio.ticketPromedio).toBe(0);
    expect(vacio.serieDiaria).toEqual([]);
  });
});

describe('fecha efectiva de ventas sin conexión (D-26)', () => {
  const lunes = crearRango(new Date(2026, 9, 19), new Date(2026, 9, 19));
  const martes = crearRango(new Date(2026, 9, 20), new Date(2026, 9, 20));
  const cobro = new Date(2026, 9, 19, 23, 50); // lunes 23:50, sin red
  const sync = new Date(2026, 9, 20, 8, 15); // martes 08:15, se sincroniza

  it('usa creadaEn si existe; si no, fecha (web y documentos antiguos)', () => {
    expect(fechaEfectiva({ fecha: sync, creadaEn: cobro })).toBe(cobro);
    expect(fechaEfectiva({ fecha: sync })).toBe(sync);
    expect(fechaEfectiva({ fecha: null, creadaEn: cobro })).toBe(cobro);
    expect(fechaEfectiva({ fecha: null })).toBeNull();
  });

  it('ignora creadaEn absurdo: posterior al servidor o más viejo que el margen', () => {
    const adelantado = new Date(sync.getTime() + 60_000);
    expect(fechaEfectiva({ fecha: sync, creadaEn: adelantado })).toBe(sync);
    const viejo = new Date(sync.getTime() - MARGEN_SINCRONIZACION_MS - 1);
    expect(fechaEfectiva({ fecha: sync, creadaEn: viejo })).toBe(sync);
    expect(fechaEfectiva({ fecha: sync, creadaEn: new Date(Number.NaN) })).toBe(sync);
  });

  it('la consulta por fecha del servidor se amplía en el margen', () => {
    const c = rangoConsulta(lunes);
    expect(c.inicio).toEqual(lunes.inicio);
    expect(c.fin.getTime()).toBe(lunes.fin.getTime() + MARGEN_SINCRONIZACION_MS);
    expect(enRangoEfectivo({ fecha: sync, creadaEn: cobro }, lunes)).toBe(true);
    expect(enRangoEfectivo({ fecha: sync, creadaEn: cobro }, martes)).toBe(false);
  });

  it('el reporte y el cierre cuentan la venta el día del cobro, no el de la sincronización', () => {
    const v: Venta = { ...venta('v1', 12, 'Efectivo', sync), creadaEn: cobro };
    const pago: MovimientoFiado = { ...abono('a1', -5, sync, 'Yape/Plin'), creadaEn: cobro };

    const delLunes = generarReporte([v], [pago], lunes);
    expect(delLunes.totalEfectivo).toBe(12);
    expect(delLunes.totalAbonos).toBe(5);
    expect(delLunes.serieDiaria).toEqual([{ dia: '2026-10-19', ingresos: 17 }]);

    const delMartes = generarReporte([v], [pago], martes);
    expect(delMartes.totalIngresos).toBe(0);
    expect(delMartes.cantidadVentas).toBe(0);

    expect(resumenVentas([v], [], lunes)).toEqual({ total: 12, cantidad: 1 });
    expect(resumenVentas([v], [], martes)).toEqual({ total: 0, cantidad: 0 });
  });
});
