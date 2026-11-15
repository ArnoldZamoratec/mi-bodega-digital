import type { Cliente, MovimientoFiado } from '../entities';
import { aCentimos, aSoles, formatearSoles } from './dinero';
import { calcularSaldo, cargoMasAntiguoPendiente } from './fiado';
import { crearRango, fechaEfectiva, type RangoFechas } from './reportes';

/**
 * Cobranza (D-27): a quién cobrar primero y cómo recordárselo con respeto.
 * Funciones puras; la pantalla solo las muestra.
 */

const MS_DIA = 24 * 60 * 60 * 1000;

/**
 * Pausa sugerida entre dos recordatorios al mismo cliente. No bloquea: la pantalla solo lo
 * muestra de forma discreta, para no insistir (IDENTIDAD_VISUAL §1.2: respeto, nunca castigo).
 */
export const DIAS_PAUSA_RECORDATORIO = 3;

/**
 * Celular peruano (9 dígitos que empiezan en 9, con o sin +51) → número para wa.me
 * (`51XXXXXXXXX`). `null` si no parece un celular: no se ofrece WhatsApp.
 */
export function numeroWhatsapp(telefono: string): string | null {
  const digitos = telefono.replace(/\D/g, '');
  const local = digitos.startsWith('51') && digitos.length === 11 ? digitos.slice(2) : digitos;
  return /^9\d{8}$/.test(local) ? `51${local}` : null;
}

/** Nombre por defecto del negocio (ConfigNegocio): en el mensaje se lee "tu bodega". */
const NOMBRE_GENERICO = 'mi bodega';

/**
 * Mensaje de recordatorio. Tono de la marca: tutea con respeto, dice el monto y agradece;
 * nunca "deuda", "moroso" ni urgencias (IDENTIDAD_VISUAL §9).
 */
export function mensajeRecordatorio(datos: {
  nombreCliente: string;
  saldo: number;
  nombreNegocio?: string;
}): string {
  const negocio = datos.nombreNegocio?.trim();
  const firma = negocio && negocio.toLowerCase() !== NOMBRE_GENERICO ? negocio : 'tu bodega';
  const nombre = datos.nombreCliente.trim().split(/\s+/)[0] || datos.nombreCliente.trim();
  return `Hola ${nombre}, te saluda ${firma}. Tu saldo pendiente es ${formatearSoles(datos.saldo)}. ¡Gracias!`;
}

/** Enlace `https://wa.me/...` con el mensaje, o `null` si el teléfono no es un celular. */
export function enlaceRecordatorio(telefono: string, mensaje: string): string | null {
  const numero = numeroWhatsapp(telefono);
  return numero ? `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}` : null;
}

/** Días de calendario (hora local) entre dos fechas: hoy = 0, ayer = 1. Nunca negativo. */
export function diasCalendario(desde: Date, hasta: Date): number {
  const a = new Date(desde.getFullYear(), desde.getMonth(), desde.getDate()).getTime();
  const b = new Date(hasta.getFullYear(), hasta.getMonth(), hasta.getDate()).getTime();
  // Math.round absorbe los días de 23/25 h si el teléfono tuviera horario de verano.
  return Math.max(0, Math.round((b - a) / MS_DIA));
}

/** "hoy", "ayer", "hace 5 días". */
export function haceDias(dias: number): string {
  if (dias <= 0) return 'hoy';
  if (dias === 1) return 'ayer';
  return `hace ${dias} días`;
}

/** true si el último recordatorio fue hace menos de `DIAS_PAUSA_RECORDATORIO` (en horas reales). */
export function recordadoHacePoco(ultimo: Date | null | undefined, ahora: Date): boolean {
  if (!ultimo || Number.isNaN(ultimo.getTime())) return false;
  const transcurrido = ahora.getTime() - ultimo.getTime();
  // Un recordatorio "en el futuro" (reloj del teléfono adelantado) cuenta como reciente.
  return transcurrido < DIAS_PAUSA_RECORDATORIO * MS_DIA;
}

export interface FilaCobranza {
  cliente: Cliente;
  /** Soles que debe (> 0). */
  saldo: number;
  /** Fecha efectiva (D-26) del cargo pendiente más antiguo según FIFO (D-14). */
  desde: Date | null;
  /** Días de calendario desde ese cargo. */
  diasPendiente: number;
  ultimoRecordatorio: Date | null;
  /** Días de calendario desde el último recordatorio; `null` si nunca se le recordó. */
  diasDesdeRecordatorio: number | null;
  recordadoHacePoco: boolean;
  /** Número para wa.me o `null` si no tiene celular. */
  whatsapp: string | null;
}

/**
 * Clientes con saldo > 0, primero los que deben desde hace más tiempo. El cargo "más
 * antiguo" es el primero que los abonos aún no cubren (FIFO, igual que el detalle del
 * cliente), con su fecha efectiva: una venta fiada sin conexión cuenta desde que se fió.
 * Desempate: mayor saldo primero y luego por nombre.
 */
export function listaCobranza(
  clientes: readonly Cliente[],
  movimientos: readonly MovimientoFiado[],
  ahora: Date,
): FilaCobranza[] {
  const porCliente = new Map<string, MovimientoFiado[]>();
  for (const m of movimientos) {
    const lista = porCliente.get(m.clienteId);
    if (lista) lista.push(m);
    else porCliente.set(m.clienteId, [m]);
  }

  const filas: FilaCobranza[] = [];
  for (const cliente of clientes) {
    const movs = porCliente.get(cliente.id);
    if (!movs) continue;
    const saldo = calcularSaldo(movs);
    if (aCentimos(saldo) <= 0) continue;
    const cargo = cargoMasAntiguoPendiente(movs);
    // Sin fecha (serverTimestamp pendiente y sin creadaEn) ⇒ es de ahora.
    const desde = cargo ? (fechaEfectiva(cargo.movimiento) ?? ahora) : null;
    const ultimo =
      cliente.ultimoRecordatorio && !Number.isNaN(cliente.ultimoRecordatorio.getTime())
        ? cliente.ultimoRecordatorio
        : null;
    filas.push({
      cliente,
      saldo,
      desde,
      diasPendiente: desde ? diasCalendario(desde, ahora) : 0,
      ultimoRecordatorio: ultimo,
      diasDesdeRecordatorio: ultimo ? diasCalendario(ultimo, ahora) : null,
      recordadoHacePoco: recordadoHacePoco(ultimo, ahora),
      whatsapp: numeroWhatsapp(cliente.telefono),
    });
  }

  const tiempo = (f: FilaCobranza) => (f.desde ? f.desde.getTime() : Number.MAX_SAFE_INTEGER);
  return filas.sort(
    (a, b) =>
      tiempo(a) - tiempo(b) ||
      aCentimos(b.saldo) - aCentimos(a.saldo) ||
      a.cliente.nombre.localeCompare(b.cliente.nombre),
  );
}

/** Total por cobrar de la lista (solo saldos positivos), sin error de coma flotante. */
export const totalPorCobrar = (filas: readonly Pick<FilaCobranza, 'saldo'>[]): number =>
  aSoles(filas.reduce((acc, f) => acc + Math.max(0, aCentimos(f.saldo)), 0));

/** Mes calendario local (America/Lima en Perú, B-04) que contiene `ahora`. */
export function rangoMes(ahora: Date): RangoFechas {
  return crearRango(
    new Date(ahora.getFullYear(), ahora.getMonth(), 1),
    new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0),
  );
}

/**
 * "Recuperado este mes": suma de los abonos (cualquier medio de pago) cuya fecha efectiva
 * (D-26) cae en el mes calendario de `ahora`. Incluye los abonos aún en el teléfono.
 */
export function recuperadoEnMes(movimientos: readonly MovimientoFiado[], ahora: Date): number {
  const { inicio, fin } = rangoMes(ahora);
  let centimos = 0;
  for (const m of movimientos) {
    if (m.monto >= 0) continue;
    const f = fechaEfectiva(m);
    if (!f || f.getTime() < inicio.getTime() || f.getTime() > fin.getTime()) continue;
    centimos += Math.abs(aCentimos(m.monto));
  }
  return aSoles(centimos);
}
