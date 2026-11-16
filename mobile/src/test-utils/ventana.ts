import { Dimensions } from 'react-native';

/** Ventanas de referencia (dp) para las pruebas de disposición (D-30). */
export const VENTANAS = {
  /** Android chico (Galaxy A03 Core y similares). */
  telefonoAngosto: { width: 320, height: 640 },
  telefono: { width: 390, height: 844 },
  /** iPad vertical / plegable abierto. */
  tabletVertical: { width: 768, height: 1024 },
  /** Terminal POS de mostrador / tablet Android horizontal. */
  posMostrador: { width: 1280, height: 800 },
} as const;

/** Lo que trae el preset de Jest de React Native (750×1334, letra 2×). */
const POR_DEFECTO = { width: 750, height: 1334, fontScale: 2 };

/**
 * Cambia la ventana que ven `useWindowDimensions` y `Dimensions` (antes de renderizar;
 * emite "change" como al rotar). Llamar `restaurarVentana` en afterEach.
 */
export function simularVentana(ventana: { width: number; height: number }, fontScale = 1): void {
  const window = { ...ventana, scale: 2, fontScale };
  Dimensions.set({ window, screen: window });
}

export function restaurarVentana(): void {
  simularVentana(POR_DEFECTO, POR_DEFECTO.fontScale);
}
