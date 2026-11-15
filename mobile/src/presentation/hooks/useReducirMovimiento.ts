import { AccessibilityInfo } from 'react-native';
import { create } from 'zustand';

/**
 * Preferencia "Quitar animaciones" del sistema (equivalente a `prefers-reduced-motion`).
 * Un único listener para toda la app: antes cada ícono/tarjeta animada abría el suyo
 * (cientos en una cuadrícula) y el primer cuadro animaba antes de saber la preferencia.
 * `prepararMovimiento()` se llama al arrancar, antes de pintar (ver App.tsx).
 */
const useMovimiento = create<{ reducir: boolean }>(() => ({ reducir: false }));

let preparado = false;

export async function prepararMovimiento(): Promise<void> {
  if (preparado) return;
  preparado = true;
  try {
    useMovimiento.setState({ reducir: await AccessibilityInfo.isReduceMotionEnabled() });
  } catch {
    // Sin la API (pruebas, plataformas raras) se asume movimiento normal.
  }
  AccessibilityInfo.addEventListener('reduceMotionChanged', (reducir) =>
    useMovimiento.setState({ reducir }),
  );
}

export function useReducirMovimiento(): boolean {
  return useMovimiento((s) => s.reducir);
}
