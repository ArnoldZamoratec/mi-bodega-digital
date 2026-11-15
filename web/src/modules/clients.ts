import {
  armarAbono,
  armarCargo,
  armarLiquidacion,
  ErrorDominio,
  parsearSoles,
  saldosPorCliente,
  type Cliente,
  type MetodoPagoAbono,
  type MovimientoFiado,
} from '@bodegon/core';
import {
  addDoc,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';

import { registrarListener } from '../listeners';
import { aCliente, aMovimiento, porNombre } from '../mappers';
import {
  getClientesCol,
  getConfigNegocioDoc,
  getDeudasCol,
  getEditingClienteId,
  setEditingClienteId,
  setNombreBodega,
} from '../store';
import {
  hideClienteModal,
  isClienteDetalleVisible,
  renderClientesFiado,
  renderClientesParaVenta,
  renderHistorialCliente,
  resetDeudaForm,
  resetPagoForm,
  showClienteDetalleModalUI,
  showToast,
  type ClienteConSaldo,
} from '../ui';

// Un listener para clientes y UNO para todo el libro de fiado (B-05: antes se abría un
// onSnapshot de deudas por cliente en cada cambio y nunca se cerraban).
let clientes: Cliente[] = [];
let movimientos: MovimientoFiado[] = [];
let currentClienteId: string | null = null;

export const getCurrentClienteData = (): Cliente | null =>
  clientes.find((c) => c.id === currentClienteId) ?? null;

const movimientosDe = (clienteId: string): MovimientoFiado[] =>
  movimientos.filter((m) => m.clienteId === clienteId);

/** Clientes + saldo (fórmula del core, la misma que la app móvil), ordenados por nombre. */
export function clientesConSaldo(
  lista: readonly Cliente[],
  libro: readonly MovimientoFiado[],
): ClienteConSaldo[] {
  const saldos = saldosPorCliente(libro);
  return lista.map((c) => ({ ...c, saldoTotal: saldos.get(c.id) ?? 0 })).sort(porNombre);
}

function renderTodo(): void {
  renderClientesFiado(clientesConSaldo(clientes, movimientos), showClienteDetalleModal);
  renderClientesParaVenta(clientes);
  renderDetalleAbierto();
}

function renderDetalleAbierto(): void {
  const cliente = getCurrentClienteData();
  if (!cliente || !isClienteDetalleVisible()) return;
  renderHistorialCliente(cliente, movimientosDe(cliente.id));
}

/** Clientes (pestaña Fiado y selector del POS), libro de fiado y nombre de la bodega. */
export function loadClientes(): void {
  registrarListener(
    onSnapshot(
      query(getClientesCol()),
      (snapshot) => {
        clientes = snapshot.docs.map((d) => aCliente(d.id, d.data())).sort(porNombre);
        renderTodo();
      },
      (error) => {
        console.error('Error al cargar clientes: ', error);
        showToast('Error al cargar clientes', true);
      },
    ),
  );

  registrarListener(
    onSnapshot(
      query(getDeudasCol()),
      (snapshot) => {
        // 'estimate': un movimiento recién escrito ya tiene fecha (y su lugar en el historial).
        movimientos = snapshot.docs.map((d) =>
          aMovimiento(d.id, d.data({ serverTimestamps: 'estimate' })),
        );
        renderTodo();
      },
      (error) => {
        console.error('Error al cargar historial: ', error);
        showToast('Error al cargar historial', true);
      },
    ),
  );

  // config/negocio (lo crea la app móvil): solo para firmar el recordatorio de WhatsApp.
  registrarListener(
    onSnapshot(
      getConfigNegocioDoc(),
      (snap) => {
        const nombre = snap.exists() ? snap.data().nombre : null;
        setNombreBodega(typeof nombre === 'string' && nombre.trim() ? nombre : null);
        renderDetalleAbierto();
      },
      () => setNombreBodega(null), // Sin config: "tu bodega".
    ),
  );
}

/** Al cerrar sesión. */
export function resetClientes(): void {
  clientes = [];
  movimientos = [];
  currentClienteId = null;
}

/** Formulario de Añadir/Editar Cliente. */
export async function handleClienteFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const cliente = { nombre: valor('cliente-nombre'), telefono: valor('cliente-telefono') };
  const currentEditingClienteId = getEditingClienteId();

  try {
    if (currentEditingClienteId) {
      await updateDoc(doc(getClientesCol(), currentEditingClienteId), cliente);
    } else {
      await addDoc(getClientesCol(), cliente);
    }
    hideClienteModal();
    setEditingClienteId(null);
  } catch (error) {
    console.error('Error al guardar cliente: ', error);
    showToast('Error al guardar cliente', true);
  }
}

/** Muestra el modal de detalle del cliente con su historial (en vivo, del listener común). */
export function showClienteDetalleModal(clienteId: string): void {
  const cliente = clientes.find((c) => c.id === clienteId);
  if (!cliente) {
    showToast('No se encontró el cliente', true);
    return;
  }
  currentClienteId = clienteId;
  showClienteDetalleModalUI(cliente);
  renderHistorialCliente(cliente, movimientosDe(clienteId));
}

const metodoPagoSeleccionado = (): MetodoPagoAbono =>
  ((document.getElementById('pago-metodo') as HTMLSelectElement | null)?.value ||
    'Efectivo') as MetodoPagoAbono;

const mensaje = (error: unknown, porDefecto: string): string =>
  error instanceof ErrorDominio ? error.message : porDefecto;

/**
 * "Pagar" (B-02): registra un abono REAL por lo que falta del cargo (FIFO del core), así el
 * dinero entra al reporte de ingresos. No marca `pagado` (B-01).
 */
async function handleMarkAsPaid(id: string): Promise<void> {
  const cargo = movimientos.find((m) => m.id === id);
  if (!cargo) return;
  try {
    const abono = armarLiquidacion(movimientosDe(cargo.clienteId), id, metodoPagoSeleccionado());
    await addDoc(getDeudasCol(), { ...abono, fecha: serverTimestamp() });
  } catch (error) {
    console.error('Error al marcar como pagado:', error);
    showToast(mensaje(error, 'Error al actualizar deuda'), true);
  }
}

async function handleDeleteHistoryEntry(id: string): Promise<void> {
  try {
    await deleteDoc(doc(getDeudasCol(), id));
  } catch (error) {
    console.error('Error al eliminar registro:', error);
    showToast('Error al eliminar', true);
  }
}

export function handleHistorialClick(e: Event): void {
  const target = e.target as Element | null;
  const markPaidBtn = target?.closest<HTMLElement>('.marcar-pagado-btn');
  if (markPaidBtn?.dataset.id) {
    void handleMarkAsPaid(markPaidBtn.dataset.id);
    return;
  }

  const deleteBtn = target?.closest<HTMLElement>('.eliminar-deuda-btn');
  if (deleteBtn?.dataset.id) {
    if (confirm('¿Seguro que quieres eliminar este registro?')) {
      void handleDeleteHistoryEntry(deleteBtn.dataset.id);
    }
  }
}

const valorInput = (id: string): string =>
  (document.getElementById(id) as HTMLInputElement | null)?.value ?? '';

export async function handleDeudaFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const clienteId = valorInput('deuda-cliente-id');
  const monto = parsearSoles(valorInput('deuda-monto'));
  const descripcion = valorInput('deuda-descripcion');

  if (!monto || !descripcion || !clienteId) {
    showToast('Completa todos los campos de deuda', true);
    return;
  }

  try {
    // Core: monto > 0 en céntimos exactos, descripción no vacía.
    const cargo = armarCargo(clienteId, monto, descripcion);
    await addDoc(getDeudasCol(), { ...cargo, fecha: serverTimestamp() });
    resetDeudaForm();
  } catch (error) {
    console.error('Error al añadir deuda:', error);
    showToast(mensaje(error, 'Error al añadir deuda'), true);
  }
}

export async function handlePagoFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const clienteId = valorInput('pago-cliente-id');
  const monto = parsearSoles(valorInput('pago-monto'));
  const descripcion = valorInput('pago-descripcion');
  const deudaOrigenId = valorInput('pago-deuda-origen-id') || undefined;

  if (!monto || !descripcion || !clienteId) {
    showToast('Completa todos los campos de pago', true);
    return;
  }

  try {
    // Abono negativo (-|monto|). B-01: NO se marca el cargo origen como pagado; el abono
    // ya reduce el saldo (marcarlo pagado lo restaba dos veces). Mismo criterio que la móvil.
    const abono = armarAbono(clienteId, monto, descripcion, metodoPagoSeleccionado(), deudaOrigenId);
    await addDoc(getDeudasCol(), { ...abono, fecha: serverTimestamp() });
    resetPagoForm();
  } catch (error) {
    console.error('Error al registrar pago:', error);
    showToast(mensaje(error, 'Error al registrar pago'), true);
  }
}
