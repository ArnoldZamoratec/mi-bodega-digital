import type { Producto } from '../entities';
import {
  aplicarDeltasStock,
  buscarPorCodigo,
  esStockBajo,
  filtrarProductos,
  normalizarTexto,
  nuevosConStockBajo,
  ordenarPorNombre,
  productosConStockBajo,
  sinStock,
} from '../rules/productos';

const p = (id: string, nombre: string, stock: number | null, codigoBarras?: string): Producto => ({
  id,
  nombre,
  precio: 1,
  stock,
  ...(codigoBarras ? { codigoBarras } : {}),
});

describe('productos', () => {
  it('stock bajo: ≤ 5 y solo si se controla stock (RN-01)', () => {
    expect(esStockBajo(p('1', 'a', 5))).toBe(true);
    expect(esStockBajo(p('1', 'a', 6))).toBe(false);
    expect(esStockBajo(p('1', 'a', -2))).toBe(true);
    expect(esStockBajo(p('1', 'a', null))).toBe(false);
    expect(sinStock(p('1', 'a', 0))).toBe(true);
    expect(sinStock(p('1', 'a', null))).toBe(false);
  });

  it('ordena por nombre en español sin distinguir mayúsculas', () => {
    const lista = [p('1', 'leche', 1), p('2', 'Azúcar', 1), p('3', 'aceite', 1)];
    expect(ordenarPorNombre(lista).map((x) => x.nombre)).toEqual(['aceite', 'Azúcar', 'leche']);
  });

  it('filtra ignorando mayúsculas y tildes, y por código exacto', () => {
    const lista = [
      p('1', 'Azúcar rubia', 1),
      p('2', 'Arroz', 1, '7750182000123'),
      p('3', 'Leche', 1),
    ];
    expect(normalizarTexto('  ÁzÚCAR ')).toBe('azucar');
    expect(filtrarProductos(lista, 'azucar').map((x) => x.id)).toEqual(['1']);
    expect(filtrarProductos(lista, 'R').map((x) => x.id)).toEqual(['1', '2']);
    expect(filtrarProductos(lista, '7750182000123').map((x) => x.id)).toEqual(['2']);
    expect(filtrarProductos(lista, '')).toHaveLength(3);
    expect(buscarPorCodigo(lista, ' 7750182000123 ')?.id).toBe('2');
    expect(buscarPorCodigo(lista, '000')).toBeUndefined();
  });

  it('lista productos con stock bajo', () => {
    expect(
      productosConStockBajo([p('1', 'a', 2), p('2', 'b', 20), p('3', 'c', null)]),
    ).toHaveLength(1);
  });

  it('detecta solo los que cruzan al stock bajo', () => {
    const antes = [p('1', 'a', 6), p('2', 'b', 3), p('3', 'c', 10)];
    const despues = [p('1', 'a', 5), p('2', 'b', 2), p('3', 'c', 9), p('4', 'nuevo', 1)];
    expect(nuevosConStockBajo(antes, despues).map((x) => x.id)).toEqual(['1']);
  });

  it('aplica deltas pendientes sin tocar stock no controlado', () => {
    const lista = [p('1', 'a', 10), p('2', 'b', null), p('3', 'c', 4)];
    const res = aplicarDeltasStock(
      lista,
      new Map([
        ['1', -3],
        ['2', -1],
      ]),
    );
    expect(res.map((x) => x.stock)).toEqual([7, null, 4]);
    expect(aplicarDeltasStock(lista, new Map())).toEqual(lista);
  });
});
