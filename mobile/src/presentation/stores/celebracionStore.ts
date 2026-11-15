import { create } from 'zustand';

import type { MetodoPagoVenta } from '@/domain/entities';
import type { OperacionVenta } from '@/domain/rules/venta';

export interface VentaCelebrada {
  id: number;
  total: number;
  metodo: MetodoPagoVenta;
  /** false = guardada en el teléfono, se sincronizará luego. */
  sincronizada: boolean;
  unidades: number;
  /** Vuelto a entregar (solo efectivo con monto recibido indicado). */
  vuelto?: number;
  /** Operación registrada: permite "Deshacer" desde la confirmación. */
  operacion?: OperacionVenta;
}

interface EstadoCelebracion {
  actual: VentaCelebrada | null;
  cerrar: () => void;
}

let contador = 0;

/**
 * El "pico" de la experiencia (regla pico-final): cerrar una venta. Se muestra como
 * capa global para que sobreviva a la navegación de vuelta al POS.
 */
export const useCelebracion = create<EstadoCelebracion>((set) => ({
  actual: null,
  cerrar: () => set({ actual: null }),
}));

export const celebrarVenta = (venta: Omit<VentaCelebrada, 'id'>) =>
  useCelebracion.setState({ actual: { ...venta, id: ++contador } });
