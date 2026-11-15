import { Easing, type TextStyle } from 'react-native';

/**
 * Tokens de diseño. Toda medida de la UI sale de aquí para que las pantallas se vean como
 * un solo sistema (referencia visual: Linear / Stripe).
 */

/** Escala 4/8: 4, 8, 12, 16, 24, 32, 48, 64. */
export const espacio = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
} as const;

export const radio = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  completo: 999,
} as const;

/** Objetivo táctil mínimo (Material / WCAG 2.5.5). */
export const TACTIL_MIN = 48;

/**
 * Sombras multicapa (`boxShadow` de la nueva arquitectura): una capa corta y nítida para el
 * contacto y otra larga y difusa para la profundidad. En oscuro la sombra casi no se ve, así
 * que la separación la da el borde.
 */
export const sombras = {
  // Sombras teñidas con Tinta (cálida), no con negro azulado: se integran al fondo Kraft.
  claro: {
    1: '0px 1px 2px rgba(28, 25, 23, 0.05), 0px 2px 8px rgba(28, 25, 23, 0.05)',
    2: '0px 1px 2px rgba(28, 25, 23, 0.06), 0px 8px 24px rgba(28, 25, 23, 0.08)',
    3: '0px 2px 4px rgba(28, 25, 23, 0.07), 0px 16px 40px rgba(28, 25, 23, 0.14)',
  },
  oscuro: {
    1: '0px 1px 2px rgba(0, 0, 0, 0.30)',
    2: '0px 1px 2px rgba(0, 0, 0, 0.30), 0px 8px 24px rgba(0, 0, 0, 0.35)',
    3: '0px 2px 4px rgba(0, 0, 0, 0.35), 0px 16px 40px rgba(0, 0, 0, 0.50)',
  },
} as const;

export type NivelSombra = 1 | 2 | 3;

/** Sombra hacia arriba para barras y paneles fijos al pie (pestañas, cobro, formularios). */
export const sombraArriba = {
  claro: '0px -1px 2px rgba(28, 25, 23, 0.04), 0px -12px 32px rgba(28, 25, 23, 0.08)',
  oscuro: '0px -1px 0px rgba(255, 255, 255, 0.05)',
} as const;

/** Movimiento: 150–250 ms con curva "expo out"; nunca el `ease` genérico. */
export const movimiento = {
  rapido: 150,
  normal: 200,
  lento: 250,
  curva: Easing.bezier(0.16, 1, 0.3, 1),
} as const;

/**
 * Cifras tabulares: todos los dígitos con el mismo ancho, así un total que cambia de
 * S/ 11.10 a S/ 18.80 no "baila" en pantalla. Usar en montos y contadores.
 */
export const NUMEROS: TextStyle = { fontVariant: ['tabular-nums'] };

/**
 * Brillo interior blanco en acciones primarias sólidas: da volumen sin sombra pesada.
 * Se combina con la sombra de elevación del elemento.
 */
export const BRILLO_INTERIOR = 'inset 0px 1px 0px rgba(255, 255, 255, 0.22)';

/** Escala de presión de elementos táctiles (sutil, como Linear). */
export const ESCALA_PRESION = 0.97;
