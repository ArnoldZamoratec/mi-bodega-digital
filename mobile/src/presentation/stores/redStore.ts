import NetInfo from '@react-native-community/netinfo';
import { create } from 'zustand';

import { avisar } from './avisosStore';

interface EstadoRed {
  enLinea: boolean;
  iniciar: () => () => void;
}

/**
 * Estado de conectividad. `isInternetReachable` puede ser null al inicio: se asume
 * conectado hasta que NetInfo confirme lo contrario.
 */
export const useRed = create<EstadoRed>((set) => ({
  enLinea: true,
  iniciar: () =>
    NetInfo.addEventListener((s) => {
      set({ enLinea: s.isConnected !== false && s.isInternetReachable !== false });
    }),
}));

export const estaEnLinea = (): boolean => useRed.getState().enLinea;

/**
 * D-05: solo las ventas funcionan sin conexión. El resto de escrituras se bloquean con
 * un mensaje claro en lugar de quedar colgadas esperando al servidor.
 */
export function requiereConexion(): boolean {
  if (estaEnLinea()) return true;
  avisar(
    'Necesitas conexión a internet para esta acción. Las ventas y los fiados sí funcionan sin conexión.',
    'error',
  );
  return false;
}
