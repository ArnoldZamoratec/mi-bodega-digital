import {
  calcularSaldo,
  cargoMasAntiguoPendiente,
  enlaceRecordatorioWhatsApp,
  estadoDeCargos,
  fechaEfectiva,
  formatearSoles,
  ordenarCronologico,
  subtotalCentimos,
  aSoles,
  totalCarrito,
  ZONA_NEGOCIO,
  type Cliente,
  type ItemCarrito,
  type MovimientoFiado,
  type Producto,
} from '@bodegon/core';
import {
  CategoryScale,
  Chart,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

import { getNombreBodega, setEditingClienteId, setEditingProductoId } from './store';

// Chart.js por npm: se registra solo lo que usa el gráfico de líneas (antes: bundle UMD completo).
Chart.register(
  LineController,
  LineElement,
  PointElement,
  LinearScale,
  CategoryScale,
  Filler,
  Tooltip,
  Legend,
);

let mySalesChart: Chart<'line'> | null = null;

// --- Seguridad: escapar texto de usuario antes de insertarlo con innerHTML (evita XSS) ---
const ENTIDADES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};
export function esc(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

/** Dinero: siempre con las reglas del core (céntimos, `S/ 1,234.50`), igual que la app móvil. */
export const soles = (n: unknown): string => formatearSoles(Number(n) || 0);

// --- Selectores de DOM (perezosos: el módulo se puede importar sin el HTML, p. ej. en pruebas) ---
const $ = <T extends HTMLElement = HTMLElement>(id: string): T | null =>
  document.getElementById(id) as T | null;

const inputValor = (id: string, valor: string): void => {
  const input = $<HTMLInputElement>(id);
  if (input) input.value = valor;
};

// --- Notificación Toast ---
export function showToast(message: string, isError = false): void {
  const toast = $('toast-notification');
  const toastMessage = $('toast-message');
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;

  toast.classList.remove('hidden', 'bg-green-500', 'bg-red-500', 'opacity-0');
  toast.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
  toast.classList.remove('hidden');

  setTimeout(() => {
    toast.classList.add('opacity-0');
    setTimeout(() => {
      toast.classList.add('hidden');
    }, 500);
  }, 3000);
}

// --- Lógica de Modales ---

export function showProductoModal(producto: Producto | null = null): void {
  $<HTMLFormElement>('producto-form')?.reset();
  setEditingProductoId(null);
  const titulo = $('producto-modal-title');

  if (producto) {
    if (titulo) titulo.textContent = 'Editar Producto';
    inputValor('producto-id', producto.id);
    inputValor('producto-nombre', producto.nombre);
    inputValor('producto-precio', String(producto.precio));
    inputValor('producto-stock', producto.stock === null ? '' : String(producto.stock));
    setEditingProductoId(producto.id);
  } else if (titulo) {
    titulo.textContent = 'Nuevo Producto';
  }
  $('producto-modal')?.classList.remove('hidden');
}
export const hideProductoModal = (): void => {
  $('producto-modal')?.classList.add('hidden');
};

export function showClienteModal(cliente: Cliente | null = null): void {
  $<HTMLFormElement>('cliente-form')?.reset();
  setEditingClienteId(null);
  const titulo = $('cliente-modal-title');

  if (cliente) {
    if (titulo) titulo.textContent = 'Editar Cliente';
    inputValor('cliente-id', cliente.id);
    inputValor('cliente-nombre', cliente.nombre);
    inputValor('cliente-telefono', cliente.telefono);
    setEditingClienteId(cliente.id);
  } else if (titulo) {
    titulo.textContent = 'Nuevo Cliente';
  }
  $('cliente-modal')?.classList.remove('hidden');
}
export const hideClienteModal = (): void => {
  $('cliente-modal')?.classList.add('hidden');
};

export function showClienteDetalleModalUI(cliente: Cliente): void {
  const nombre = $('cliente-detalle-nombre');
  if (nombre) nombre.textContent = cliente.nombre;
  inputValor('deuda-cliente-id', cliente.id);
  inputValor('pago-cliente-id', cliente.id);
  $('cliente-detalle-modal')?.classList.remove('hidden');
}
export const hideClienteDetalleModal = (): void => {
  $('cliente-detalle-modal')?.classList.add('hidden');
  resetDeudaForm();
  resetPagoForm();
};
export const isClienteDetalleVisible = (): boolean =>
  !!$('cliente-detalle-modal') && !$('cliente-detalle-modal')!.classList.contains('hidden');

// --- Lógica de Renderizado ---

const stockTexto = (p: Pick<Producto, 'stock'>): string | number =>
  p.stock !== null && p.stock !== undefined ? p.stock : 'N/A';
const stockColor = (p: Pick<Producto, 'stock'>): string =>
  p.stock !== null && p.stock !== undefined && p.stock <= 0 ? 'text-red-500' : 'text-gray-500';

export function renderVentaRapida(
  productos: readonly Producto[],
  onAddToCart: (p: Producto) => void,
): void {
  const lista = $('lista-venta-rapida');
  if (!lista) return;

  if (productos.length === 0) {
    lista.innerHTML = '<p class="text-gray-500 text-sm">No se encontraron productos.</p>';
    return;
  }

  lista.innerHTML = '';
  productos.forEach((producto) => {
    const itemEl = document.createElement('div');
    itemEl.className =
      'p-2 bg-white rounded-md shadow-sm flex justify-between items-center cursor-pointer hover:bg-gray-100';
    itemEl.innerHTML = `
            <div>
                <p class="font-medium">${esc(producto.nombre)}</p>
                <p class="text-sm text-blue-600 font-semibold">${esc(soles(producto.precio))}</p>
            </div>
            <div class="text-right">
                <p class="text-xs ${stockColor(producto)}">Stock: ${esc(stockTexto(producto))}</p>
                <button class="add-to-cart-btn bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold">+</button>
            </div>
        `;
    itemEl
      .querySelector('.add-to-cart-btn')
      ?.addEventListener('click', () => onAddToCart(producto));
    lista.appendChild(itemEl);
  });
}

export function renderCart(cart: readonly ItemCarrito[]): void {
  const cartItems = $('cart-items');
  if (!cartItems) return;
  if (cart.length === 0) {
    cartItems.innerHTML = '<p class="text-gray-500 text-center">El carrito está vacío.</p>';
  } else {
    cartItems.innerHTML = '';
    cart.forEach((item) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'flex justify-between items-center mb-2 p-2 bg-gray-50 rounded';
      itemEl.innerHTML = `
                <div>
                    <p class="font-medium">${esc(item.nombre)}</p>
                    <p class="text-sm text-gray-600">${esc(soles(item.precio))} x ${esc(item.cantidad)}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold">${esc(soles(aSoles(subtotalCentimos(item.precio, item.cantidad))))}</span>
                    <button data-id="${esc(item.id)}" class="remove-from-cart-btn bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center font-bold">-</button>
                </div>
            `;
      cartItems.appendChild(itemEl);
    });
  }
  const cartTotal = $('cart-total');
  if (cartTotal) cartTotal.textContent = soles(totalCarrito(cart));
}

export function renderProductos(
  productos: readonly Producto[],
  onEdit: (p: Producto) => void,
  onDelete: (id: string, nombre: string) => void,
): void {
  const lista = $('lista-productos');
  if (!lista) return;

  if (productos.length === 0) {
    lista.innerHTML = '<p class="text-gray-500 text-center">No hay productos registrados.</p>';
    return;
  }

  lista.innerHTML = '';
  productos.forEach((producto) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'p-4 bg-white rounded-lg shadow-sm flex justify-between items-center';

    // RN-01: stock bajo (≤ 5) resaltado.
    if (producto.stock !== null && producto.stock <= 5) {
      itemEl.classList.add('bg-yellow-50', 'border', 'border-yellow-300');
    }

    itemEl.innerHTML = `
            <div>
                <p class="font-semibold text-lg">${esc(producto.nombre)}</p>
                <p class="text-blue-600 font-bold">${esc(soles(producto.precio))}</p>
                <p class="text-sm ${stockColor(producto)}">Stock: ${esc(stockTexto(producto))} Uds.</p>
            </div>
            <div class="flex gap-2">
                <button class="edit-producto-btn p-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200">Editar</button>
                <button class="delete-producto-btn p-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200">X</button>
            </div>
        `;

    itemEl.querySelector('.edit-producto-btn')?.addEventListener('click', () => onEdit(producto));
    itemEl
      .querySelector('.delete-producto-btn')
      ?.addEventListener('click', () => onDelete(producto.id, producto.nombre));
    lista.appendChild(itemEl);
  });
}

export type ClienteConSaldo = Cliente & { saldoTotal: number };

const colorSaldo = (saldo: number): string =>
  saldo > 0 ? 'text-red-500' : saldo < 0 ? 'text-green-600' : 'text-gray-500';

export function renderClientesFiado(
  clientes: readonly ClienteConSaldo[],
  onShowDetails: (id: string) => void,
): void {
  const lista = $('lista-clientes-fiado');
  if (!lista) return;

  if (clientes.length === 0) {
    lista.innerHTML = '<p class="text-gray-500 text-center">No hay clientes registrados.</p>';
    return;
  }

  lista.innerHTML = '';
  clientes.forEach((cliente) => {
    const clienteEl = document.createElement('div');
    clienteEl.className = 'p-4 bg-white rounded-lg shadow cursor-pointer hover:bg-gray-50';

    const saldo = cliente.saldoTotal || 0;

    clienteEl.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-semibold text-lg">${esc(cliente.nombre)}</p>
                    <p class="text-sm text-gray-500">${esc(cliente.telefono || 'Sin teléfono')}</p>
                </div>
                <span id="deuda-total-${esc(cliente.id)}" class="text-lg font-bold ${colorSaldo(saldo)}">
                    ${esc(soles(saldo))}
                </span>
            </div>
        `;
    clienteEl.onclick = () => onShowDetails(cliente.id);
    lista.appendChild(clienteEl);
  });
}

export function renderClientesParaVenta(clientes: readonly Cliente[]): void {
  const select = $<HTMLSelectElement>('venta-cliente-fiado');
  if (!select) return;

  const seleccionado = select.value;
  select.innerHTML = '<option value="">Seleccione un cliente...</option>';
  clientes.forEach((cliente) => {
    const option = document.createElement('option');
    option.value = cliente.id;
    option.textContent = cliente.nombre;
    select.appendChild(option);
  });
  // Un cambio en otro cliente no debe borrar la selección en curso del POS.
  if (seleccionado && clientes.some((c) => c.id === seleccionado)) select.value = seleccionado;
}

const formatoFechaCorta = new Intl.DateTimeFormat('es-PE', {
  day: '2-digit',
  month: '2-digit',
  timeZone: ZONA_NEGOCIO,
});

/**
 * Historial del cliente (orden cronológico) con el estado de cada cargo calculado por el core
 * (FIFO de abonos, D-14): un cargo ya cubierto por abonos no ofrece "Pagar" (antes se podía
 * cobrar dos veces), y "Pagar" en un cargo parcial cobra solo lo que falta.
 */
export function renderHistorialCliente(cliente: Cliente, movimientos: readonly MovimientoFiado[]): void {
  const lista = $('cliente-detalle-historial');
  if (!lista) return;
  lista.innerHTML = '';

  const estados = new Map(estadoDeCargos(movimientos).map((c) => [c.movimiento.id, c]));
  const saldoTotal = calcularSaldo(movimientos);

  ordenarCronologico(movimientos).forEach((deuda) => {
    const itemEl = document.createElement('div');
    const f = fechaEfectiva(deuda);
    const fecha = f ? formatoFechaCorta.format(f) : '...';
    const esDeuda = deuda.monto > 0;
    const estado = esDeuda ? estados.get(deuda.id) : undefined;
    const estaPagada = estado?.estado === 'pagado' || estado?.estado === 'cubierto';

    let montoDisplay = '';
    let descripcionDisplay = deuda.descripcion;
    let clasesMonto = '';
    let accionesBtn = '';

    if (esDeuda) {
      montoDisplay = `+ ${soles(deuda.monto)}`;
      clasesMonto = 'text-red-600 font-semibold';

      if (!estaPagada) {
        accionesBtn = `<button data-id="${esc(deuda.id)}" class="marcar-pagado-btn p-1 bg-green-100 text-green-700 rounded-md text-xs hover:bg-green-200">Pagar</button>`;
        if (estado?.estado === 'parcial') {
          descripcionDisplay = `${deuda.descripcion} (falta ${soles(estado.pendiente)})`;
        }
      } else {
        const etiqueta = estado?.estado === 'cubierto' ? 'Cubierto' : 'Pagado';
        descripcionDisplay = `(${etiqueta}) ${deuda.descripcion}`;
        clasesMonto = 'text-gray-400 line-through';
      }
    } else {
      montoDisplay = `- ${soles(Math.abs(deuda.monto))}`;
      clasesMonto = 'text-green-600 font-semibold';
      descripcionDisplay = `${deuda.descripcion} (${deuda.metodoPago || 'Efectivo'})`;
    }

    accionesBtn += `<button data-id="${esc(deuda.id)}" class="eliminar-deuda-btn p-1 bg-gray-100 text-gray-500 rounded-md text-xs hover:bg-gray-200">X</button>`;

    itemEl.className = `p-2 rounded-md bg-white shadow-sm flex justify-between items-center ${estaPagada ? 'opacity-60' : ''}`;
    itemEl.innerHTML = `
            <div>
                <p class="font-medium ${estaPagada ? 'line-through' : ''}">${esc(descripcionDisplay)}</p>
                <p class="text-xs text-gray-500">${esc(fecha)}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="${clasesMonto} text-sm">${esc(montoDisplay)}</span>
                <div class="flex flex-col gap-1">
                    ${accionesBtn}
                </div>
            </div>
        `;

    // Los clics de "Pagar" y "X" se manejan por delegación (handleHistorialClick),
    // que pide confirmación antes de borrar.
    lista.appendChild(itemEl);
  });

  const saldoEl = $('cliente-detalle-saldo');
  if (saldoEl) {
    saldoEl.textContent = soles(saldoTotal);
    saldoEl.classList.toggle('text-red-900', saldoTotal > 0);
    saldoEl.classList.toggle('text-blue-900', saldoTotal <= 0);
  }

  renderRecordatorioWhatsApp(cliente, saldoTotal);
  preLlenarPagoUI(movimientos);
}

/** Botón "Recordar por WhatsApp": solo si el cliente debe y tiene un celular válido. */
export function renderRecordatorioWhatsApp(cliente: Cliente, saldo: number): void {
  const btn = $<HTMLAnchorElement>('recordar-whatsapp-btn');
  if (!btn) return;
  const enlace =
    saldo > 0
      ? enlaceRecordatorioWhatsApp(cliente.telefono, {
          nombreCliente: cliente.nombre,
          saldo,
          nombreBodega: getNombreBodega(),
        })
      : null;
  if (enlace) {
    btn.href = enlace;
    btn.classList.remove('hidden');
  } else {
    btn.href = '#';
    btn.classList.add('hidden');
  }
}

export interface TotalesReporte {
  totalGeneral: number;
  totalEfectivo: number;
  totalYape: number;
  totalFiado: number;
  top5Products: [string, number][];
  chartLabels: string[];
  chartData: number[];
}

export function updateReporteUI(totales: TotalesReporte): void {
  const poner = (id: string, monto: number) => {
    const el = $(id);
    if (el) el.textContent = soles(monto);
  };
  poner('reporte-total-general', totales.totalGeneral);
  poner('reporte-total-efectivo', totales.totalEfectivo);
  poner('reporte-total-yape', totales.totalYape);
  poner('reporte-total-fiado', totales.totalFiado);

  const topProductsList = $('top-products-list');
  if (topProductsList) {
    topProductsList.innerHTML = '';
    if (totales.top5Products.length === 0) {
      topProductsList.innerHTML =
        '<p class="text-gray-500">No hay datos de productos para este periodo.</p>';
    } else {
      totales.top5Products.forEach(([nombre, cantidad], index) => {
        const itemEl = document.createElement('div');
        itemEl.className = 'flex justify-between items-center p-2 rounded';
        itemEl.classList.add(index % 2 === 0 ? 'bg-gray-50' : 'bg-white');
        itemEl.innerHTML = `
                    <p class="font-medium text-gray-800">${index + 1}. ${esc(nombre)}</p>
                    <p class="font-bold text-blue-600">${esc(cantidad)} Uds.</p>
                `;
        topProductsList.appendChild(itemEl);
      });
    }
  }

  const canvas = $<HTMLCanvasElement>('salesChart');
  const ctx = canvas?.getContext('2d');
  if (!ctx) return;

  mySalesChart?.destroy();

  mySalesChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: totales.chartLabels,
      datasets: [
        {
          label: 'Ingresos Totales (Efectivo + Yape/Plin)',
          data: totales.chartData,
          backgroundColor: 'rgba(59, 130, 246, 0.2)',
          borderColor: 'rgba(59, 130, 246, 1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => soles(Number(value)) },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => {
              let label = context.dataset.label || '';
              if (label) label += ': ';
              if (context.parsed.y !== null) label += soles(context.parsed.y);
              return label;
            },
          },
        },
      },
    },
  });
}

/** Al cerrar sesión: el gráfico del usuario anterior no debe quedar en memoria. */
export function destroySalesChart(): void {
  mySalesChart?.destroy();
  mySalesChart = null;
}

// --- Funciones de Ayuda de UI ---

export function toggleClienteFiadoSelect(): void {
  const metodoPagoEl = $<HTMLSelectElement>('venta-metodo-pago');
  if (!metodoPagoEl) return;

  const clienteSelect = $<HTMLSelectElement>('venta-cliente-fiado');
  const contenedor = $('venta-cliente-fiado-container');

  if (metodoPagoEl.value === 'Fiado') {
    contenedor?.classList.remove('hidden');
    if (clienteSelect) clienteSelect.required = true;
  } else {
    contenedor?.classList.add('hidden');
    if (clienteSelect) clienteSelect.required = false;
  }
}

export function resetVentaForm(): void {
  $<HTMLFormElement>('venta-form')?.reset();
  toggleClienteFiadoSelect();
}

export function resetDeudaForm(): void {
  $<HTMLFormElement>('deuda-form')?.reset();
}

export function resetPagoForm(): void {
  $<HTMLFormElement>('pago-form')?.reset();
  inputValor('pago-deuda-origen-id', '');
}

/** RN-09 (core): pre-llena el pago con lo que FALTA del cargo pendiente más antiguo. */
function preLlenarPagoUI(movimientos: readonly MovimientoFiado[]): void {
  const montoInput = $<HTMLInputElement>('pago-monto');
  const descInput = $<HTMLInputElement>('pago-descripcion');
  const origenInput = $<HTMLInputElement>('pago-deuda-origen-id');

  if (!montoInput || !descInput || !origenInput) return;
  if (montoInput.value) return;

  const pendiente = cargoMasAntiguoPendiente(movimientos);
  if (pendiente) {
    montoInput.value = pendiente.pendiente.toFixed(2);
    descInput.value = `Pago de: ${pendiente.movimiento.descripcion}`;
    origenInput.value = pendiente.movimiento.id;
  } else {
    montoInput.value = '';
    descInput.value = '';
    origenInput.value = '';
  }
}

export function setupTabs(onTabReportes?: () => void): void {
  const navTabs = document.querySelectorAll<HTMLElement>('.nav-tab');
  navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab-content').forEach((content) => {
        content.classList.add('hidden');
      });
      navTabs.forEach((t) => {
        t.classList.remove('text-blue-600', 'bg-blue-50');
        t.classList.add('text-gray-500');
      });

      const tabId = tab.dataset.tab;
      if (tabId) $(tabId)?.classList.remove('hidden');

      tab.classList.add('text-blue-600', 'bg-blue-50');
      tab.classList.remove('text-gray-500');

      // El reporte se carga al abrir su pestaña (handlers.ts pasa loadReporteDelDia; así ui.ts
      // no importa reports.ts y no hay ciclo de módulos).
      if (tabId === 'tab-reportes') onTabReportes?.();
    });
  });
}
