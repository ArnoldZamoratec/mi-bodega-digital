/** "Martes, 20 de octubre" */
export function fechaLarga(d = new Date()): string {
  const t = d.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Dos iniciales: "Coca cola" → "CC", "Pan" → "PA". */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase();
  return (partes[0] ?? '?').slice(0, 2).toUpperCase();
}

/** Saludo según la hora local. */
export function saludo(d = new Date()): string {
  const h = d.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}
