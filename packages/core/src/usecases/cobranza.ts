import type { RepositorioRecordatorios } from '../portsCobranza';
import { enlaceRecordatorio, mensajeRecordatorio } from '../rules/cobranza';

/**
 * Arma el enlace de WhatsApp y anota el recordatorio. Devuelve `null` (sin anotar nada)
 * si el cliente no tiene celular. Abrir el enlace es tarea de la pantalla.
 */
export async function recordarPorWhatsapp(
  repo: RepositorioRecordatorios,
  datos: {
    clienteId: string;
    nombreCliente: string;
    telefono: string;
    saldo: number;
    nombreNegocio?: string;
  },
  ahora: Date = new Date(),
): Promise<string | null> {
  const enlace = enlaceRecordatorio(
    datos.telefono,
    mensajeRecordatorio({
      nombreCliente: datos.nombreCliente,
      saldo: datos.saldo,
      nombreNegocio: datos.nombreNegocio,
    }),
  );
  if (!enlace) return null;
  await repo.registrar(datos.clienteId, ahora);
  return enlace;
}
