import { create } from 'zustand';

import type { ResultadoSesion } from '@/data/sesion';

/**
 * D-33: cambiar de sesión sin cerrar la de Firebase (aceptar una invitación, dejar una
 * bodega, volver a revisar el acceso). Lo implementa `useArranque`, que es quien crea el
 * contenedor y abre los listeners; las pantallas solo llaman a estas funciones.
 */
interface Control {
  aplicar: (r: ResultadoSesion) => Promise<void>;
  revalidar: () => Promise<void>;
}

let control: Control | null = null;

export function registrarControlSesion(c: Control): () => void {
  control = c;
  return () => {
    if (control === c) control = null;
  };
}

/** Guarda el resultado (para abrir sin red) y rehace la sesión con él. */
export const aplicarSesion = (r: ResultadoSesion): Promise<void> =>
  control?.aplicar(r) ?? Promise.resolve();

/** Vuelve a leer `cuentas/{uid}` y el miembro con el servidor. */
export const revalidarSesion = (): Promise<void> => control?.revalidar() ?? Promise.resolve();

/**
 * "Tengo un código de invitación" tocado antes de entrar: al iniciar sesión se abre la
 * pantalla para escribirlo.
 */
export const useIntencionUnirse = create<{ pendiente: boolean; fijar: (v: boolean) => void }>(
  (set) => ({ pendiente: false, fijar: (pendiente) => set({ pendiente }) }),
);
