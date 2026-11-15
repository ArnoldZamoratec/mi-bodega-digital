import type { Venta } from '../entities';
import { ErrorDominio } from '../errors';
import { armarAnulacion, idAnulacion, idsAnulados, ventasVigentes } from '../rules/anulacion';

const venta = (parcial: Partial<Venta> = {}): Venta => ({
  id: 'v1',
  items: [
    { id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 2 },
    { id: 'pan', nombre: 'Pan', precio: 0.3, cantidad: 5 },
    { id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 },
  ],
  total: 14.1,
  metodoDePago: 'Efectivo',
  clienteId: null,
  fecha: new Date(2026, 9, 20, 10),
  ...parcial,
});

describe('anulación por contraasiento', () => {
  it('invierte ítems y total, conserva método/cliente y enlaza la original', () => {
    const op = armarAnulacion(venta(), 'Cobro equivocado', 1000);
    expect(op.ventaId).toBe('v1-anulada');
    expect(op.venta.total).toBe(-14.1);
    expect(op.venta.items.map((i) => i.cantidad)).toEqual([-2, -5, -1]);
    expect(op.venta).toMatchObject({
      metodoDePago: 'Efectivo',
      clienteId: null,
      anulaA: 'v1',
      motivoAnulacion: 'Cobro equivocado',
    });
    expect(op.cargo).toBeNull();
    expect(op.creadaEn).toBe(1000);
  });

  it('devuelve el stock agrupado por producto', () => {
    const op = armarAnulacion(venta(), 'Otro', 0);
    expect(op.deltasStock).toEqual([
      { productoId: 'arroz', delta: 3 },
      { productoId: 'pan', delta: 5 },
    ]);
  });

  it('el id es fijo por venta: anular dos veces es idempotente', () => {
    expect(armarAnulacion(venta(), 'Otro', 1).ventaId).toBe(idAnulacion('v1'));
    expect(armarAnulacion(venta(), 'Otro', 2).ventaId).toBe(idAnulacion('v1'));
  });

  it('no se anula una anulación', () => {
    expect(() => armarAnulacion(venta({ anulaA: 'v0' }), 'Otro', 0)).toThrow(ErrorDominio);
  });

  it('vigentes excluye la pareja venta/contraasiento, pero no un contraasiento huérfano', () => {
    const lista = [
      venta({ id: 'a' }),
      venta({ id: 'a-anulada', anulaA: 'a', total: -14.1 }),
      venta({ id: 'b' }),
      venta({ id: 'x-anulada', anulaA: 'x', total: -3 }),
    ];
    expect(idsAnulados(lista)).toEqual(new Set(['a', 'x']));
    expect(ventasVigentes(lista).map((v) => v.id)).toEqual(['b']);
  });
});
