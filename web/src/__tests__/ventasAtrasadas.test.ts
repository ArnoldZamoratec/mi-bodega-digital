import { rangoDiasLima, type MovimientoFiado, type Venta } from '@bodegon/core';
import { describe, expect, it } from 'vitest';

import { resumenHoy } from '../logic/hoy';
import { unirConsultasRango } from '../logic/rango';
import { calcularTotales } from '../logic/reporte';

/**
 * D-32 (bug real): una venta cobrada sin conexión el 2/11 y sincronizada el 15/11 inflaba
 * "Vendido hoy" del 15. Ahora cae en su día real en Hoy y en Reportes.
 */
const venta = (id: string, total: number, fecha: string, creadaEn?: string): Venta => ({
  id,
  items: [{ id: 'p', nombre: 'Pan', precio: total, cantidad: 1 }],
  total,
  metodoDePago: 'Efectivo',
  clienteId: null,
  fecha: new Date(fecha),
  ...(creadaEn ? { creadaEn: new Date(creadaEn) } : {}),
});

// Domingo 15/11/2026 15:00 de Lima.
const AHORA = new Date('2026-11-15T20:00:00Z');
const SYNC = '2026-11-15T14:00:00Z'; // llegó al servidor hoy 09:00 Lima
const vieja = venta('vieja', 40, SYNC, '2026-11-02T23:30:00Z'); // cobrada el 2/11 18:30 Lima
const deHoy = venta('hoy', 10, '2026-11-15T15:00:00Z');

describe('venta de hace 13 días sincronizada hoy (D-32)', () => {
  it('no suma a "Hoy" ni a la comparación con la semana pasada', () => {
    const r = resumenHoy([vieja, deHoy], AHORA);
    expect(r.hoy).toBe(10);
    expect(r.ventasHoy).toBe(1);
  });

  it('en Reportes cae el 2/11', () => {
    const mes = rangoDiasLima('2026-11-01', '2026-11-15');
    const t = calcularTotales([vieja, deHoy], [], mes);
    expect(t.chartLabels).toEqual(['2026-11-02', '2026-11-15']);
    expect(t.chartData).toEqual([40, 10]);
    const delDos = calcularTotales([vieja, deHoy], [], rangoDiasLima('2026-11-02', '2026-11-02'));
    expect(delDos.totalGeneral).toBe(40);
  });

  it('reloj adelantado o creadaEn absurdo: cuenta el día del servidor', () => {
    const adelantada = venta('adel', 7, SYNC, '2026-11-16T14:00:00Z');
    const absurda = venta('abs', 3, SYNC, '2000-01-01T12:00:00Z');
    expect(resumenHoy([adelantada, absurda], AHORA).hoy).toBe(10);
  });

  it('las consultas por fecha y por creadaEn se unen sin duplicar y se filtran por día real', () => {
    const dia2 = rangoDiasLima('2026-11-02', '2026-11-02');
    const abono: MovimientoFiado = {
      id: 'm',
      clienteId: 'c',
      monto: -5,
      descripcion: 'Abono',
      pagado: false,
      metodoPago: 'Efectivo',
      fecha: new Date(SYNC),
      creadaEn: new Date('2026-11-02T20:00:00Z'),
    };
    // Consulta por `fecha` del 2/11: nada. Por `creadaEn` del 2/11: la venta y el abono.
    const u = unirConsultasRango([[], [vieja]], [[], [abono]], dia2);
    expect(u.ventas.map((v) => v.id)).toEqual(['vieja']);
    expect(u.movimientos.map((m) => m.id)).toEqual(['m']);
    // Consultas de hoy: por `fecha` llega la vieja (sincronizada hoy) y la de hoy, pero la
    // vieja no es de hoy; la de hoy aparece en ambas consultas y se cuenta una vez.
    const hoy = rangoDiasLima('2026-11-15', '2026-11-15');
    const h = unirConsultasRango([[vieja, deHoy], [deHoy]], [[abono], []], hoy);
    expect(h.ventas.map((v) => v.id)).toEqual(['hoy']);
    expect(h.movimientos).toEqual([]);
  });
});
