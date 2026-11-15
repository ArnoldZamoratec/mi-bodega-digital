import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';

const CLAVE = 'bodega-theme';

interface EstadoTema {
  preferencia: PreferenciaTema;
  cargada: boolean;
  cargar: () => Promise<void>;
  fijar: (p: PreferenciaTema) => void;
}

const esPreferencia = (v: unknown): v is PreferenciaTema =>
  v === 'sistema' || v === 'claro' || v === 'oscuro';

/** Misma clave que la web (`bodega-theme`), persistida en el teléfono. */
export const useTemaStore = create<EstadoTema>((set) => ({
  preferencia: 'sistema',
  cargada: false,
  cargar: async () => {
    try {
      const v = await AsyncStorage.getItem(CLAVE);
      // La web guarda 'light' | 'dark'.
      const normalizado = v === 'light' ? 'claro' : v === 'dark' ? 'oscuro' : v;
      set({ preferencia: esPreferencia(normalizado) ? normalizado : 'sistema', cargada: true });
    } catch {
      set({ cargada: true });
    }
  },
  fijar: (preferencia) => {
    set({ preferencia });
    AsyncStorage.setItem(CLAVE, preferencia).catch(() => undefined);
  },
}));
