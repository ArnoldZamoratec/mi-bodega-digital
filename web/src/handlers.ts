import { hoyLima } from '@bodegon/core';

import {
  getCurrentClienteData,
  handleClienteFormSubmit,
  handleDeudaFormSubmit,
  handleHistorialClick,
  handlePagoFormSubmit,
} from './modules/clients';
import { handleProductoFormSubmit } from './modules/inventory';
import { filterAndRenderVentaRapida, handleCartClick, handleVentaFormSubmit } from './modules/pos';
import {
  handleReporteDateChange,
  handleReporteRefreshClick,
  loadReporteDelDia,
} from './modules/reports';
import {
  hideClienteDetalleModal,
  hideClienteModal,
  hideProductoModal,
  setupTabs,
  showClienteModal,
  showProductoModal,
  toggleClienteFiadoSelect,
} from './ui';

const on = (id: string, evento: string, fn: (e: Event) => unknown): void => {
  document.getElementById(id)?.addEventListener(evento, fn as EventListener);
};

export function setupEventListeners(): void {
  // Navegación de Pestañas
  setupTabs(loadReporteDelDia);

  // --- Pestaña Vender (POS) ---
  on('search-bar', 'input', filterAndRenderVentaRapida);
  on('cart-items', 'click', handleCartClick);
  on('venta-form', 'submit', (e) => handleVentaFormSubmit(e as SubmitEvent));
  on('venta-metodo-pago', 'change', toggleClienteFiadoSelect);

  // --- Pestaña Inventario (Modal Producto) ---
  on('show-producto-form-btn', 'click', () => showProductoModal(null));
  on('close-producto-modal-btn', 'click', hideProductoModal);
  on('producto-form', 'submit', handleProductoFormSubmit);

  // --- Pestaña Fiado (Modal Cliente) ---
  on('show-cliente-form-btn', 'click', () => showClienteModal(null));
  on('close-cliente-modal-btn', 'click', hideClienteModal);
  on('cliente-form', 'submit', handleClienteFormSubmit);

  // --- Modal Detalle Cliente ---
  on('close-cliente-detalle-modal-btn', 'click', hideClienteDetalleModal);
  on('deuda-form', 'submit', handleDeudaFormSubmit);
  on('pago-form', 'submit', handlePagoFormSubmit);
  on('cliente-detalle-historial', 'click', handleHistorialClick);
  on('edit-cliente-btn', 'click', () => {
    const cliente = getCurrentClienteData();
    if (cliente) {
      hideClienteDetalleModal();
      showClienteModal(cliente);
    }
  });
  // "Recordar por WhatsApp" es un <a href="https://wa.me/..."> que arma ui.ts con el core.

  // --- Pestaña Reportes ---
  const inicio = document.getElementById('reporte-fecha-inicio') as HTMLInputElement | null;
  const fin = document.getElementById('reporte-fecha-fin') as HTMLInputElement | null;
  if (inicio && fin) {
    // Hoy en hora de Perú (valueAsDate usa UTC y después de las 19:00 marcaba "mañana").
    const hoy = hoyLima();
    inicio.value = hoy;
    fin.value = hoy;
    inicio.addEventListener('change', handleReporteDateChange);
    fin.addEventListener('change', handleReporteDateChange);
    on('actualizar-reporte-btn', 'click', handleReporteRefreshClick);
  }
}
