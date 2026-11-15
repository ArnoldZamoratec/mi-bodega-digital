import { haceDias } from '@bodegon/core/rules/cobranza';

/** Más de 15 días sin pagar = atraso real (único caso con ladrillo, ux-web §2). */
export const DIAS_ATRASO = 15;

export interface ChipDias {
  texto: string;
  atrasado: boolean;
}

/** Chip de la fila de Por cobrar: "Debe desde hoy", "desde hace 23 días". */
export function chipDias(dias: number): ChipDias {
  return { texto: `desde ${haceDias(dias)}`, atrasado: dias > DIAS_ATRASO };
}

/** Iniciales para el monograma del cliente ("Rosa Quispe" → "RQ"). */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  const letras = partes.length > 1 ? [partes[0]!, partes[partes.length - 1]!] : partes.slice(0, 1);
  return letras.map((p) => p.charAt(0).toUpperCase()).join('') || '·';
}
