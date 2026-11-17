import { create } from 'zustand';

import type { Contenedor } from '@/data/contenedor';
import type { MotivoSinAcceso } from '@/data/sesion';
import type { Usuario } from '@/domain/entities';
import { puede, sesionDueno, type Permiso, type Sesion } from '@/domain/rules/roles';

type EstadoSesion =
  | { estado: 'cargando'; usuario: null; contenedor: null; sesion: null; sinAcceso: null }
  | { estado: 'anonimo'; usuario: null; contenedor: null; sesion: null; sinAcceso: null }
  | {
      estado: 'autenticado';
      usuario: Usuario;
      contenedor: Contenedor;
      /** D-33: rol y bodega con los que se trabaja (el dueño: su propia bodega). */
      sesion: Sesion;
      sinAcceso: null;
    }
  | {
      /** D-33: cajero desactivado o quitado. No hay contenedor: no puede leer ni escribir. */
      estado: 'sin-acceso';
      usuario: Usuario;
      contenedor: null;
      sesion: null;
      sinAcceso: { bodega: string; motivo: MotivoSinAcceso };
    };

type SesionStore = EstadoSesion & {
  /**
   * true mientras el rol no se pudo confirmar con el servidor (primer inicio sin red y sin
   * caché): se trabaja como dueño, como en las versiones anteriores, y no se sincroniza
   * hasta confirmarlo.
   */
  provisional: boolean;
  autenticar: (
    usuario: Usuario,
    contenedor: Contenedor,
    opciones?: { provisional?: boolean },
  ) => void;
  sinAccesoA: (usuario: Usuario, bodega: string, motivo: MotivoSinAcceso) => void;
  esperar: () => void;
  cerrar: () => void;
};

const vacio = { usuario: null, contenedor: null, sesion: null, sinAcceso: null } as const;

export const useSesion = create<SesionStore>((set) => ({
  estado: 'cargando',
  ...vacio,
  provisional: false,
  autenticar: (usuario, contenedor, opciones = {}) =>
    set({
      estado: 'autenticado',
      usuario,
      contenedor,
      // Contenedores de prueba sin sesión: dueño, como antes de D-33.
      sesion: contenedor.sesion ?? sesionDueno(usuario.uid, ''),
      sinAcceso: null,
      provisional: !!opciones.provisional,
    }),
  sinAccesoA: (usuario, bodega, motivo) =>
    set({
      estado: 'sin-acceso',
      usuario,
      contenedor: null,
      sesion: null,
      sinAcceso: { bodega, motivo },
      provisional: false,
    }),
  esperar: () => set({ estado: 'cargando', ...vacio, provisional: false }),
  cerrar: () => set({ estado: 'anonimo', ...vacio, provisional: false }),
}));

/** Contenedor de la sesión activa. Solo se usa en pantallas protegidas por la navegación. */
export function useContenedor(): Contenedor {
  const contenedor = useSesion((s) => s.contenedor);
  if (!contenedor) throw new Error('No hay sesión activa');
  return contenedor;
}

/** Sesión con rol (null sin sesión activa). */
export const useSesionRol = (): Sesion | null => useSesion((s) => s.sesion);

/**
 * ¿El rol actual puede hacer esto? Usa la tabla `PERMISOS` del core (D-33): la interfaz solo
 * refleja lo que las reglas ya aplican.
 */
export const usePuede = (permiso: Permiso): boolean => useSesion((s) => puede(s.sesion, permiso));
