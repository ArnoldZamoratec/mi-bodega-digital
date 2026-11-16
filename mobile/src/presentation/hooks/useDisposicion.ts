import { useWindowDimensions, type ViewStyle } from 'react-native';

import { ANCHOS } from '../theme/ventana';

/**
 * Disposición de la pantalla según las clases de ventana de Material 3 (por ancho en dp, no
 * por "tipo de dispositivo"): un plegable que se despliega, un iPad en Split View o un
 * teléfono que rota cambian de disposición en caliente (D-30).
 *  - compacta  (< 600dp): teléfonos en vertical. Una sola columna, barra de pestañas abajo.
 *  - media     (600–839dp): plegable abierto, tablet vertical, teléfono horizontal.
 *  - expandida (≥ 840dp): tablet horizontal, POS de mostrador, iPad horizontal.
 */
export type Disposicion = 'compacta' | 'media' | 'expandida';

export interface InfoDisposicion {
  disposicion: Disposicion;
  ancho: number;
  alto: number;
  /** Más ancho que alto (POS de mostrador 1024×600, teléfono rotado). */
  horizontal: boolean;
  /** Escala de texto del sistema (1 = normal; Android/iOS permiten hasta 2). */
  escalaFuente: number;
  /** Panel persistente al costado (ticket del POS) desde la clase media. */
  conPanelLateral: boolean;
  /** Lista + detalle lado a lado y riel de navegación a la izquierda. */
  dosPaneles: boolean;
}

export function disposicionDeAncho(ancho: number): Disposicion {
  if (ancho >= ANCHOS.expandida) return 'expandida';
  if (ancho >= ANCHOS.mediana) return 'media';
  return 'compacta';
}

export function useDisposicion(): InfoDisposicion {
  const { width, height, fontScale } = useWindowDimensions();
  const disposicion = disposicionDeAncho(width);
  return {
    disposicion,
    ancho: width,
    alto: height,
    horizontal: width > height,
    escalaFuente: fontScale,
    conPanelLateral: disposicion !== 'compacta',
    dosPaneles: disposicion === 'expandida',
  };
}

/** Ancho del riel de navegación lateral (M3 Navigation Rail: 80dp). */
export const ANCHO_RIEL = 80;

/** Ancho del panel del ticket en el POS (media / expandida). */
export const ANCHO_PANEL_TICKET = { media: 300, expandida: 360 } as const;

/** Ancho del panel de lista en las vistas lista–detalle. */
export const ANCHO_PANEL_LISTA = 400;

/**
 * Tope de crecimiento de la letra para montos protagonistas: a 200 % un total en
 * `displaySmall` no entra en 320dp. 1.6× sigue siendo bastante más grande que lo normal.
 */
export const MULTIPLICADOR_MONTO = 1.6;

/**
 * Columnas de una cuadrícula según el ancho real del contenedor. La tarjeta mínima crece
 * con la letra (hasta 1.5×): a 200 % un teléfono angosto pasa a una columna en vez de
 * cortar nombre y precio.
 */
export function columnasPorAncho(anchoUtil: number, escalaFuente: number, separacion: number) {
  const minimo = 140 * Math.min(Math.max(escalaFuente, 1), 1.5);
  const columnas = Math.floor((anchoUtil + separacion) / (minimo + separacion));
  return Math.max(1, Math.min(6, columnas));
}

/**
 * Diálogos: en tablets un Dialog de Paper ocupa todo el ancho menos 26dp por lado. Se
 * limitan a 560dp (M3) y se centran; en teléfonos quedan igual que antes.
 */
export function useEstiloDialogo(): ViewStyle {
  const { width } = useWindowDimensions();
  const maximo = 560;
  return width - 52 > maximo ? { width: maximo, alignSelf: 'center' } : {};
}
