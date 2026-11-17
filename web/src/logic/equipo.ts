import {
  aCentimos,
  aSoles,
  claveDiaLima,
  ErrorDominio,
  fechaEfectiva,
  puedeEditarProductos,
  resolverSesion,
  type AceptacionInvitacion,
  type Autoria,
  type Cuenta,
  type Invitacion,
  type Miembro,
  type Sesion,
} from '@bodegon/core';

import { aFecha, type VentaWeb } from '../mappers';
import { etiquetaCorta } from './periodos';

/**
 * Equipo (D-33, docs/roles.md) en la web: lo que no depende de Firebase ni del DOM, para
 * probarlo con Vitest. Los nombres y la forma de los documentos son los de `firestore.rules`.
 */
type Datos = Record<string, unknown>;

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');

// ---------- Documentos → entidades del core (tolerantes) ----------

/** `invitaciones/{codigo}`. `null` si el documento no sirve (sin dueño o sin vencimiento). */
export function aInvitacion(codigo: string, d: Datos | undefined | null): Invitacion | null {
  if (!d) return null;
  const expira = aFecha(d.expira);
  const dueno = texto(d.dueno);
  if (!expira || !dueno) return null;
  return {
    codigo,
    dueno,
    rol: 'cajero',
    creada: aFecha(d.creada),
    expira,
    usadaPor: typeof d.usadaPor === 'string' && d.usadaPor ? d.usadaPor : null,
    nombreBodega: texto(d.nombreBodega),
  };
}

/** `users/{dueno}/miembros/{uid}`. Solo `activo === true` da acceso (igual que las reglas). */
export function aMiembro(uid: string, d: Datos | undefined | null): Miembro | null {
  if (!d) return null;
  return {
    uid,
    rol: 'cajero',
    nombre: texto(d.nombre),
    email: texto(d.email),
    activo: d.activo === true,
    desde: aFecha(d.desde),
    invitacion: texto(d.invitacion),
  };
}

/** `cuentas/{uid}`. Sin `bodega` válida = como si no existiera (dueño de su ruta). */
export function aCuenta(uid: string, d: Datos | undefined | null): Cuenta | null {
  if (!d) return null;
  const bodega = texto(d.bodega);
  if (!bodega || bodega === uid) return null;
  return { uid, bodega, rol: 'cajero' };
}

// ---------- Entidades → escrituras EXACTAS que aceptan las reglas ----------

/** Invitación nueva. `S` = sello del servidor (`creada == request.time`), `T` = Timestamp. */
export function documentoInvitacion<S, T>(inv: Invitacion, sello: S, aTimestamp: (d: Date) => T) {
  return {
    dueno: inv.dueno,
    rol: 'cajero' as const,
    creada: sello,
    expira: aTimestamp(inv.expira),
    usadaPor: null,
    nombreBodega: inv.nombreBodega,
  };
}

/** Miembro creado al aceptar (`desde == request.time`). `email` solo si hay uno. */
export function documentoMiembro<S>(a: AceptacionInvitacion, sello: S) {
  const email = a.miembro.email.trim();
  return {
    rol: 'cajero' as const,
    nombre: a.miembro.nombre,
    ...(email ? { email } : {}),
    activo: true,
    desde: sello,
    invitacion: a.codigo,
  };
}

export const documentoCuenta = (a: AceptacionInvitacion) => ({ bodega: a.dueno, rol: 'cajero' as const });

// ---------- Sesión al ingresar ----------

export type Acceso =
  | { tipo: 'ok'; sesion: Sesion }
  | {
      tipo: 'sin-acceso';
      /** `desactivado`: el miembro existe con activo false. `quitado`: ya no existe. */
      motivo: 'desactivado' | 'quitado';
      bodega: string;
      /** Código con el que entró (para leer el nombre de la bodega). */
      codigo: string | null;
    };

/**
 * `resolverSesion` del core más el motivo cuando no hay acceso, para explicarlo con claridad.
 * Sin cuenta ⇒ dueño de su ruta, igual que siempre.
 */
export function resolverAcceso(
  uid: string,
  nombre: string,
  cuenta: Cuenta | null,
  miembro: Miembro | null,
): Acceso {
  const sesion = resolverSesion(uid, nombre, cuenta, miembro);
  if (sesion) return { tipo: 'ok', sesion };
  const bodega = cuenta?.bodega ?? '';
  const valido = miembro && miembro.uid === uid;
  return {
    tipo: 'sin-acceso',
    motivo: valido ? 'desactivado' : 'quitado',
    bodega,
    codigo: valido && miembro.invitacion ? miembro.invitacion : null,
  };
}

/** Nombre visible de quien ingresa: el de Google, o nada (el core pone "Dueño"/"Cajero"). */
export const nombreDeUsuario = (u: { displayName?: string | null }): string => (u.displayName ?? '').trim();

/** Nombre sugerido para el cajero al aceptar: el de Google o lo que va antes de la @. */
export function nombreSugerido(u: { displayName?: string | null; email?: string | null }): string {
  const n = nombreDeUsuario(u);
  if (n) return n;
  const local = (u.email ?? '').split('@')[0] ?? '';
  const limpio = local.replace(/[._\d-]+/g, ' ').trim();
  return limpio ? limpio.charAt(0).toUpperCase() + limpio.slice(1) : '';
}

// ---------- Ventas: stock y autoría ----------

/**
 * ¿Se aplica `increment(delta)` a este producto al vender? El dueño, como siempre: todo
 * producto con stock controlado. Quien no edita productos (cajero) solo puede BAJAR un stock
 * numérico (las reglas rechazan la venta entera si toca un stock `null` o lo sube).
 */
export function debeDescontarStock(stock: unknown, delta: number, sesion: Pick<Sesion, 'rol'> | null): boolean {
  if (stock === null || stock === undefined) return false;
  if (puedeEditarProductos(sesion)) return true;
  return typeof stock === 'number' && Number.isFinite(stock) && delta < 0;
}

export interface VentasDeAutor {
  /** uid, o '' para las ventas sin autoría (antiguas o de una versión vieja). */
  uid: string;
  nombre: string;
  total: number;
  cantidad: number;
}

/**
 * "Quién vendió cuánto": suma por autor (`vendidoPor`). Una anulación descuenta a quien hizo
 * la venta original (no a quien la anuló) y no cuenta como venta. `desde` filtra por fecha
 * efectiva (p. ej. desde la apertura de la caja). Mayor total primero.
 */
export function ventasPorAutor(ventas: readonly VentaWeb[], desde?: Date | null): VentasDeAutor[] {
  const autorDe = new Map<string, Autoria | undefined>(ventas.map((v) => [v.id, v.autor]));
  const grupos = new Map<string, { nombre: string; centimos: number; cantidad: number }>();
  for (const v of ventas) {
    if (desde) {
      const f = fechaEfectiva(v);
      if (f && f.getTime() < desde.getTime()) continue;
    }
    const autor = v.anulaA ? (autorDe.get(v.anulaA) ?? v.autor) : v.autor;
    const clave = autor?.uid ?? '';
    const g = grupos.get(clave) ?? { nombre: autor?.nombre ?? '', centimos: 0, cantidad: 0 };
    g.centimos += aCentimos(v.total);
    if (!v.anulaA) g.cantidad += 1;
    if (!g.nombre && autor?.nombre) g.nombre = autor.nombre;
    grupos.set(clave, g);
  }
  return [...grupos.entries()]
    .map(([uid, g]) => ({ uid, nombre: g.nombre, total: aSoles(g.centimos), cantidad: g.cantidad }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/** ¿Vendió alguien que no es el dueño? Solo entonces se muestra "quién vendió". */
export const hayVentasDeCajeros = (ventas: readonly VentaWeb[], bodega: string): boolean =>
  ventas.some((v) => !!v.autor && v.autor.uid !== bodega);

// ---------- Textos ----------

/** WhatsApp sin número fijo: el dueño elige el contacto. */
export const enlaceWhatsAppTexto = (mensaje: string): string => `https://wa.me/?text=${encodeURIComponent(mensaje)}`;

/** "Vence el lun 23" / "Venció". */
export function textoVence(inv: Pick<Invitacion, 'expira'>, ahora: Date): string {
  if (inv.expira.getTime() <= ahora.getTime()) return 'Venció';
  return `Vale hasta el ${etiquetaCorta(claveDiaLima(inv.expira))}`;
}

/** Invitaciones del dueño que aún sirven (sin usar y sin vencer), la más nueva primero. */
export function invitacionesVigentes(invs: readonly Invitacion[], ahora: Date): Invitacion[] {
  return invs
    .filter((i) => i.usadaPor === null && i.expira.getTime() > ahora.getTime())
    .sort((a, b) => b.expira.getTime() - a.expira.getTime());
}

/**
 * Cupos del tope de 3: cuentan los cajeros activos y las invitaciones vigentes sin usar
 * (cada una puede convertirse en un cajero activo). Se pasa a `cuposCajeros` del core.
 */
export function ocupanCupo(miembros: readonly Miembro[], vigentes: readonly Invitacion[]): Pick<Miembro, 'activo'>[] {
  return [...miembros.map((m) => ({ activo: m.activo })), ...vigentes.map(() => ({ activo: true }))];
}

/** Error al guardar algo del equipo → mensaje para la persona (sin códigos técnicos). */
export function mensajeErrorEquipo(error: unknown, porDefecto: string): string {
  if (error instanceof ErrorDominio) return error.message;
  if (error instanceof AvisoEquipo) return error.message;
  const code = (error as { code?: string } | null)?.code ?? '';
  if (code === 'unavailable' || code === 'failed-precondition' || code === 'deadline-exceeded')
    return 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.';
  // permission-denied y el resto: el mensaje de quien llama explica qué pasó en su caso.
  return porDefecto;
}

/** Aviso propio de la web (casos que el core no cubre), con mensaje listo para mostrar. */
export class AvisoEquipo extends Error {
  constructor(
    readonly codigo: 'YA_ERES_CAJERO' | 'ACCESO_EN_PAUSA',
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'AvisoEquipo';
  }
}

/** Mientras escribe el código: mayúsculas, sin espacios ni símbolos, y el guion tras 4 ("ABCD-EF"). */
export function codigoMientrasEscribe(entrada: string): string {
  const c = entrada.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
}

/** Ventas desde la apertura de la caja (fecha efectiva; las sin fecha aún cuentan). */
export function ventasDelTurno<V extends VentaWeb>(ventas: readonly V[], caja: { apertura: { fecha: Date | null; creadaEn?: Date } }): V[] {
  const inicio = fechaEfectiva(caja.apertura);
  if (!inicio) return [...ventas];
  return ventas.filter((v) => {
    const f = fechaEfectiva(v);
    return !f || f.getTime() >= inicio.getTime();
  });
}
