import type { Venta } from '../entities';
import { ErrorDominio } from '../errors';
import type { ColaVentas, RepositorioVentas } from '../ports';
import { armarAnulacion, type MotivoAnulacion } from '../rules/anulacion';
import type { OperacionVenta } from '../rules/venta';

/**
 * Anula una venta ya registrada en la nube con un contraasiento (ver rules/anulacion.ts).
 * Requiere conexión: la consulta del cargo fiado y la transacción van al servidor.
 */
export async function anularVenta(
  deps: { ventas: RepositorioVentas },
  venta: Venta,
  motivo: MotivoAnulacion,
  ahora = Date.now(),
): Promise<void> {
  const op = armarAnulacion(venta, motivo, ahora);
  const r = await deps.ventas.anular(op, venta);
  if (r === 'ya-existia') throw new ErrorDominio('VENTA_YA_ANULADA');
}

/**
 * "Deshacer" inmediato tras cobrar (desde la confirmación de venta):
 *  - si la venta aún está en el teléfono (sin red), basta con quitarla de la cola;
 *  - si ya se sincronizó, se anula con contraasiento.
 */
export async function deshacerVenta(
  deps: { ventas: RepositorioVentas; cola: ColaVentas },
  operacion: OperacionVenta,
): Promise<void> {
  const enCola = (await deps.cola.listar()).some((e) => e.operacion.ventaId === operacion.ventaId);
  if (enCola) {
    await deps.cola.quitar(operacion.ventaId);
    return;
  }
  await anularVenta(
    deps,
    { id: operacion.ventaId, ...operacion.venta, fecha: new Date(operacion.creadaEn) },
    'Deshecha al momento',
  );
}
