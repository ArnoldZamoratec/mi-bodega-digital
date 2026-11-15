/**
 * Dinero en céntimos enteros para evitar errores de coma flotante (D-13).
 * Firestore sigue guardando soles como `number` por compatibilidad con la web.
 */

// toFixed(6) corrige representaciones como 1.005 * 100 = 100.49999999999999.
export const aCentimos = (soles: number): number => Math.round(Number((soles * 100).toFixed(6)));

export const aSoles = (centimos: number): number => centimos / 100;

/** Redondea un monto en soles a 2 decimales exactos. */
export const redondearSoles = (soles: number): number => aSoles(aCentimos(soles));

/** Suma montos en soles sin acumular error de coma flotante. */
export const sumarSoles = (montos: readonly number[]): number =>
  aSoles(montos.reduce((acc, m) => acc + aCentimos(m), 0));

/** Multiplica un precio unitario por una cantidad, en céntimos. */
export const subtotalCentimos = (precio: number, cantidad: number): number =>
  aCentimos(precio) * cantidad;

/**
 * Formato de la web: `S/ 12.50` (RN-10). Agrega separador de miles para montos grandes.
 * Los negativos se muestran como `S/ -10.00`, igual que la web.
 */
export const formatearSoles = (soles: number): string => {
  const centimos = aCentimos(soles);
  const signo = centimos < 0 ? '-' : '';
  const abs = Math.abs(centimos);
  const enteros = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimales = (abs % 100).toString().padStart(2, '0');
  return `S/ ${signo}${enteros}.${decimales}`;
};

/** Convierte texto de un input ("12,5", "12.50") a soles; NaN si no es válido. */
export const parsearSoles = (texto: string): number => {
  const normalizado = texto.trim().replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(normalizado)) return Number.NaN;
  return redondearSoles(Number(normalizado));
};
