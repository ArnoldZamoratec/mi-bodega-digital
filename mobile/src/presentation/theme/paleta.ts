/**
 * Primitivos de color de Bodegón Digital (IDENTIDAD_VISUAL.md §4).
 * Ninguna pantalla debe usar estos valores directamente: pasan por los roles semánticos
 * de `tema.ts`. Agregar un color aquí exige verificar su contraste (§5 del documento).
 */

/** Verde Bodegón: confianza, dinero sano, "todo en orden". Marca = 600. */
export const verde = {
  50: '#ECF8F3',
  100: '#D0EFE2',
  200: '#A3DEC6',
  300: '#6CC6A5',
  400: '#36A982',
  500: '#178C68',
  600: '#0B6B4F',
  700: '#0A5640',
  800: '#0A4534',
  900: '#08392B',
  950: '#032019',
} as const;

/** Ámbar Mostrador: calidez de barrio, celebración. Solo 10 % de la pantalla. Marca = 400. */
export const ambar = {
  50: '#FFF8EB',
  100: '#FEEBC7',
  200: '#FDD58A',
  300: '#FBBD4E',
  400: '#F5A524',
  500: '#E08A0B',
  600: '#B86A06',
  700: '#925009',
  800: '#773F0E',
  900: '#64350F',
  950: '#3A1A04',
} as const;

/** Kraft: papel de cuaderno (fondos) y tinta (texto). Fondo = 50, texto = 900. */
export const kraft = {
  0: '#FFFFFF',
  50: '#FAF7F2',
  100: '#F3EEE6',
  200: '#E7E0D5',
  300: '#D3C9BA',
  400: '#A99E8E',
  500: '#7D7365',
  600: '#5E564B',
  700: '#47413A',
  800: '#2E2A25',
  900: '#1C1917',
  950: '#0F0D0B',
} as const;

/** Ladrillo: deuda y error. Firme pero terroso: avisa sin acusar. */
export const ladrillo = {
  50: '#FEF2F1',
  100: '#FEE4E2',
  300: '#FB8F84',
  600: '#B42318',
  700: '#912018',
  oscuro: '#3A1714',
} as const;

/** Cielo: solo información neutra, nunca marca. */
export const cielo = {
  50: '#EEF4FF',
  300: '#8DB4FF',
  600: '#1D5FD1',
  oscuro: '#13254A',
} as const;

/** Modo oscuro "Noche": negro con matiz verde, no negro puro. */
export const noche = {
  950: '#0E1311',
  900: '#161C19',
  800: '#1E2622',
  700: '#2A332F',
} as const;

/** Medios de pago (solo datos y gráficos): se respeta el morado de Yape/Plin. */
export const pagos = {
  claro: { efectivo: verde[600], yape: '#7C3AED', fiado: ladrillo[600] },
  oscuro: { efectivo: verde[300], yape: '#A78BFA', fiado: ladrillo[300] },
} as const;
