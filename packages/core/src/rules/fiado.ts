import { METODOS_PAGO_ABONO, type MetodoPagoAbono, type MovimientoFiado } from '../entities';
import { ErrorDominio } from '../errors';
import { aCentimos, aSoles } from './dinero';
import type { OperacionVenta } from './venta';

export const esCargo = (m: Pick<MovimientoFiado, 'monto'>): boolean => m.monto > 0;
export const esAbono = (m: Pick<MovimientoFiado, 'monto'>): boolean => m.monto < 0;

/**
 * Saldo con la **misma fórmula que la web** (clients.js), para que ambas interfaces
 * muestren el mismo número:  Σ abonos (negativos) + Σ cargos con pagado !== true.
 * Positivo = el cliente debe. Negativo = saldo a favor del cliente.
 */
export function calcularSaldo(
  movimientos: readonly Pick<MovimientoFiado, 'monto' | 'pagado'>[],
): number {
  let centimos = 0;
  for (const m of movimientos) {
    if (m.monto < 0) centimos += aCentimos(m.monto);
    else if (m.monto > 0 && m.pagado !== true) centimos += aCentimos(m.monto);
  }
  return aSoles(centimos);
}

/** Saldos de todos los clientes con una sola pasada (corrige B-05: un listener, no N). */
export function saldosPorCliente(movimientos: readonly MovimientoFiado[]): Map<string, number> {
  const agrupados = new Map<string, MovimientoFiado[]>();
  for (const m of movimientos) {
    const lista = agrupados.get(m.clienteId);
    if (lista) lista.push(m);
    else agrupados.set(m.clienteId, [m]);
  }
  const saldos = new Map<string, number>();
  for (const [clienteId, lista] of agrupados) saldos.set(clienteId, calcularSaldo(lista));
  return saldos;
}

const tiempo = (m: Pick<MovimientoFiado, 'fecha'>): number =>
  // Pendiente de serverTimestamp ⇒ es lo más reciente.
  m.fecha ? m.fecha.getTime() : Number.MAX_SAFE_INTEGER;

/** Orden cronológico ascendente (como la web), estable por id para empates. */
export const ordenarCronologico = <T extends Pick<MovimientoFiado, 'fecha' | 'id'>>(
  movimientos: readonly T[],
): T[] => [...movimientos].sort((a, b) => tiempo(a) - tiempo(b) || a.id.localeCompare(b.id));

export type EstadoCargo = 'pendiente' | 'parcial' | 'cubierto' | 'pagado';

export interface CargoConEstado {
  movimiento: MovimientoFiado;
  estado: EstadoCargo;
  /** Soles aún por cobrar de este cargo. */
  pendiente: number;
}

/**
 * Estado de cada cargo imputando los abonos por orden de antigüedad (FIFO), sin escribir
 * nada en Firestore (D-14). Los cargos con `pagado: true` heredados de la web se respetan
 * y no consumen abonos.
 */
export function estadoDeCargos(movimientos: readonly MovimientoFiado[]): CargoConEstado[] {
  const ordenados = ordenarCronologico(movimientos);
  let disponible = ordenados.filter(esAbono).reduce((acc, m) => acc - aCentimos(m.monto), 0);

  return ordenados.filter(esCargo).map((cargo) => {
    if (cargo.pagado === true)
      return { movimiento: cargo, estado: 'pagado' as const, pendiente: 0 };
    const montoC = aCentimos(cargo.monto);
    const imputado = Math.min(disponible, montoC);
    disponible -= imputado;
    const pendienteC = montoC - imputado;
    const estado: EstadoCargo =
      pendienteC === 0 ? 'cubierto' : imputado > 0 ? 'parcial' : 'pendiente';
    return { movimiento: cargo, estado, pendiente: aSoles(pendienteC) };
  });
}

/** RN-09 mejorada: cargo pendiente más antiguo, con el monto que realmente falta. */
export function cargoMasAntiguoPendiente(
  movimientos: readonly MovimientoFiado[],
): CargoConEstado | undefined {
  return estadoDeCargos(movimientos).find((c) => c.pendiente > 0);
}

/** Cargos con saldo pendiente cuya antigüedad supera `dias` (S-03). */
export function cargosVencidos(
  movimientos: readonly MovimientoFiado[],
  ahora: Date,
  dias: number,
): CargoConEstado[] {
  const limite = ahora.getTime() - dias * 24 * 60 * 60 * 1000;
  return estadoDeCargos(movimientos).filter(
    (c) => c.pendiente > 0 && c.movimiento.fecha !== null && c.movimiento.fecha.getTime() < limite,
  );
}

/** Documento `deudas/{id}` de un cargo manual (sin `fecha`). */
export interface CargoNuevo {
  clienteId: string;
  monto: number;
  descripcion: string;
  pagado: false;
}

/** Documento `deudas/{id}` de un abono (sin `fecha`). Mismo formato que la web. */
export interface AbonoNuevo {
  clienteId: string;
  monto: number;
  descripcion: string;
  pagado: false;
  metodoPago: MetodoPagoAbono;
  deudaOrigenId?: string;
}

export function armarCargo(clienteId: string, monto: number, descripcion: string): CargoNuevo {
  const desc = descripcion.trim();
  if (!Number.isFinite(monto) || aCentimos(monto) <= 0) throw new ErrorDominio('MONTO_INVALIDO');
  if (!desc) throw new ErrorDominio('DESCRIPCION_VACIA');
  return { clienteId, monto: aSoles(aCentimos(monto)), descripcion: desc, pagado: false };
}

/**
 * Abono: monto negativo (`-Math.abs`) como en la web. NO marca el cargo origen como
 * pagado (corrige B-01: la web descontaba el pago dos veces del saldo).
 */
export function armarAbono(
  clienteId: string,
  monto: number,
  descripcion: string,
  metodoPago: MetodoPagoAbono,
  deudaOrigenId?: string,
): AbonoNuevo {
  const desc = descripcion.trim();
  if (!Number.isFinite(monto) || aCentimos(Math.abs(monto)) <= 0) {
    throw new ErrorDominio('MONTO_INVALIDO');
  }
  if (!desc) throw new ErrorDominio('DESCRIPCION_VACIA');
  if (!METODOS_PAGO_ABONO.includes(metodoPago)) throw new ErrorDominio('METODO_PAGO_INVALIDO');
  return {
    clienteId,
    monto: -aSoles(aCentimos(Math.abs(monto))),
    descripcion: desc,
    pagado: false,
    metodoPago,
    ...(deudaOrigenId ? { deudaOrigenId } : {}),
  };
}

/**
 * "Liquidar" un cargo (reemplaza el botón "Pagar" de la web, B-02): registra un abono
 * por lo que falta, para que el ingreso aparezca en los reportes.
 */
export function armarLiquidacion(
  movimientos: readonly MovimientoFiado[],
  cargoId: string,
  metodoPago: MetodoPagoAbono,
): AbonoNuevo {
  const cargo = estadoDeCargos(movimientos).find((c) => c.movimiento.id === cargoId);
  if (!cargo || cargo.pendiente <= 0) throw new ErrorDominio('SIN_DEUDA_PENDIENTE');
  return armarAbono(
    cargo.movimiento.clienteId,
    cargo.pendiente,
    `Pago de: ${cargo.movimiento.descripcion}`,
    metodoPago,
    cargo.movimiento.id,
  );
}

/**
 * Cargo o abono manual guardado en el outbox del teléfono (D-24). El id se genera en el
 * dispositivo para que el reintento sea idempotente (`deudas/{id}`).
 */
export type OperacionMovimiento =
  | { id: string; tipo: 'cargo'; datos: CargoNuevo; creadaEn: number }
  | { id: string; tipo: 'abono'; datos: AbonoNuevo; creadaEn: number };

/**
 * Movimientos que aún no llegan a Firestore: los del outbox de fiado y los cargos de las
 * ventas fiadas pendientes. Así el saldo del cliente es correcto también sin conexión.
 */
export function movimientosPendientes(
  movimientos: readonly OperacionMovimiento[],
  ventas: readonly OperacionVenta[],
): MovimientoFiado[] {
  const deVentas = ventas.flatMap((v) =>
    v.cargo && v.cargoId
      ? [
          {
            id: v.cargoId,
            ...v.cargo,
            fecha: new Date(v.creadaEn),
            creadaEn: new Date(v.creadaEn),
            pendiente: true,
          },
        ]
      : [],
  );
  const manuales = movimientos.map((m) => ({
    id: m.id,
    ...m.datos,
    fecha: new Date(m.creadaEn),
    creadaEn: new Date(m.creadaEn),
    pendiente: true,
  }));
  return [...deVentas, ...manuales];
}

/** Une lo confirmado con lo pendiente; si un id ya llegó al servidor, gana el del servidor. */
export function conPendientes(
  remotos: readonly MovimientoFiado[],
  pendientes: readonly MovimientoFiado[],
): MovimientoFiado[] {
  if (pendientes.length === 0) return [...remotos];
  const ids = new Set(remotos.map((m) => m.id));
  return [...remotos, ...pendientes.filter((p) => !ids.has(p.id))];
}
