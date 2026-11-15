/** Atajos de Vender (ux-web §3): "/" busca, Enter agrega el primero, Ctrl+Enter cobra. */
export type AccionTecla = 'enfocar-busqueda' | 'agregar-primero' | 'cobrar' | 'cerrar' | null;

export interface TeclaPulsada {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}

export interface ContextoTecla {
  /** El foco está en un input/textarea/select o contenteditable. */
  enCampoTexto: boolean;
  /** El foco está en la búsqueda de productos. */
  enBusqueda: boolean;
}

export function accionTecla(t: TeclaPulsada, ctx: ContextoTecla): AccionTecla {
  if (t.isComposing) return null;
  const mod = !!(t.ctrlKey || t.metaKey);
  if (t.key === 'Enter' && mod && !t.altKey) return 'cobrar';
  if (t.key === 'Escape') return 'cerrar';
  if (mod || t.altKey) return null;
  if (t.key === '/' && !ctx.enCampoTexto) return 'enfocar-busqueda';
  if (t.key === 'Enter' && ctx.enBusqueda && !t.shiftKey) return 'agregar-primero';
  return null;
}

/** ¿El elemento acepta texto? (para no robar "/" mientras se escribe). */
export function esCampoTexto(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    (el as HTMLElement).isContentEditable === true
  );
}
