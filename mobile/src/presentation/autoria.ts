import { leerAutoria, type TipoAutoria } from '@/domain/rules/roles';

/**
 * D-33: "Vendió: Rosa", "Cerró: Lucho". `null` si el documento no tiene autoría (ventas de la
 * web, de versiones anteriores o aún en el teléfono): entonces no se muestra nada.
 */
export function textoAutoria(
  tipo: TipoAutoria,
  documento: object | null | undefined,
  verbo: string,
) {
  const autoria = leerAutoria(tipo, documento as Record<string, unknown> | null | undefined);
  if (!autoria) return null;
  return `${verbo}: ${autoria.nombre || 'sin nombre'}`;
}
