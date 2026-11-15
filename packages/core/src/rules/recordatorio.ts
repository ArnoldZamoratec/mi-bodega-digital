import { CONFIG_NEGOCIO_POR_DEFECTO } from '../entities';
import { formatearSoles } from './dinero';

/**
 * Recordatorio de deuda por WhatsApp. Lo comparten la web (modal de detalle del cliente) y
 * la app móvil (ClienteDetalleScreen), para que ambas manden el mismo mensaje.
 */

/**
 * Celular peruano → número internacional para `wa.me` (`51` + 9 dígitos que empiezan en 9).
 * Acepta espacios, guiones, paréntesis y el prefijo `+51`/`51`. `null` si no es un celular.
 */
export function numeroWhatsApp(telefono: string | null | undefined): string | null {
  const digitos = (telefono ?? '').replace(/\D/g, '');
  const local = digitos.startsWith('51') && digitos.length === 11 ? digitos.slice(2) : digitos;
  return /^9\d{8}$/.test(local) ? `51${local}` : null;
}

export interface DatosRecordatorio {
  nombreCliente: string;
  /** Saldo en soles (positivo = el cliente debe). */
  saldo: number;
  /** `config/negocio.nombre`. Vacío o el valor por defecto ⇒ "tu bodega". */
  nombreBodega?: string | null;
}

const nombreBodegaUtil = (nombre: string | null | undefined): string | null => {
  const n = (nombre ?? '').trim();
  return n && n !== CONFIG_NEGOCIO_POR_DEFECTO.nombre ? n : null;
};

/**
 * Mensaje cordial con el monto pendiente. Si el cliente no debe nada (saldo ≤ 0) devuelve
 * un saludo sin cobro, aunque la UI normalmente oculta el botón en ese caso.
 */
export function mensajeRecordatorio({
  nombreCliente,
  saldo,
  nombreBodega,
}: DatosRecordatorio): string {
  // Primer nombre: "Hola Rosa" suena a vecino, "Hola Rosa Quispe" suena a cobranza formal.
  const cliente = nombreCliente.trim().split(/\s+/)[0] ?? '';
  const saludo = cliente ? `Hola ${cliente}` : 'Hola';
  const bodega = nombreBodegaUtil(nombreBodega);
  const firma = bodega ? `te saluda ${bodega}` : 'te saluda tu bodega';
  if (saldo <= 0) {
    return `${saludo}, ${firma}. No tienes saldo pendiente. ¡Gracias por tu preferencia!`;
  }
  return (
    `${saludo}, ${firma}. Te recordamos con cariño que tu saldo pendiente es ` +
    `${formatearSoles(saldo)}. Cuando puedas, te esperamos. ¡Gracias!`
  );
}

/** Enlace `https://wa.me/...` listo para abrir, o `null` si el teléfono no es un celular. */
export function enlaceRecordatorioWhatsApp(
  telefono: string | null | undefined,
  datos: DatosRecordatorio,
): string | null {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensajeRecordatorio(datos))}`;
}
