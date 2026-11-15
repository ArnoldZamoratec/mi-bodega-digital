import type { Venta } from '../entities';
import { ErrorDominio } from '../errors';
import { armarAnulacion } from '../rules/anulacion';
import {
  agregarAlCarrito,
  agregarMontoLibre,
  esItemLibre,
  MONTO_LIBRE_MAXIMO,
  tieneProductos,
  totalCarrito,
} from '../rules/carrito';
import { crearRango, generarReporte } from '../rules/reportes';
import { armarOperacionVenta } from '../rules/venta';

const arroz = { id: 'arroz', nombre: 'Arroz', precio: 4.2 };

describe('monto libre (D-25)', () => {
  it('agrega un item propio que suma al total', () => {
    const c = agregarMontoLibre(agregarAlCarrito([], arroz), {
      monto: 2.5,
      descripcion: ' Pan suelto ',
      id: 'x',
    });
    expect(c[1]).toEqual({ id: 'libre-x', nombre: 'Pan suelto', precio: 2.5, cantidad: 1 });
    expect(esItemLibre(c[1]!.id)).toBe(true);
    expect(totalCarrito(c)).toBe(6.7);
  });

  it('sin descripción se llama "Varios"; dos montos libres no se mezclan', () => {
    let c = agregarMontoLibre([], { monto: 1, id: 'a' });
    c = agregarMontoLibre(c, { monto: 1, descripcion: '   ', id: 'b' });
    expect(c.map((i) => i.nombre)).toEqual(['Varios', 'Varios']);
    expect(c).toHaveLength(2);
  });

  it.each([0, -1, Number.NaN, MONTO_LIBRE_MAXIMO + 0.01])('rechaza %p', (monto) => {
    expect(() => agregarMontoLibre([], { monto, id: 'x' })).toThrow(ErrorDominio);
  });

  it('no descuenta stock al vender ni lo devuelve al anular', () => {
    const carrito = agregarMontoLibre(agregarAlCarrito([], arroz, 2), { monto: 3, id: 'x' });
    const op = armarOperacionVenta({
      carrito,
      metodoDePago: 'Efectivo',
      clienteId: null,
      ventaId: 'v1',
      cargoId: 'c1',
      ahora: 0,
    });
    expect(op.venta.total).toBe(11.4);
    expect(op.deltasStock).toEqual([{ productoId: 'arroz', delta: -2 }]);

    const venta: Venta = { id: 'v1', ...op.venta, fecha: new Date() };
    expect(armarAnulacion(venta, 'Cobro equivocado', 0).deltasStock).toEqual([
      { productoId: 'arroz', delta: 2 },
    ]);
  });

  it('cuenta en el dinero pero no en el ranking de más vendidos', () => {
    const hoy = new Date(2026, 0, 15, 12);
    const venta: Venta = {
      id: 'v1',
      items: [
        { ...arroz, cantidad: 1 },
        { id: 'libre-x', nombre: 'Varios', precio: 3, cantidad: 1 },
      ],
      total: 7.2,
      metodoDePago: 'Efectivo',
      clienteId: null,
      fecha: hoy,
    };
    const r = generarReporte([venta], [], crearRango(hoy, hoy));
    expect(r.totalIngresos).toBe(7.2);
    expect(r.topProductos).toEqual([{ nombre: 'Arroz', cantidad: 1 }]);
  });
});

describe('tieneProductos', () => {
  it('distingue ventas solo de monto libre', () => {
    expect(tieneProductos([{ id: 'libre-a' }])).toBe(false);
    expect(tieneProductos([{ id: 'libre-a' }, { id: 'arroz' }])).toBe(true);
  });
});
