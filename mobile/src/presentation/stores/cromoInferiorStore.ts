import { create } from 'zustand';

/**
 * Alto que ocupan las barras ancladas al pie (pestañas y la barra flotante de Cobrar).
 * Los avisos y la confirmación de venta se dibujan en la raíz de la app: leen este valor
 * para aparecer encima de esas barras y nunca taparlas.
 */
interface CromoInferior {
  altoPestanas: number;
  /** false cuando una pantalla apilada (Cobro, formularios) tapa las pestañas. */
  pestanasVisibles: boolean;
  flotante: number;
  fijarAltoPestanas: (alto: number) => void;
  fijarPestanasVisibles: (visibles: boolean) => void;
  fijarFlotante: (alto: number) => void;
}

export const useCromoInferior = create<CromoInferior>((set) => ({
  altoPestanas: 0,
  pestanasVisibles: true,
  flotante: 0,
  fijarAltoPestanas: (altoPestanas) => set({ altoPestanas }),
  fijarPestanasVisibles: (pestanasVisibles) => set({ pestanasVisibles }),
  fijarFlotante: (flotante) => set({ flotante }),
}));

/** Distancia desde el borde inferior a la que deben flotar los avisos. */
export const useReservaInferior = () =>
  useCromoInferior((s) => (s.pestanasVisibles ? s.altoPestanas + s.flotante : 0));
