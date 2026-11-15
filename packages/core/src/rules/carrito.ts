import type { ItemVenta, Producto } from '../entities';
import { ErrorDominio } from '../errors';
import { aCentimos, aSoles, subtotalCentimos } from './dinero';

/** Item del carrito: mismo formato que `ventas.items` en Firestore. */
export type ItemCarrito = ItemVenta;

/** Agrega `cantidad` unidades (por defecto 1). Inmutable. */
export function agregarAlCarrito(
  carrito: readonly ItemCarrito[],
  producto: Pick<Producto, 'id' | 'nombre' | 'precio'>,
  cantidad = 1,
): ItemCarrito[] {
  validarCantidad(cantidad);
  const existe = carrito.some((i) => i.id === producto.id);
  if (existe) {
    return carrito.map((i) =>
      i.id === producto.id ? { ...i, cantidad: i.cantidad + cantidad } : i,
    );
  }
  return [
    ...carrito,
    { id: producto.id, nombre: producto.nombre, precio: producto.precio, cantidad },
  ];
}

/**
 * Monto libre (D-25): una venta sin producto ("S/ 2.50 de pan suelto"). Va en `items` como
 * cualquier otro, con un id propio que no es de un producto: no descuenta stock, no se
 * devuelve al anular y no entra al ranking de más vendidos.
 */
export const PREFIJO_LIBRE = 'libre-';
export const NOMBRE_LIBRE = 'Varios';
/** Tope por item: evita que un dedazo (S/ 25000 en vez de 2.50) llegue al cobro. */
export const MONTO_LIBRE_MAXIMO = 9999;

export const esItemLibre = (id: string): boolean => id.startsWith(PREFIJO_LIBRE);

/** true si algún item es un producto (anular o deshacer devuelve stock). */
export const tieneProductos = (items: readonly Pick<ItemCarrito, 'id'>[]): boolean =>
  items.some((i) => !!i.id && !esItemLibre(i.id));

export function agregarMontoLibre(
  carrito: readonly ItemCarrito[],
  datos: { monto: number; descripcion?: string; id: string },
): ItemCarrito[] {
  const centimos = Number.isFinite(datos.monto) ? aCentimos(datos.monto) : 0;
  if (centimos <= 0 || centimos > MONTO_LIBRE_MAXIMO * 100) {
    throw new ErrorDominio('MONTO_INVALIDO');
  }
  const nombre = datos.descripcion?.trim().slice(0, 40) || NOMBRE_LIBRE;
  return [
    ...carrito,
    { id: `${PREFIJO_LIBRE}${datos.id}`, nombre, precio: aSoles(centimos), cantidad: 1 },
  ];
}

/** Quita una unidad; si queda en cero, elimina el item (mismo comportamiento que la web). */
export function quitarDelCarrito(carrito: readonly ItemCarrito[], id: string): ItemCarrito[] {
  return carrito
    .map((i) => (i.id === id ? { ...i, cantidad: i.cantidad - 1 } : i))
    .filter((i) => i.cantidad > 0);
}

export function eliminarDelCarrito(carrito: readonly ItemCarrito[], id: string): ItemCarrito[] {
  return carrito.filter((i) => i.id !== id);
}

/** Fija la cantidad exacta; 0 elimina el item. */
export function fijarCantidad(
  carrito: readonly ItemCarrito[],
  id: string,
  cantidad: number,
): ItemCarrito[] {
  if (cantidad === 0) return eliminarDelCarrito(carrito, id);
  validarCantidad(cantidad);
  return carrito.map((i) => (i.id === id ? { ...i, cantidad } : i));
}

export const totalCarritoCentimos = (carrito: readonly ItemCarrito[]): number =>
  carrito.reduce((acc, i) => acc + subtotalCentimos(i.precio, i.cantidad), 0);

export const totalCarrito = (carrito: readonly ItemCarrito[]): number =>
  aSoles(totalCarritoCentimos(carrito));

export const unidadesEnCarrito = (carrito: readonly ItemCarrito[]): number =>
  carrito.reduce((acc, i) => acc + i.cantidad, 0);

export interface AdvertenciaStock {
  id: string;
  nombre: string;
  solicitado: number;
  disponible: number;
}

/**
 * Unidades que todavía se pueden agregar al carrito sin superar el stock (R-07).
 * `Infinity` si el producto no controla stock (`null`); nunca negativo.
 */
export function disponibleParaAgregar(
  carrito: readonly ItemCarrito[],
  producto: Pick<Producto, 'id' | 'stock'>,
): number {
  if (producto.stock === null) return Infinity;
  const enCarrito = carrito.find((i) => i.id === producto.id)?.cantidad ?? 0;
  return Math.max(0, producto.stock - enCarrito);
}

/**
 * Items cuya cantidad supera el stock controlado. Desde R-07 (revisado) la venta se
 * bloquea mientras exista alguno: ocurre si el stock bajó después de armar el carrito
 * (otra venta, otro dispositivo). Productos sin control de stock (`null`) nunca cuentan.
 */
export function advertenciasDeStock(
  carrito: readonly ItemCarrito[],
  productos: readonly Producto[],
): AdvertenciaStock[] {
  const porId = new Map(productos.map((p) => [p.id, p]));
  const advertencias: AdvertenciaStock[] = [];
  for (const item of carrito) {
    const producto = porId.get(item.id);
    if (producto && producto.stock !== null && item.cantidad > producto.stock) {
      advertencias.push({
        id: item.id,
        nombre: item.nombre,
        solicitado: item.cantidad,
        disponible: producto.stock,
      });
    }
  }
  return advertencias;
}

function validarCantidad(cantidad: number): void {
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new ErrorDominio('CANTIDAD_INVALIDA');
  }
}
