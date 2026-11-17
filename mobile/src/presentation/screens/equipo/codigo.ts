import * as Crypto from 'expo-crypto';

import { LARGO_CODIGO } from '@/domain/rules/roles';

/**
 * Mientras el cajero escribe: mayúsculas, sin espacios ni símbolos, máximo 8 caracteres y
 * guion a la mitad ("abcde" → "ABCD-E"). La validación final es `normalizarCodigo` del core.
 */
export function formatearEntradaCodigo(texto: string): string {
  const limpio = texto
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, LARGO_CODIGO);
  return limpio.length > 4 ? `${limpio.slice(0, 4)}-${limpio.slice(4)}` : limpio;
}

/**
 * Número en [0, 1) del generador criptográfico del sistema (expo-crypto): Hermes no garantiza
 * `crypto.getRandomValues` y `Math.random` es predecible, mal para códigos de invitación.
 */
export function rngSeguro(): number {
  const a = new Uint32Array(1);
  Crypto.getRandomValues(a);
  return (a[0] ?? 0) / 2 ** 32;
}

/** "vence en 3 días", "vence hoy", "venció". */
export function textoVencimiento(expira: Date, ahora: Date): string {
  const ms = expira.getTime() - ahora.getTime();
  if (ms <= 0) return 'Venció';
  const dias = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (dias === 0) return 'Vence hoy';
  return dias === 1 ? 'Vence en 1 día' : `Vence en ${dias} días`;
}
