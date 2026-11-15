import { create } from 'zustand';

/** Canal simple para devolver un código escaneado al formulario que abrió el escáner. */
export const useCodigoEscaneado = create<{
  codigo: string | null;
  fijar: (c: string | null) => void;
}>((set) => ({
  codigo: null,
  fijar: (codigo) => set({ codigo }),
}));
