import type { Producto } from '../entities';
import { ErrorDominio } from '../errors';
import {
  advertenciasDeStock,
  agregarAlCarrito,
  disponibleParaAgregar,
  eliminarDelCarrito,
  fijarCantidad,
  quitarDelCarrito,
  totalCarrito,
  unidadesEnCarrito,
} from '../rules/carrito';

const arroz: Producto = { id: 'a', nombre: 'Arroz', precio: 4.2, stock: 10 };
const leche: Producto = { id: 'l', nombre: 'Leche', precio: 3.9, stock: 1 };
const pan: Producto = { id: 'p', nombre: 'Pan', precio: 0.3, stock: null };

describe('carrito', () => {
  it('agrega una unidad y acumula si el producto ya está (como la web)', () => {
    let c = agregarAlCarrito([], arroz);
    c = agregarAlCarrito(c, arroz);
    c = agregarAlCarrito(c, leche, 3);
    expect(c).toEqual([
      { id: 'a', nombre: 'Arroz', precio: 4.2, cantidad: 2 },
      { id: 'l', nombre: 'Leche', precio: 3.9, cantidad: 3 },
    ]);
    expect(unidadesEnCarrito(c)).toBe(5);
  });

  it('no muta el carrito original', () => {
    const original = agregarAlCarrito([], arroz);
    agregarAlCarrito(original, arroz);
    expect(original[0]?.cantidad).toBe(1);
  });

  it('quitar resta una unidad y elimina en cero', () => {
    let c = agregarAlCarrito([], arroz, 2);
    c = quitarDelCarrito(c, 'a');
    expect(c[0]?.cantidad).toBe(1);
    c = quitarDelCarrito(c, 'a');
    expect(c).toEqual([]);
    expect(quitarDelCarrito(c, 'no-existe')).toEqual([]);
  });

  it('fija cantidad exacta y 0 elimina', () => {
    const c = agregarAlCarrito(agregarAlCarrito([], arroz), leche);
    expect(fijarCantidad(c, 'a', 7)[0]?.cantidad).toBe(7);
    expect(fijarCantidad(c, 'a', 0)).toHaveLength(1);
    expect(eliminarDelCarrito(c, 'l')).toHaveLength(1);
  });

  it('rechaza cantidades inválidas', () => {
    expect(() => agregarAlCarrito([], arroz, 0)).toThrow(ErrorDominio);
    expect(() => agregarAlCarrito([], arroz, 1.5)).toThrow('entero');
    expect(() => fijarCantidad([], 'a', -2)).toThrow(ErrorDominio);
  });

  it('calcula el total sin errores de redondeo', () => {
    const c = agregarAlCarrito(agregarAlCarrito([], pan, 3), arroz);
    expect(totalCarrito(c)).toBe(5.1);
    expect(totalCarrito([])).toBe(0);
  });

  it('calcula cuánto más se puede agregar sin superar el stock', () => {
    const c = agregarAlCarrito([], arroz, 8);
    expect(disponibleParaAgregar(c, arroz)).toBe(2);
    expect(disponibleParaAgregar([], leche)).toBe(1);
    expect(disponibleParaAgregar(agregarAlCarrito([], leche), leche)).toBe(0);
    expect(disponibleParaAgregar([], { id: 'x', stock: 0 })).toBe(0);
    expect(disponibleParaAgregar([], { id: 'x', stock: -3 })).toBe(0);
    expect(disponibleParaAgregar(agregarAlCarrito([], pan, 99), pan)).toBe(Infinity);
  });

  it('detecta items que superan el stock controlado', () => {
    const c = agregarAlCarrito(agregarAlCarrito(agregarAlCarrito([], leche, 2), pan, 50), arroz);
    expect(advertenciasDeStock(c, [arroz, leche, pan])).toEqual([
      { id: 'l', nombre: 'Leche', solicitado: 2, disponible: 1 },
    ]);
  });
});
