import type { AlmacenClaveValor } from './colaVentas';

/**
 * Última copia conocida de colecciones pequeñas (productos, clientes) para poder abrir
 * el POS sin conexión tras reiniciar la app (D-05). No es la fuente de verdad.
 */
export class CacheCatalogo {
  constructor(
    private readonly almacen: AlmacenClaveValor,
    private readonly uid: string,
  ) {}

  private clave(nombre: string): string {
    return `bodega:cache:${this.uid}:${nombre}`;
  }

  async leer<T>(nombre: string): Promise<T[] | null> {
    try {
      const crudo = await this.almacen.getItem(this.clave(nombre));
      const parsed: unknown = crudo ? JSON.parse(crudo) : null;
      return Array.isArray(parsed) ? (parsed as T[]) : null;
    } catch {
      return null;
    }
  }

  async guardar<T>(nombre: string, datos: readonly T[]): Promise<void> {
    try {
      await this.almacen.setItem(this.clave(nombre), JSON.stringify(datos));
    } catch {
      // La caché es best-effort; un fallo de disco no debe romper la UI.
    }
  }
}
