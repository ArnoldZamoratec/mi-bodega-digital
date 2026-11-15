import { create } from 'zustand';

import type { MetodoPagoVenta, Producto } from '@/domain/entities';
import {
  agregarAlCarrito,
  agregarMontoLibre,
  disponibleParaAgregar,
  eliminarDelCarrito,
  fijarCantidad,
  quitarDelCarrito,
  type ItemCarrito,
} from '@/domain/rules/carrito';

interface EstadoCarrito {
  items: ItemCarrito[];
  metodoDePago: MetodoPagoVenta;
  clienteId: string | null;
  /**
   * Suma 1 unidad. Si se pasa `stock` (número) y ya no queda disponible, no agrega y
   * devuelve `false` para que la pantalla avise. Sin `stock` (o `null`) no hay límite.
   */
  agregar: (p: Pick<Producto, 'id' | 'nombre' | 'precio'> & { stock?: number | null }) => boolean;
  /** Venta sin producto (D-25). Lanza ErrorDominio si el monto no es válido. */
  agregarLibre: (monto: number, descripcion: string) => void;
  quitar: (id: string) => void;
  eliminar: (id: string) => void;
  fijarCantidad: (id: string, cantidad: number) => void;
  fijarMetodo: (m: MetodoPagoVenta) => void;
  fijarCliente: (id: string | null) => void;
  vaciar: () => void;
}

/** Estado del POS. Toda la lógica vive en `domain/rules/carrito`. */
export const useCarrito = create<EstadoCarrito>((set, get) => ({
  items: [],
  metodoDePago: 'Efectivo',
  clienteId: null,
  agregar: ({ stock = null, ...p }) => {
    if (disponibleParaAgregar(get().items, { id: p.id, stock }) < 1) return false;
    set((s) => ({ items: agregarAlCarrito(s.items, p) }));
    return true;
  },
  agregarLibre: (monto, descripcion) => {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    set((s) => ({ items: agregarMontoLibre(s.items, { monto, descripcion, id }) }));
  },
  quitar: (id) => set((s) => ({ items: quitarDelCarrito(s.items, id) })),
  eliminar: (id) => set((s) => ({ items: eliminarDelCarrito(s.items, id) })),
  fijarCantidad: (id, cantidad) => set((s) => ({ items: fijarCantidad(s.items, id, cantidad) })),
  fijarMetodo: (metodoDePago) =>
    set((s) => ({ metodoDePago, clienteId: metodoDePago === 'Fiado' ? s.clienteId : null })),
  fijarCliente: (clienteId) => set({ clienteId }),
  vaciar: () => set({ items: [], metodoDePago: 'Efectivo', clienteId: null }),
}));
