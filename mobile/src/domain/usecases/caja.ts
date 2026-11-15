import type { RepositorioCaja } from '../portsCaja';
import {
  armarApertura,
  armarCierre,
  armarMovimientoCaja,
  type Caja,
  type TipoMovimientoCaja,
} from '../rules/caja';

// async: los errores de validación llegan como promesa rechazada, igual que los de red.

/** Abre una caja nueva. Falla si ya hay una abierta (también si aún está en el teléfono). */
export async function abrirCaja(
  repo: RepositorioCaja,
  cajas: readonly Caja[],
  monto: number,
  ahora: number = Date.now(),
): Promise<string> {
  const op = armarApertura(cajas, repo.nuevoId(), monto, ahora);
  await repo.guardar(op);
  return op.cajaId;
}

export async function registrarMovimientoCaja(
  repo: RepositorioCaja,
  caja: Caja | undefined,
  tipo: TipoMovimientoCaja,
  monto: number,
  motivo: string,
  ahora: number = Date.now(),
): Promise<string> {
  const id = caja ? repo.nuevoIdMovimiento(caja.id) : '';
  const op = armarMovimientoCaja(caja, id, tipo, monto, motivo, ahora);
  await repo.guardar(op);
  return op.id;
}

/** Cierra con el conteo de efectivo. `esperado` sale de `resumenCaja` en el mismo instante. */
export async function cerrarCaja(
  repo: RepositorioCaja,
  caja: Caja | undefined,
  contado: number,
  esperado: number,
  ahora: number = Date.now(),
): Promise<void> {
  await repo.guardar(armarCierre(caja, contado, esperado, ahora));
}
