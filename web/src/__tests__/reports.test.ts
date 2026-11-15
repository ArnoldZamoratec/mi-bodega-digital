import { rangoDiasLima, type MovimientoFiado, type Venta } from '@bodegon/core';
import { describe, expect, it, vi } from 'vitest';

// Sin Firebase real en las pruebas: solo se prueba el cálculo.
vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));

const { calcularTotales } = await import('../modules/reports');

const venta = (p: Partial<Venta> & Pick<Venta, 'id' | 'total'>): Venta => ({
  items: [{ id: 'p1', nombre: 'Pan', precio: p.total, cantidad: 1 }],
  metodoDePago: 'Efectivo',
  clienteId: null,
  fecha: new Date('2026-11-15T15:00:00Z'),
  ...p,
});

const abono = (p: Partial<MovimientoFiado> & Pick<MovimientoFiado, 'id' | 'monto'>): MovimientoFiado => ({
  clienteId: 'c1',
  descripcion: 'Abono',
  fecha: new Date('2026-11-15T15:00:00Z'),
  pagado: false,
  metodoPago: 'Efectivo',
  ...p,
});

const hoy = rangoDiasLima('2026-11-15', '2026-11-15');

describe('reportes web = reportes del core', () => {
  it('suma en céntimos (0.1 + 0.2) y separa fiado de ingresos (RN-06)', () => {
    const t = calcularTotales(
      [
        venta({ id: 'a', total: 0.1 }),
        venta({ id: 'b', total: 0.2, metodoDePago: 'Yape/Plin' }),
        venta({ id: 'c', total: 10, metodoDePago: 'Fiado', clienteId: 'c1' }),
      ],
      [abono({ id: 'd', monto: -3, metodoPago: 'Yape/Plin' }), abono({ id: 'e', monto: 4 })],
      hoy,
    );
    expect(t.totalEfectivo).toBe(0.1);
    expect(t.totalYape).toBe(3.2);
    expect(t.totalGeneral).toBe(3.3);
    expect(t.totalFiado).toBe(10);
  });

  it('agrupa por día de Lima: 20:30 de Lima no cae en "mañana" (B-04)', () => {
    const t = calcularTotales(
      [venta({ id: 'a', total: 5, fecha: new Date('2026-11-16T01:30:00Z') })],
      [],
      hoy,
    );
    expect(t.chartLabels).toEqual(['2026-11-15']);
    expect(t.chartData).toEqual([5]);
  });

  it('venta sin conexión: cuenta el día de creadaEn, no el de la sincronización (D-26)', () => {
    const v = venta({
      id: 'a',
      total: 7,
      creadaEn: new Date('2026-11-16T04:50:00Z'), // 23:50 del 15 en Lima
      fecha: new Date('2026-11-16T13:00:00Z'), // se sincronizó a las 08:00 del 16
    });
    expect(calcularTotales([v], [], hoy).totalEfectivo).toBe(7);
    expect(calcularTotales([v], [], rangoDiasLima('2026-11-16', '2026-11-16')).totalEfectivo).toBe(0);
  });

  it('creadaEn con reloj adelantado: manda fecha (resguardo D-26)', () => {
    const v = venta({
      id: 'a',
      total: 7,
      creadaEn: new Date('2026-11-20T15:00:00Z'),
      fecha: new Date('2026-11-15T15:00:00Z'),
    });
    expect(calcularTotales([v], [], hoy).totalEfectivo).toBe(7);
  });

  it('una venta y su anulación en el rango se cancelan; top sin monto libre', () => {
    const t = calcularTotales(
      [
        venta({ id: 'a', total: 5 }),
        venta({ id: 'a-anulada', total: -5, anulaA: 'a' }),
        venta({
          id: 'b',
          total: 3,
          items: [
            { id: 'libre-1', nombre: 'Varios', precio: 1, cantidad: 1 },
            { id: 'p2', nombre: 'Leche', precio: 2, cantidad: 1 },
          ],
        }),
      ],
      [],
      hoy,
    );
    expect(t.totalEfectivo).toBe(3);
    expect(t.top5Products).toEqual([['Leche', 1]]);
  });
});
