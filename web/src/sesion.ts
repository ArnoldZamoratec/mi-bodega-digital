import { puede, type Autoria, type Permiso, type Sesion } from '@bodegon/core';

/**
 * Quién usa la web y en qué bodega (D-33, docs/roles.md). La resuelve main.ts al iniciar sesión
 * (`cuentas/{uid}` + `miembros/{uid}` con `resolverSesion` del core). Sin dependencia de
 * Firebase: las vistas preguntan aquí qué mostrar y la capa de datos sella la autoría.
 *
 * Los permisos salen SIEMPRE de `PERMISOS`/`puede` del core: la autoridad real son las reglas
 * de Firestore; la interfaz solo oculta lo que el rol no puede hacer.
 */
let actual: Sesion | null = null;

export const sesionActual = (): Sesion | null => actual;

export function fijarSesion(s: Sesion | null): void {
  actual = s;
}

/** ¿El rol actual puede hacer esto? Sin sesión: no. */
export const permite = (permiso: Permiso): boolean => puede(actual, permiso);

export const esCajero = (): boolean => actual?.rol === 'cajero';

/**
 * Oculta los elementos marcados con `data-permiso="editarProductos"` (HTML fijo que se monta
 * una vez, como la barra de Productos o el riel). Lo dinámico se arma ya filtrado.
 */
export function aplicarPermisos(raiz: ParentNode = document): void {
  raiz.querySelectorAll<HTMLElement>('[data-permiso]').forEach((el) => {
    const p = el.dataset.permiso as Permiso;
    el.hidden = !puede(actual, p);
  });
}

/** "Tú" si lo hizo quien mira; si no, el nombre guardado (o "Cajero" si falta). */
export function nombreDeAutor(autor: Autoria, sesion: Sesion | null = actual): string {
  if (sesion && autor.uid === sesion.uid) return 'Tú';
  return autor.nombre || (sesion && autor.uid === sesion.bodega ? 'Dueño' : 'Cajero');
}

/** Solo vale la pena mostrar la autoría si lo hizo otra persona (en una bodega sin cajeros, nunca). */
export const esDeOtro = (autor: Autoria | undefined, sesion: Sesion | null = actual): autor is Autoria =>
  !!autor && !!sesion && autor.uid !== sesion.uid;

/**
 * Acciones de cuenta que dependen de Firebase (las registra main.ts; la demo, las suyas) y que
 * se ofrecen desde las vistas, p. ej. "Tengo un código de invitación" en Ajustes.
 */
export interface AccionesCuenta {
  unirmeConCodigo(): void;
}
let acciones: AccionesCuenta | null = null;
export const fijarAccionesCuenta = (a: AccionesCuenta | null): void => {
  acciones = a;
};
export const accionesCuenta = (): AccionesCuenta | null => acciones;
