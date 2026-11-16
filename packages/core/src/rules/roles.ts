import type { Rol } from '../entities';
import { ErrorDominio } from '../errors';

/**
 * Cajeros y roles (D-33, docs/roles.md). Funciones puras: la autoridad real son las reglas de
 * Firestore (`firestore.rules`); aquí se refleja la misma tabla para que la interfaz oculte lo
 * que el rol no puede hacer y para sellar la autoría de cada escritura.
 */

/**
 * Quién usa la app. `bodega` = uid del dueño = raíz de datos `users/{bodega}` (sin migración).
 * Para el dueño, `bodega === uid`.
 */
export interface Sesion {
  uid: string;
  bodega: string;
  rol: Rol;
  /** Nombre visible en la autoría ("Vendió: Rosa"). */
  nombre: string;
}

export const sesionDueno = (uid: string, nombre: string): Sesion => ({
  uid,
  bodega: uid,
  rol: 'dueno',
  nombre: nombreAutor(nombre, 'dueno'),
});

// ---------------------------------------------------------------------------------------------
// Permisos: espejo exacto de la tabla de docs/roles.md
// ---------------------------------------------------------------------------------------------

export const PERMISOS = {
  verProductos: { dueno: true, cajero: true },
  editarProductos: { dueno: true, cajero: false },
  descontarStock: { dueno: true, cajero: true },
  crearClientes: { dueno: true, cajero: true },
  editarClientes: { dueno: true, cajero: false },
  registrarVenta: { dueno: true, cajero: true },
  anularVenta: { dueno: true, cajero: false },
  verVentas: { dueno: true, cajero: true },
  fiarPorVenta: { dueno: true, cajero: true },
  registrarAbono: { dueno: true, cajero: true },
  fiarSinVenta: { dueno: true, cajero: false },
  marcarPagado: { dueno: true, cajero: false },
  borrarMovimientos: { dueno: true, cajero: false },
  marcarRecordatorio: { dueno: true, cajero: true },
  usarCaja: { dueno: true, cajero: true },
  verConfig: { dueno: true, cajero: true },
  editarConfig: { dueno: true, cajero: false },
  gestionarEquipo: { dueno: true, cajero: false },
  /** No es secreto a nivel de reglas (el cajero lee ventas): la app solo lo oculta. */
  verReportes: { dueno: true, cajero: false },
} as const satisfies Record<string, Record<Rol, boolean>>;

export type Permiso = keyof typeof PERMISOS;

export function puede(sesion: Pick<Sesion, 'rol'> | null | undefined, permiso: Permiso): boolean {
  return !!sesion && PERMISOS[permiso][sesion.rol];
}

type Predicado = (sesion: Pick<Sesion, 'rol'> | null | undefined) => boolean;
const predicado =
  (permiso: Permiso): Predicado =>
  (sesion) =>
    puede(sesion, permiso);

export const puedeVerProductos = predicado('verProductos');
export const puedeEditarProductos = predicado('editarProductos');
export const puedeDescontarStock = predicado('descontarStock');
export const puedeCrearClientes = predicado('crearClientes');
export const puedeEditarClientes = predicado('editarClientes');
export const puedeRegistrarVenta = predicado('registrarVenta');
export const puedeAnularVenta = predicado('anularVenta');
export const puedeVerVentas = predicado('verVentas');
export const puedeFiarPorVenta = predicado('fiarPorVenta');
export const puedeRegistrarAbono = predicado('registrarAbono');
export const puedeFiarSinVenta = predicado('fiarSinVenta');
export const puedeMarcarPagado = predicado('marcarPagado');
export const puedeBorrarMovimientos = predicado('borrarMovimientos');
export const puedeMarcarRecordatorio = predicado('marcarRecordatorio');
export const puedeUsarCaja = predicado('usarCaja');
export const puedeVerConfig = predicado('verConfig');
export const puedeEditarConfig = predicado('editarConfig');
export const puedeGestionarEquipo = predicado('gestionarEquipo');
export const puedeVerReportes = predicado('verReportes');

/** Lanza `SIN_PERMISO` si el rol no puede. Para casos de uso, no para pintar la interfaz. */
export function exigirPermiso(sesion: Pick<Sesion, 'rol'> | null | undefined, permiso: Permiso) {
  if (!puede(sesion, permiso)) throw new ErrorDominio('SIN_PERMISO');
}

// ---------------------------------------------------------------------------------------------
// Código de invitación
// ---------------------------------------------------------------------------------------------

/** Sin 0/O/1/I/L: se dicta por teléfono y se copia de WhatsApp sin confusiones. */
export const ALFABETO_CODIGO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const LARGO_CODIGO = 8;
/** Mismo patrón que `firestore.rules` (`invitaciones/{codigo}`). */
export const PATRON_CODIGO = /^[A-HJKMNP-Z2-9]{8}$/;

/**
 * Código de 8 caracteres SIN guion (así se guarda: `invitaciones/{codigo}`).
 * `rng` devuelve un número en [0, 1). En producción, uno criptográfico
 * (p. ej. `crypto.getRandomValues`); en pruebas, uno fijo.
 */
export function generarCodigoInvitacion(rng: () => number): string {
  let codigo = '';
  for (let i = 0; i < LARGO_CODIGO; i++) {
    const r = rng();
    const indice = Math.min(
      ALFABETO_CODIGO.length - 1,
      Math.max(0, Math.floor(r * ALFABETO_CODIGO.length)),
    );
    codigo += ALFABETO_CODIGO[indice];
  }
  return codigo;
}

/** `ABCDEFGH` → `ABCD-EFGH` (para mostrar y compartir). */
export function formatearCodigo(codigo: string): string {
  const c = normalizarCodigo(codigo) ?? codigo;
  return c.length === LARGO_CODIGO ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/**
 * Lo que escribió el cajero → código guardado, o `null` si no puede ser un código.
 * Acepta minúsculas, espacios y guiones ("abcd - efgh").
 */
export function normalizarCodigo(entrada: string | null | undefined): string | null {
  const c = (entrada ?? '').toUpperCase().replace(/[\s-]/g, '');
  return PATRON_CODIGO.test(c) ? c : null;
}

// ---------------------------------------------------------------------------------------------
// Invitaciones
// ---------------------------------------------------------------------------------------------

export const MAX_CAJEROS_ACTIVOS = 3;
export const VIGENCIA_MAXIMA_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Vigencia que usa la app: 7 días menos 1 hora, para que un reloj de teléfono adelantado no
 * choque con la regla `expira <= request.time + 7 días`.
 */
export const VIGENCIA_INVITACION_MS = VIGENCIA_MAXIMA_MS - 60 * 60 * 1000;
export const LARGO_NOMBRE_MIEMBRO = 60;
export const LARGO_EMAIL_MIEMBRO = 120;
export const LARGO_NOMBRE_BODEGA = 120;

/** `artifacts/mi-bodega-app/invitaciones/{codigo}`. */
export interface Invitacion {
  codigo: string;
  /** uid del dueño = bodega. */
  dueno: string;
  rol: 'cajero';
  creada: Date | null;
  expira: Date;
  usadaPor: string | null;
  nombreBodega: string;
}

/** `users/{dueno}/miembros/{uid}`. */
export interface Miembro {
  uid: string;
  rol: 'cajero';
  nombre: string;
  email: string;
  activo: boolean;
  desde: Date | null;
  /** Código de la invitación con la que entró. */
  invitacion: string;
}

/** `artifacts/mi-bodega-app/cuentas/{uid}`: a qué bodega pertenece un cajero. */
export interface Cuenta {
  uid: string;
  bodega: string;
  rol: 'cajero';
}

export interface DatosNuevaInvitacion {
  dueno: string;
  nombreBodega: string;
  ahora: Date;
  rng: () => number;
}

/** Arma la invitación (sin escribirla). `creada` la pone el servidor (`request.time`). */
export function crearInvitacion({
  dueno,
  nombreBodega,
  ahora,
  rng,
}: DatosNuevaInvitacion): Invitacion {
  return {
    codigo: generarCodigoInvitacion(rng),
    dueno,
    rol: 'cajero',
    creada: ahora,
    expira: new Date(ahora.getTime() + VIGENCIA_INVITACION_MS),
    usadaPor: null,
    nombreBodega: recortar(nombreBodega, LARGO_NOMBRE_BODEGA) || 'Mi Bodega',
  };
}

export type ProblemaInvitacion =
  'INVITACION_NO_EXISTE' | 'INVITACION_VENCIDA' | 'INVITACION_USADA' | 'INVITACION_PROPIA';

/**
 * ¿Puede `uid` aceptar esta invitación ahora? `null` si sí. Las mismas condiciones que exigen
 * las reglas: no usada, no vencida, vigencia ≤ 7 días y que no sea la propia bodega.
 */
export function problemaInvitacion(
  inv: Invitacion | null | undefined,
  uid: string,
  ahora: Date,
): ProblemaInvitacion | null {
  if (!inv || inv.rol !== 'cajero') return 'INVITACION_NO_EXISTE';
  if (inv.dueno === uid) return 'INVITACION_PROPIA';
  if (inv.usadaPor !== null) return 'INVITACION_USADA';
  if (ahora.getTime() >= inv.expira.getTime()) return 'INVITACION_VENCIDA';
  // Vigencia mayor a 7 días: dato inventado (las reglas no lo habrían dejado crear).
  if (inv.creada && inv.expira.getTime() - inv.creada.getTime() > VIGENCIA_MAXIMA_MS) {
    return 'INVITACION_VENCIDA';
  }
  return null;
}

export function validarInvitacion(inv: Invitacion | null | undefined, uid: string, ahora: Date) {
  const problema = problemaInvitacion(inv, uid, ahora);
  if (problema) throw new ErrorDominio(problema);
}

/** Cuántos cajeros más se pueden invitar (la app lo controla; las reglas no pueden contar). */
export function cuposCajeros(miembros: readonly Pick<Miembro, 'activo'>[]): number {
  return Math.max(0, MAX_CAJEROS_ACTIVOS - miembros.filter((m) => m.activo).length);
}

/**
 * Mensaje de WhatsApp para el cajero. Cálido y directo (IDENTIDAD_VISUAL.md §9), sin emojis.
 */
export function mensajeInvitacion({
  nombreBodega,
  codigo,
}: {
  nombreBodega?: string | null;
  codigo: string;
}): string {
  const bodega = (nombreBodega ?? '').trim();
  const donde = bodega && bodega !== 'Mi Bodega' ? bodega : 'mi bodega';
  return (
    `Hola, te invito a vender en ${donde} con Bodegón. ` +
    `Descarga la app y usa el código ${formatearCodigo(codigo)}. ` +
    'El código vale por 7 días. ¡Te esperamos!'
  );
}

/**
 * Rol de quien inicia sesión. Sin `cuentas/{uid}` ⇒ dueño de su propia ruta (como hoy).
 * Con cuenta ⇒ cajero de `cuenta.bodega`, solo si su miembro existe y está activo;
 * si no, `null` (sin acceso: las reglas tampoco lo dejarían).
 */
export function resolverSesion(
  uid: string,
  nombre: string,
  cuenta: Cuenta | null | undefined,
  miembro: Miembro | null | undefined,
): Sesion | null {
  if (!cuenta) return sesionDueno(uid, nombre);
  if (!miembro || !miembro.activo || miembro.uid !== uid) return null;
  return {
    uid,
    bodega: cuenta.bodega,
    rol: 'cajero',
    nombre: nombreAutor(miembro.nombre || nombre, 'cajero'),
  };
}

// ---------------------------------------------------------------------------------------------
// Autoría (opcional para el dueño, obligatoria para el cajero)
// ---------------------------------------------------------------------------------------------

/** Nombres de campo de autoría. Lista oficial en docs/roles.md. */
export const CAMPOS_AUTORIA = {
  /** `ventas/{id}` */
  venta: { uid: 'vendidoPor', nombre: 'vendidoPorNombre' },
  /** `deudas/{id}` (cargos y abonos) */
  movimientoFiado: { uid: 'registradoPor', nombre: 'registradoPorNombre' },
  /** `cajas/{id}` al abrir */
  aperturaCaja: { uid: 'abiertaPor', nombre: 'abiertaPorNombre' },
  /** `cajas/{id}` al cerrar (junto con `estado` y `cierre`) */
  cierreCaja: { uid: 'cerradaPor', nombre: 'cerradaPorNombre' },
  /** `cajas/{id}/movimientos/{id}` */
  movimientoCaja: { uid: 'registradoPor', nombre: 'registradoPorNombre' },
} as const;

export type TipoAutoria = keyof typeof CAMPOS_AUTORIA;
type CamposDe<K extends TipoAutoria> =
  (typeof CAMPOS_AUTORIA)[K]['uid'] | (typeof CAMPOS_AUTORIA)[K]['nombre'];

export interface Autoria {
  uid: string;
  nombre: string;
}

function recortar(v: string, max: number): string {
  return v.trim().slice(0, max).trim();
}

/** Nombre apto para las reglas (no vacío, ≤ 60). */
export function nombreAutor(nombre: string | null | undefined, rol: Rol): string {
  return recortar(nombre ?? '', LARGO_NOMBRE_MIEMBRO) || (rol === 'dueno' ? 'Dueño' : 'Cajero');
}

/**
 * Agrega los campos de autoría de `tipo` a `datos`. Sin sesión (versiones viejas o rutas que
 * aún no la conocen) devuelve `datos` sin cambios: válido solo para el dueño.
 */
export function sellarAutoria<K extends TipoAutoria, T extends object>(
  tipo: K,
  datos: T,
  sesion: Pick<Sesion, 'uid' | 'nombre' | 'rol'> | null | undefined,
): T & Partial<Record<CamposDe<K>, string>> {
  if (!sesion) return datos as T & Partial<Record<CamposDe<K>, string>>;
  const campos = CAMPOS_AUTORIA[tipo];
  return {
    ...datos,
    [campos.uid]: sesion.uid,
    [campos.nombre]: nombreAutor(sesion.nombre, sesion.rol),
  } as T & Partial<Record<CamposDe<K>, string>>;
}

export const sellarVenta = <T extends object>(datos: T, sesion?: Sesion | null) =>
  sellarAutoria('venta', datos, sesion);
export const sellarMovimientoFiado = <T extends object>(datos: T, sesion?: Sesion | null) =>
  sellarAutoria('movimientoFiado', datos, sesion);
export const sellarAperturaCaja = <T extends object>(datos: T, sesion?: Sesion | null) =>
  sellarAutoria('aperturaCaja', datos, sesion);
export const sellarCierreCaja = <T extends object>(datos: T, sesion?: Sesion | null) =>
  sellarAutoria('cierreCaja', datos, sesion);
export const sellarMovimientoCaja = <T extends object>(datos: T, sesion?: Sesion | null) =>
  sellarAutoria('movimientoCaja', datos, sesion);

/** Lee la autoría de un documento (tolerante: documentos viejos no la tienen). */
export function leerAutoria(
  tipo: TipoAutoria,
  datos: Record<string, unknown> | null | undefined,
): Autoria | undefined {
  if (!datos) return undefined;
  const campos = CAMPOS_AUTORIA[tipo];
  const uid = datos[campos.uid];
  if (typeof uid !== 'string' || !uid) return undefined;
  const nombre = datos[campos.nombre];
  return { uid, nombre: typeof nombre === 'string' && nombre.trim() ? nombre.trim() : '' };
}
