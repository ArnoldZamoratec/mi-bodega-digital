import { create } from 'zustand';

export type TipoAviso = 'exito' | 'error' | 'info';

/** Acción opcional del aviso (p. ej. "Deshacer"). Preferida sobre diálogos de confirmación. */
export interface AccionAviso {
  etiqueta: string;
  alPresionar: () => void;
}

interface Aviso {
  id: number;
  mensaje: string;
  tipo: TipoAviso;
  accion?: AccionAviso;
}

interface EstadoAvisos {
  actual: Aviso | null;
  mostrar: (mensaje: string, tipo?: TipoAviso, accion?: AccionAviso) => void;
  cerrar: () => void;
}

let contador = 0;

/** Snackbar global: feedback no intrusivo (la v5.3 de la web redujo toasts por la misma razón). */
export const useAvisos = create<EstadoAvisos>((set) => ({
  actual: null,
  mostrar: (mensaje, tipo = 'info', accion) =>
    set({ actual: { id: ++contador, mensaje, tipo, accion } }),
  cerrar: () => set({ actual: null }),
}));

export const avisar = (mensaje: string, tipo?: TipoAviso, accion?: AccionAviso) =>
  useAvisos.getState().mostrar(mensaje, tipo, accion);
