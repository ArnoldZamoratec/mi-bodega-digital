import {
  DarkTheme as NavDark,
  DefaultTheme as NavLight,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { configureFonts, MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

import { ambar, cielo, kraft, ladrillo, noche, pagos, verde } from './paleta';
import { sombraArriba, sombras, type NivelSombra } from './tokens';

/**
 * Tema de Bodegón Digital: roles semánticos sobre los primitivos de `paleta.ts`.
 * Fuente de verdad: IDENTIDAD_VISUAL.md (raíz del repositorio).
 */
export const NOMBRE_MARCA = 'Bodegón Digital';

/**
 * Plus Jakarta Sans: geométrica y cálida, muy legible en números (montos). En Android el peso
 * no se sintetiza bien con fuentes propias, así que cada peso es una familia distinta.
 */
export const familia = {
  regular: 'PlusJakartaSans_400Regular',
  medio: 'PlusJakartaSans_500Medium',
  semi: 'PlusJakartaSans_600SemiBold',
  negrita: 'PlusJakartaSans_700Bold',
  extra: 'PlusJakartaSans_800ExtraBold',
} as const;

type Variante = keyof typeof MD3LightTheme.fonts;
const PESOS: Partial<Record<Variante, { familia: string; tracking: number }>> = {
  // `default` lo usan componentes de Paper sin variante (List.Item, RadioButton.Item…).
  default: { familia: familia.regular, tracking: 0 },
  displayLarge: { familia: familia.extra, tracking: -1.2 },
  displayMedium: { familia: familia.extra, tracking: -1 },
  displaySmall: { familia: familia.extra, tracking: -0.8 },
  headlineLarge: { familia: familia.negrita, tracking: -0.6 },
  headlineMedium: { familia: familia.negrita, tracking: -0.5 },
  headlineSmall: { familia: familia.negrita, tracking: -0.4 },
  titleLarge: { familia: familia.negrita, tracking: -0.3 },
  titleMedium: { familia: familia.semi, tracking: -0.15 },
  titleSmall: { familia: familia.semi, tracking: -0.1 },
  labelLarge: { familia: familia.semi, tracking: 0 },
  labelMedium: { familia: familia.semi, tracking: 0.1 },
  labelSmall: { familia: familia.semi, tracking: 0.2 },
  bodyLarge: { familia: familia.regular, tracking: 0 },
  bodyMedium: { familia: familia.regular, tracking: 0 },
  bodySmall: { familia: familia.regular, tracking: 0.1 },
};

/** Títulos con tracking negativo (compactos, "editoriales"); el tamaño lo escala el sistema. */
const fuentes = configureFonts({
  config: Object.fromEntries(
    Object.entries(PESOS).map(([v, p]) => [
      v,
      { fontFamily: p.familia, fontWeight: 'normal' as const, letterSpacing: p.tracking },
    ]),
  ),
});

/**
 * Degradado de marca (§4.7): Verde 900 → 800 → 700. Con paneles translúcidos encima, el
 * texto secundario y el ámbar 200 siguen sobre 4.5:1 (medido); con Verde 600 al final no.
 */
export const degradado = {
  claro: [verde[900], verde[800], verde[700]] as const,
  oscuro: [verde[950], '#073B2E', '#0B5040'] as const,
};

/** Pares fondo/texto para avatares de producto y cliente: color estable según el nombre. */
const AVATARES = {
  claro: [
    ['#DCFCE7', '#166534'],
    ['#DBEAFE', '#1E40AF'],
    ['#FEF3C7', '#92400E'],
    ['#FCE7F3', '#9D174D'],
    ['#EDE9FE', '#5B21B6'],
    ['#CFFAFE', '#155E75'],
    ['#FFE4E6', '#9F1239'],
    ['#FFEDD5', '#9A3412'],
  ],
  oscuro: [
    ['#123524', '#86EFAC'],
    ['#172554', '#93C5FD'],
    ['#3A2A06', '#FCD34D'],
    ['#3B0F27', '#F9A8D4'],
    ['#2A1758', '#C4B5FD'],
    ['#0B3440', '#67E8F9'],
    ['#3F0D18', '#FDA4AF'],
    ['#3A1A08', '#FDBA74'],
  ],
} as const;

export function colorAvatar(nombre: string, oscuro: boolean): { fondo: string; texto: string } {
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  const lista = oscuro ? AVATARES.oscuro : AVATARES.claro;
  const [fondo, texto] = lista[h % lista.length] ?? lista[0];
  return { fondo, texto };
}

export interface ColoresExtra {
  exito: string;
  advertencia: string;
  fondoAdvertencia: string;
  deuda: string;
  fondoDeuda: string;
  aFavor: string;
  /** Ámbar Mostrador: celebración y detalles de marca. Nunca texto sobre fondo claro. */
  acento: string;
  /** Texto/ícono sobre `acento` (Tinta: 8.6:1). */
  sobreAcento: string;
  fondoAcento: string;
  info: string;
  fondoInfo: string;
  /** Colores de medios de pago, solo para datos y gráficos. */
  pagos: { efectivo: string; yape: string; fiado: string };
  /** Borde de tarjetas: casi invisible, solo define el contorno. */
  borde: string;
  /** Texto atenuado para metadatos (cumple AA sobre surface y background). */
  tenue: string;
  sombra: Record<NivelSombra, string>;
  /** Para barras y paneles anclados al pie. */
  sombraArriba: string;
}

export type TemaApp = MD3Theme & { extra: ColoresExtra };

// 60 % Kraft (fondo) · 30 % Verde + Tinta (estructura) · 10 % Ámbar y semánticos (atención).
export const temaClaro: TemaApp = {
  ...MD3LightTheme,
  fonts: fuentes,
  roundness: 3,
  colors: {
    ...MD3LightTheme.colors,
    primary: verde[600],
    onPrimary: kraft[0],
    primaryContainer: verde[100],
    onPrimaryContainer: verde[900],
    secondary: verde[700],
    onSecondary: kraft[0],
    secondaryContainer: verde[50],
    onSecondaryContainer: verde[800],
    tertiary: ambar[600],
    onTertiary: kraft[0],
    tertiaryContainer: ambar[100],
    onTertiaryContainer: ambar[900],
    background: kraft[50],
    onBackground: kraft[900],
    surface: kraft[0],
    onSurface: kraft[900],
    surfaceVariant: kraft[100],
    onSurfaceVariant: kraft[600],
    // Bordes de campos y botones contorno: ≥ 3:1 con el fondo (WCAG 1.4.11).
    outline: kraft[500],
    outlineVariant: kraft[200],
    error: ladrillo[600],
    onError: kraft[0],
    errorContainer: ladrillo[50],
    onErrorContainer: ladrillo[700],
    inverseSurface: kraft[900],
    inverseOnSurface: kraft[100],
    inversePrimary: verde[300],
    surfaceDisabled: 'rgba(28, 25, 23, 0.12)',
    onSurfaceDisabled: 'rgba(28, 25, 23, 0.38)',
    backdrop: 'rgba(15, 13, 11, 0.45)',
    elevation: {
      level0: 'transparent',
      level1: kraft[0],
      level2: kraft[0],
      level3: kraft[0],
      level4: kraft[0],
      level5: kraft[0],
    },
  },
  extra: {
    exito: verde[600],
    advertencia: ambar[700],
    fondoAdvertencia: ambar[50],
    deuda: ladrillo[600],
    fondoDeuda: ladrillo[50],
    aFavor: verde[600],
    acento: ambar[400],
    sobreAcento: kraft[900],
    fondoAcento: ambar[100],
    info: cielo[600],
    fondoInfo: cielo[50],
    pagos: pagos.claro,
    borde: 'rgba(28, 25, 23, 0.08)',
    tenue: kraft[600],
    sombra: sombras.claro,
    sombraArriba: sombraArriba.claro,
  },
};

export const temaOscuro: TemaApp = {
  ...MD3DarkTheme,
  fonts: fuentes,
  roundness: 3,
  colors: {
    ...MD3DarkTheme.colors,
    primary: verde[300],
    onPrimary: verde[950],
    primaryContainer: verde[900],
    onPrimaryContainer: verde[100],
    secondary: verde[200],
    onSecondary: verde[950],
    secondaryContainer: '#123524',
    onSecondaryContainer: verde[100],
    tertiary: ambar[300],
    onTertiary: kraft[900],
    tertiaryContainer: ambar[950],
    onTertiaryContainer: ambar[100],
    background: noche[950],
    onBackground: kraft[100],
    surface: noche[900],
    onSurface: kraft[100],
    surfaceVariant: noche[800],
    onSurfaceVariant: kraft[400],
    outline: kraft[500],
    outlineVariant: noche[700],
    error: ladrillo[300],
    onError: '#3A0A06',
    errorContainer: ladrillo.oscuro,
    onErrorContainer: ladrillo[100],
    inverseSurface: kraft[100],
    inverseOnSurface: kraft[900],
    inversePrimary: verde[600],
    surfaceDisabled: 'rgba(243, 238, 230, 0.12)',
    onSurfaceDisabled: 'rgba(243, 238, 230, 0.38)',
    backdrop: 'rgba(0, 0, 0, 0.6)',
    elevation: {
      level0: 'transparent',
      level1: noche[900],
      level2: noche[900],
      level3: noche[800],
      level4: noche[800],
      level5: noche[800],
    },
  },
  extra: {
    exito: verde[300],
    advertencia: ambar[300],
    fondoAdvertencia: ambar[950],
    deuda: ladrillo[300],
    fondoDeuda: ladrillo.oscuro,
    aFavor: verde[300],
    acento: ambar[300],
    sobreAcento: kraft[900],
    fondoAcento: ambar[950],
    info: cielo[300],
    fondoInfo: cielo.oscuro,
    pagos: pagos.oscuro,
    borde: 'rgba(255, 255, 255, 0.07)',
    tenue: kraft[400],
    sombra: sombras.oscuro,
    sombraArriba: sombraArriba.oscuro,
  },
};

export function temaNavegacion(t: TemaApp, oscuro: boolean): NavTheme {
  const base = oscuro ? NavDark : NavLight;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: t.colors.primary,
      background: t.colors.background,
      card: t.colors.surface,
      text: t.colors.onSurface,
      border: t.colors.outlineVariant,
      notification: t.colors.error,
    },
  };
}
