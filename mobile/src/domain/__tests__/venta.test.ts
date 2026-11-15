import { ErrorDominio } from '../errors';
import type { ItemCarrito } from '../rules/carrito';
import { armarOperacionVenta, deltasPendientes, describirCarrito } from '../rules/venta';

const carrito: ItemCarrito[] = [
  { id: 'a', nombre: 'Arroz', precio: 4.2, cantidad: 2 },
  { id: 'l', nombre: 'Leche', precio: 3.9, cantidad: 1 },
];

const base = { carrito, ventaId: 'v1', cargoId: 'c1', ahora: 1000 };

describe('armarOperacionVenta', () => {
  it('venta en efectivo: mismo documento que la web y deltas de stock', () => {
    const op = armarOperacionVenta({ ...base, metodoDePago: 'Efectivo', clienteId: 'ignorado' });
    expect(op.venta).toEqual({
      items: carrito,
      total: 12.3,
      metodoDePago: 'Efectivo',
      clienteId: null,
    });
    expect(op.cargo).toBeNull();
    expect(op.cargoId).toBeNull();
    expect(op.deltasStock).toEqual([
      { productoId: 'a', delta: -2 },
      { productoId: 'l', delta: -1 },
    ]);
    expect(op.creadaEn).toBe(1000);
  });

  it('venta fiada: exige cliente y crea cargo vinculado (RN-04)', () => {
    expect(() => armarOperacionVenta({ ...base, metodoDePago: 'Fiado', clienteId: null })).toThrow(
      new ErrorDominio('FIADO_SIN_CLIENTE'),
    );
    const op = armarOperacionVenta({ ...base, metodoDePago: 'Fiado', clienteId: 'cli' });
    expect(op.venta.clienteId).toBe('cli');
    expect(op.cargoId).toBe('c1');
    expect(op.cargo).toEqual({
      clienteId: 'cli',
      monto: 12.3,
      descripcion: 'Arroz (x2), Leche (x1)',
      ventaId: 'v1',
      pagado: false,
    });
  });

  it('rechaza carrito vacío y método inválido', () => {
    expect(() =>
      armarOperacionVenta({ ...base, carrito: [], metodoDePago: 'Efectivo', clienteId: null }),
    ).toThrow('vacío');
    expect(() =>
      // @ts-expect-error método fuera del contrato
      armarOperacionVenta({ ...base, metodoDePago: 'Tarjeta', clienteId: null }),
    ).toThrow(ErrorDominio);
  });

  it('trunca la descripción a 100 caracteres como la web (RN-05)', () => {
    const largo: ItemCarrito[] = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      nombre: `Producto número ${i}`,
      precio: 1,
      cantidad: 1,
    }));
    const d = describirCarrito(largo);
    expect(d).toHaveLength(100);
    expect(d.endsWith('...')).toBe(true);
    expect(describirCarrito(carrito)).toBe('Arroz (x2), Leche (x1)');
  });

  it('suma deltas de varias ventas pendientes', () => {
    const op1 = armarOperacionVenta({ ...base, metodoDePago: 'Efectivo', clienteId: null });
    const op2 = armarOperacionVenta({
      ...base,
      ventaId: 'v2',
      metodoDePago: 'Yape/Plin',
      clienteId: null,
    });
    expect(deltasPendientes([op1, op2])).toEqual(
      new Map([
        ['a', -4],
        ['l', -2],
      ]),
    );
  });
});
