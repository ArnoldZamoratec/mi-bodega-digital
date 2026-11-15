import type { Producto } from '../entities';

/** Umbral de la web (`ui.js`): stock ≤ 5 se resalta como bajo (RN-01). */
export const UMBRAL_STOCK_BAJO = 5;

export const controlaStock = (p: Pick<Producto, 'stock'>): p is { stock: number } =>
  p.stock !== null;

export const esStockBajo = (p: Pick<Producto, 'stock'>, umbral = UMBRAL_STOCK_BAJO): boolean =>
  p.stock !== null && p.stock <= umbral;

export const sinStock = (p: Pick<Producto, 'stock'>): boolean => p.stock !== null && p.stock <= 0;

export const ordenarPorNombre = <T extends { nombre: string }>(items: readonly T[]): T[] =>
  [...items].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));

/** Marcas diacríticas combinables (U+0300–U+036F) que deja `normalize('NFD')`. */
const DIACRITICOS = new RegExp(
  `[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`,
  'g',
);

/** Normaliza para búsqueda: minúsculas y sin tildes ("Azúcar" ≈ "azucar"). */
export const normalizarTexto = (texto: string): string =>
  texto.normalize('NFD').replace(DIACRITICOS, '').toLowerCase().trim();

/**
 * Filtro del POS: la web usa `nombre.includes(termino)` sin distinguir mayúsculas.
 * Se mejora ignorando tildes y buscando también por código de barras exacto.
 */
export function filtrarProductos(productos: readonly Producto[], termino: string): Producto[] {
  const t = normalizarTexto(termino);
  if (!t) return [...productos];
  return productos.filter(
    (p) =>
      normalizarTexto(p.nombre).includes(t) ||
      (p.codigoBarras !== undefined && p.codigoBarras === termino.trim()),
  );
}

export const buscarPorCodigo = (
  productos: readonly Producto[],
  codigo: string,
): Producto | undefined => productos.find((p) => p.codigoBarras === codigo.trim());

export const productosConStockBajo = (productos: readonly Producto[]): Producto[] =>
  productos.filter((p) => esStockBajo(p));

/**
 * Productos que **acaban de cruzar** al stock bajo entre dos snapshots.
 * Evita repetir la notificación en cada cambio (D-11).
 */
export function nuevosConStockBajo(
  anteriores: readonly Producto[],
  actuales: readonly Producto[],
): Producto[] {
  const previos = new Map(anteriores.map((p) => [p.id, p]));
  return actuales.filter((p) => {
    if (!esStockBajo(p)) return false;
    const antes = previos.get(p.id);
    return antes !== undefined && !esStockBajo(antes);
  });
}

/** Aplica deltas de stock (ventas pendientes de sincronizar) sobre el catálogo mostrado. */
export function aplicarDeltasStock(
  productos: readonly Producto[],
  deltas: ReadonlyMap<string, number>,
): Producto[] {
  if (deltas.size === 0) return [...productos];
  return productos.map((p) => {
    const delta = deltas.get(p.id);
    if (delta === undefined || p.stock === null) return p;
    return { ...p, stock: p.stock + delta };
  });
}
