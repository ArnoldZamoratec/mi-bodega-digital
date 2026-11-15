import { create } from 'zustand';

import type { Contenedor } from '@/data/contenedor';
import type { Usuario } from '@/domain/entities';

type EstadoSesion =
  | { estado: 'cargando'; usuario: null; contenedor: null }
  | { estado: 'anonimo'; usuario: null; contenedor: null }
  | { estado: 'autenticado'; usuario: Usuario; contenedor: Contenedor };

type SesionStore = EstadoSesion & {
  autenticar: (usuario: Usuario, contenedor: Contenedor) => void;
  cerrar: () => void;
};

export const useSesion = create<SesionStore>((set) => ({
  estado: 'cargando',
  usuario: null,
  contenedor: null,
  autenticar: (usuario, contenedor) => set({ estado: 'autenticado', usuario, contenedor }),
  cerrar: () => set({ estado: 'anonimo', usuario: null, contenedor: null }),
}));

/** Contenedor de la sesión activa. Solo se usa en pantallas protegidas por la navegación. */
export function useContenedor(): Contenedor {
  const contenedor = useSesion((s) => s.contenedor);
  if (!contenedor) throw new Error('No hay sesión activa');
  return contenedor;
}
