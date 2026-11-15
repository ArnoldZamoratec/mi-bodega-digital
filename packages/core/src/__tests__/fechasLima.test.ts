import { ErrorDominio } from '../errors';
import { claveDiaLima, hoyLima, rangoDiasLima } from '../rules/fechasLima';
import { generarReporte } from '../rules/reportes';
import type { Venta } from '../entities';

describe('fechas en hora de Lima (independientes de la zona de la máquina)', () => {
  it('claveDiaLima: 20:30 de Lima (01:30 UTC del día siguiente) sigue siendo el mismo día (B-04)', () => {
    expect(claveDiaLima(new Date('2026-11-16T01:30:00Z'))).toBe('2026-11-15');
    expect(claveDiaLima(new Date('2026-11-16T05:00:00Z'))).toBe('2026-11-16');
  });

  it('hoyLima', () => {
    expect(hoyLima(new Date('2026-01-01T04:59:59Z'))).toBe('2025-12-31');
  });

  it('rangoDiasLima cubre el día completo en UTC−5', () => {
    const r = rangoDiasLima('2026-11-15', '2026-11-16');
    expect(r.inicio.toISOString()).toBe('2026-11-15T05:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-11-17T04:59:59.999Z');
  });

  it('rangoDiasLima rechaza fin < inicio y formatos inválidos', () => {
    expect(() => rangoDiasLima('2026-11-16', '2026-11-15')).toThrow(ErrorDominio);
    expect(() => rangoDiasLima('', '2026-11-15')).toThrow(ErrorDominio);
    expect(() => rangoDiasLima('2026-13-45', '2026-13-45')).toThrow(ErrorDominio);
  });

  it('generarReporte agrupa la serie con la clave de día indicada', () => {
    const venta: Venta = {
      id: 'v1',
      items: [{ id: 'p', nombre: 'Pan', precio: 5, cantidad: 1 }],
      total: 5,
      metodoDePago: 'Efectivo',
      clienteId: null,
      fecha: new Date('2026-11-16T01:30:00Z'),
    };
    const rango = rangoDiasLima('2026-11-15', '2026-11-15');
    const r = generarReporte([venta], [], rango, 5, claveDiaLima);
    expect(r.serieDiaria).toEqual([{ dia: '2026-11-15', ingresos: 5 }]);
  });
});
