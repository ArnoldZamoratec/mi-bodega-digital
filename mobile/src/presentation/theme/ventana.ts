import { useWindowDimensions } from 'react-native';

/**
 * Clases de ventana de Material 3 (por ancho disponible, no por "tipo de dispositivo"):
 * un mismo teléfono cambia de clase al rotar, dividir pantalla o desplegar un plegable.
 */
export type ClaseAncho = 'compacta' | 'mediana' | 'expandida' | 'grande';

export interface Ventana {
  ancho: number;
  alto: number;
  clase: ClaseAncho;
  /** Teléfono horizontal o pantalla muy corta: el encabezado debe ceder espacio. */
  altoCompacto: boolean;
  /** Teléfono angosto (≤ 360dp): filas densas pasan a apilarse. */
  angosta: boolean;
  /** Escala de texto del sistema (1 = normal; usuarios mayores suelen usar 1.3–2). */
  escalaFuente: number;
  /** Texto grande: cambiar filas por pilas y quitar íconos decorativos de los controles. */
  fuenteGrande: boolean;
}

export const ANCHOS = { mediana: 600, expandida: 840, grande: 1200 } as const;

/** Ancho máximo del contenido para que nada se estire en tablets. */
export const ANCHO_CONTENIDO = { lectura: 640, lista: 840, cuadricula: 1200 } as const;

export function claseDeAncho(ancho: number): ClaseAncho {
  if (ancho >= ANCHOS.grande) return 'grande';
  if (ancho >= ANCHOS.expandida) return 'expandida';
  if (ancho >= ANCHOS.mediana) return 'mediana';
  return 'compacta';
}

/** Columnas de la cuadrícula de productos por clase de ventana. */
export function columnasCuadricula(ancho: number): number {
  return { compacta: 2, mediana: 3, expandida: 4, grande: 5 }[claseDeAncho(ancho)];
}

export function useVentana(): Ventana {
  const { width, height, fontScale } = useWindowDimensions();
  return {
    ancho: width,
    alto: height,
    clase: claseDeAncho(width),
    altoCompacto: height < 600,
    angosta: width <= 360,
    escalaFuente: fontScale,
    fuenteGrande: fontScale >= 1.3,
  };
}
