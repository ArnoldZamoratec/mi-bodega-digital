import type { Venta } from '@bodegon/core';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { chipDias, iniciales } from '../logic/cobranza';
import { crearVentanaDeshacer, VENTANA_DESHACER_MS } from '../logic/deshacer';
import { fraseComparacion, resumenHoy } from '../logic/hoy';
import {
  diasDelPeriodo,
  etiquetaCorta,
  fechaLarga,
  listaDias,
  rangoDelPeriodo,
  sumarDias,
} from '../logic/periodos';
import { anchosTop, serieCompleta, type TotalesReporte } from '../logic/reporte';
import { accionTecla, esCampoTexto } from '../logic/teclado';
import { billetes, estadoPago } from '../logic/vuelto';

// 15/11/2026 20:30 en Lima = 16/11 01:30 UTC: el navegador en UTC ya diría "mañana".
const NOCHE_LIMA = new Date('2026-11-16T01:30:00Z');

describe('periodos (días de Lima)', () => {
  it('sumarDias cruza meses y años', () => {
    expect(sumarDias('2026-11-30', 1)).toBe('2026-12-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('Hoy / 7 días / Mes usan el día de Lima, no el del navegador', () => {
    expect(diasDelPeriodo('hoy', NOCHE_LIMA)).toEqual({ desde: '2026-11-15', hasta: '2026-11-15' });
    expect(diasDelPeriodo('7dias', NOCHE_LIMA)).toEqual({ desde: '2026-11-09', hasta: '2026-11-15' });
    expect(diasDelPeriodo('mes', NOCHE_LIMA)).toEqual({ desde: '2026-11-01', hasta: '2026-11-15' });
  });

  it('Rango usa las fechas elegidas y rechaza fin < inicio', () => {
    const r = rangoDelPeriodo('rango', NOCHE_LIMA, { desde: '2026-11-01', hasta: '2026-11-03' });
    expect(r.inicio.toISOString()).toBe('2026-11-01T05:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-11-04T04:59:59.999Z');
    expect(() => rangoDelPeriodo('rango', NOCHE_LIMA, { desde: '2026-11-05', hasta: '2026-11-01' })).toThrow(
      'anterior',
    );
  });

  it('lista de días incluye los vacíos y tiene tope', () => {
    expect(listaDias({ desde: '2026-11-13', hasta: '2026-11-15' })).toEqual([
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
    expect(listaDias({ desde: '2026-01-01', hasta: '2026-12-31' }, 10)).toHaveLength(10);
  });

  it('etiquetas en español', () => {
    expect(fechaLarga('2026-11-15')).toBe('Domingo 15 de noviembre');
    expect(etiquetaCorta('2026-11-09')).toBe('lun 9');
  });
});

describe('calculadora de vuelto', () => {
  it('Paga con S/ 20 → vuelto S/ 7.50, en céntimos exactos', () => {
    expect(estadoPago(12.5, '20')).toEqual({ tipo: 'vuelto', monto: 7.5 });
    expect(estadoPago(0.3, '1')).toEqual({ tipo: 'vuelto', monto: 0.7 });
    expect(estadoPago(12.5, '12,50')).toEqual({ tipo: 'vuelto', monto: 0 });
  });

  it('si no alcanza, dice cuánto falta', () => {
    expect(estadoPago(12.5, '10')).toEqual({ tipo: 'falta', monto: 2.5 });
  });

  it('vacío e inválido', () => {
    expect(estadoPago(5, '')).toEqual({ tipo: 'vacio' });
    expect(estadoPago(5, '  ')).toEqual({ tipo: 'vacio' });
    expect(estadoPago(5, 'veinte')).toEqual({ tipo: 'invalido' });
    expect(estadoPago(5, '-3')).toEqual({ tipo: 'invalido' });
  });

  it('billetes 10/20/50/100: solo los que alcanzan quedan habilitados', () => {
    expect(billetes(12.5)).toEqual([
      { monto: 10, alcanza: false },
      { monto: 20, alcanza: true },
      { monto: 50, alcanza: true },
      { monto: 100, alcanza: true },
    ]);
    expect(billetes(10).find((b) => b.monto === 10)?.alcanza).toBe(true);
    expect(billetes(0).every((b) => !b.alcanza)).toBe(true);
  });
});

describe('ventana de deshacer (6 s)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('dura 6 s, cuenta los segundos y expira una sola vez', () => {
    vi.useFakeTimers();
    const expiro = vi.fn();
    const v = crearVentanaDeshacer(expiro);
    expect(VENTANA_DESHACER_MS).toBe(6000);
    v.abrir();
    expect(v.abierta()).toBe(true);
    expect(v.segundosRestantes()).toBe(6);
    vi.advanceTimersByTime(4100);
    expect(v.segundosRestantes()).toBe(2);
    vi.advanceTimersByTime(1900);
    expect(v.abierta()).toBe(false);
    expect(expiro).toHaveBeenCalledTimes(1);
    expect(v.tomar()).toBe(false);
  });

  it('tomar dentro de la ventana funciona UNA vez y cancela la expiración', () => {
    vi.useFakeTimers();
    const expiro = vi.fn();
    const v = crearVentanaDeshacer(expiro);
    v.abrir();
    vi.advanceTimersByTime(5999);
    expect(v.tomar()).toBe(true);
    expect(v.tomar()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(expiro).not.toHaveBeenCalled();
  });

  it('cerrar ("Nueva venta") impide deshacer', () => {
    vi.useFakeTimers();
    const v = crearVentanaDeshacer(() => undefined);
    v.abrir();
    v.cerrar();
    expect(v.tomar()).toBe(false);
    expect(v.segundosRestantes()).toBe(0);
  });

  it('reabrir reinicia el plazo', () => {
    vi.useFakeTimers();
    const expiro = vi.fn();
    const v = crearVentanaDeshacer(expiro);
    v.abrir();
    vi.advanceTimersByTime(5000);
    v.abrir();
    vi.advanceTimersByTime(5000);
    expect(v.abierta()).toBe(true);
    expect(expiro).not.toHaveBeenCalled();
  });
});

describe('teclado de Vender', () => {
  const fuera = { enCampoTexto: false, enBusqueda: false };
  const enBusqueda = { enCampoTexto: true, enBusqueda: true };
  const enOtroCampo = { enCampoTexto: true, enBusqueda: false };

  it('"/" enfoca la búsqueda, pero no roba la tecla mientras se escribe', () => {
    expect(accionTecla({ key: '/' }, fuera)).toBe('enfocar-busqueda');
    expect(accionTecla({ key: '/' }, enOtroCampo)).toBeNull();
    expect(accionTecla({ key: '/' }, enBusqueda)).toBeNull();
  });

  it('Enter en la búsqueda agrega el primero; en otro campo no', () => {
    expect(accionTecla({ key: 'Enter' }, enBusqueda)).toBe('agregar-primero');
    expect(accionTecla({ key: 'Enter' }, enOtroCampo)).toBeNull();
    expect(accionTecla({ key: 'Enter', shiftKey: true }, enBusqueda)).toBeNull();
  });

  it('Ctrl+Enter (o Cmd+Enter) cobra desde cualquier lugar', () => {
    expect(accionTecla({ key: 'Enter', ctrlKey: true }, fuera)).toBe('cobrar');
    expect(accionTecla({ key: 'Enter', ctrlKey: true }, enOtroCampo)).toBe('cobrar');
    expect(accionTecla({ key: 'Enter', metaKey: true }, enBusqueda)).toBe('cobrar');
  });

  it('Escape cierra; composición IME y otros atajos se ignoran', () => {
    expect(accionTecla({ key: 'Escape' }, fuera)).toBe('cerrar');
    expect(accionTecla({ key: 'Enter', isComposing: true }, enBusqueda)).toBeNull();
    expect(accionTecla({ key: '/', ctrlKey: true }, fuera)).toBeNull();
    expect(accionTecla({ key: 'a' }, fuera)).toBeNull();
  });

  it('esCampoTexto', () => {
    expect(esCampoTexto(document.createElement('input'))).toBe(true);
    expect(esCampoTexto(document.createElement('textarea'))).toBe(true);
    expect(esCampoTexto(document.createElement('button'))).toBe(false);
    expect(esCampoTexto(null)).toBe(false);
  });
});

describe('Hoy: comparación justa con el mismo día de la semana pasada', () => {
  const venta = (id: string, total: number, iso: string, metodo: Venta['metodoDePago'] = 'Efectivo'): Venta => ({
    id,
    items: [{ id: 'p', nombre: 'Pan', precio: total, cantidad: 1 }],
    total,
    metodoDePago: metodo,
    clienteId: metodo === 'Fiado' ? 'c' : null,
    fecha: new Date(iso),
  });
  // Domingo 15/11/2026 a las 15:00 de Lima.
  const AHORA = new Date('2026-11-15T20:00:00Z');

  it('suma contado + fiado de hoy y compara hasta la misma hora de hace 7 días', () => {
    const r = resumenHoy(
      [
        venta('a', 60, '2026-11-15T14:00:00Z'),
        venta('b', 40, '2026-11-15T19:00:00Z', 'Fiado'),
        venta('c', 80, '2026-11-08T15:00:00Z'), // domingo pasado, 10:00 Lima: cuenta
        venta('d', 500, '2026-11-09T01:00:00Z'), // domingo pasado, 20:00 Lima: todavía no
      ],
      AHORA,
    );
    expect(r.hoy).toBe(100);
    expect(r.ventasHoy).toBe(2);
    expect(r.semanaPasada).toBe(80);
    expect(r.variacion).toBe(25);
    expect(r.dia).toBe('domingo');
    expect(fraseComparacion(r)).toBe('25 % más que el domingo pasado a esta hora (S/ 80.00).');
  });

  it('una venta deshecha (contraasiento) no cuenta', () => {
    const r = resumenHoy(
      [venta('a', 10, '2026-11-15T14:00:00Z'), { ...venta('a-anulada', -10, '2026-11-15T14:01:00Z'), anulaA: 'a' }],
      AHORA,
    );
    expect(r.hoy).toBe(0);
    expect(r.ventasHoy).toBe(0);
  });

  it('frases sin datos de la semana pasada y a la baja', () => {
    expect(fraseComparacion(resumenHoy([], AHORA))).toBe('Todavía no registras ventas hoy.');
    expect(fraseComparacion(resumenHoy([venta('a', 5, '2026-11-15T14:00:00Z')], AHORA))).toContain(
      'aún no tenías ventas',
    );
    const baja = resumenHoy(
      [venta('a', 50, '2026-11-15T14:00:00Z'), venta('b', 100, '2026-11-08T14:00:00Z')],
      AHORA,
    );
    expect(fraseComparacion(baja)).toBe('50 % menos que el domingo pasado a esta hora (S/ 100.00).');
  });
});

describe('Por cobrar: chips y monogramas', () => {
  it('atraso real solo pasados 15 días', () => {
    expect(chipDias(0)).toEqual({ texto: 'desde hoy', atrasado: false });
    expect(chipDias(1)).toEqual({ texto: 'desde ayer', atrasado: false });
    expect(chipDias(15).atrasado).toBe(false);
    expect(chipDias(16)).toEqual({ texto: 'desde hace 16 días', atrasado: true });
  });

  it('iniciales', () => {
    expect(iniciales('Rosa Quispe')).toBe('RQ');
    expect(iniciales('Don Julio Mamani')).toBe('DM');
    expect(iniciales('carmen')).toBe('C');
    expect(iniciales('  ')).toBe('·');
  });
});

describe('Reportes: serie y barras', () => {
  const t: TotalesReporte = {
    totalGeneral: 0,
    totalEfectivo: 0,
    totalYape: 0,
    totalFiado: 0,
    totalAbonos: 0,
    cantidadVentas: 0,
    top5Products: [
      ['Arroz', 10],
      ['Pan', 5],
      ['Sal', 0],
    ],
    chartLabels: ['2026-11-14'],
    chartData: [12.5],
  };

  it('días sin ventas aparecen en 0', () => {
    expect(serieCompleta(t, { desde: '2026-11-13', hasta: '2026-11-15' })).toEqual([
      { dia: '2026-11-13', ingresos: 0 },
      { dia: '2026-11-14', ingresos: 12.5 },
      { dia: '2026-11-15', ingresos: 0 },
    ]);
  });

  it('barras horizontales relativas al más vendido', () => {
    expect(anchosTop(t.top5Products)).toEqual([100, 50, 0]);
    expect(anchosTop([])).toEqual([]);
  });
});
