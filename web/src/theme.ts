/**
 * Tema claro / oscuro ("Noche", IDENTIDAD_VISUAL §4.6) con tokens CSS. Por defecto sigue al
 * sistema (prefers-color-scheme); el botón fija una preferencia en este navegador.
 */
export type PreferenciaTema = 'sistema' | 'claro' | 'oscuro';
const CLAVE = 'bodegon-tema';

const leer = (): PreferenciaTema => {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === 'claro' || v === 'oscuro' ? v : 'sistema';
  } catch {
    return 'sistema';
  }
};

export const preferenciaTema = (): PreferenciaTema => leer();

/** Tema efectivo en este momento. */
export function temaActual(): 'claro' | 'oscuro' {
  const p = leer();
  if (p !== 'sistema') return p;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
    ? 'oscuro'
    : 'claro';
}

const oyentes = new Set<() => void>();
export const alCambiarTema = (fn: () => void): void => {
  oyentes.add(fn);
};

function aplicar(): void {
  const p = leer();
  const raiz = document.documentElement;
  if (p === 'sistema') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', p === 'oscuro' ? 'dark' : 'light');
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute('content', temaActual() === 'oscuro' ? '#0E1311' : '#FAF7F2');
  for (const fn of oyentes) fn();
}

export function fijarTema(p: PreferenciaTema): void {
  try {
    if (p === 'sistema') localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, p);
  } catch {
    /* almacenamiento bloqueado: solo esta sesión */
  }
  aplicar();
}

/** Alterna claro/oscuro respecto del tema que se ve ahora. */
export const alternarTema = (): void => fijarTema(temaActual() === 'oscuro' ? 'claro' : 'oscuro');

export function initTheme(): void {
  aplicar();
  if (typeof matchMedia === 'function') {
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => {
      if (leer() === 'sistema') aplicar();
    });
  }
}
