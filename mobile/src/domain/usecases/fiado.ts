import type { MetodoPagoAbono, MovimientoFiado } from '../entities';
import type { RepositorioFiado } from '../ports';
import { armarAbono, armarCargo, armarLiquidacion } from '../rules/fiado';

// async: los errores de validación llegan como promesa rechazada, igual que los de red.
export const registrarCargo = async (
  repo: RepositorioFiado,
  clienteId: string,
  monto: number,
  descripcion: string,
): Promise<string> => repo.crearCargo(armarCargo(clienteId, monto, descripcion));

export const registrarAbono = async (
  repo: RepositorioFiado,
  datos: {
    clienteId: string;
    monto: number;
    descripcion: string;
    metodoPago: MetodoPagoAbono;
    deudaOrigenId?: string;
  },
): Promise<string> =>
  repo.crearAbono(
    armarAbono(
      datos.clienteId,
      datos.monto,
      datos.descripcion,
      datos.metodoPago,
      datos.deudaOrigenId,
    ),
  );

export const liquidarCargo = async (
  repo: RepositorioFiado,
  movimientos: readonly MovimientoFiado[],
  cargoId: string,
  metodoPago: MetodoPagoAbono,
): Promise<string> => repo.crearAbono(armarLiquidacion(movimientos, cargoId, metodoPago));
