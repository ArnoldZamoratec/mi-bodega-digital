import {
    showProductoModal,
    hideProductoModal,
    showClienteModal,
    hideClienteModal,
    hideClienteDetalleModal,
    toggleClienteFiadoSelect,
    setupTabs
} from './ui.js?v=4.0';

import {
    handleVentaFormSubmit,
    handleCartClick,
    filterAndRenderVentaRapida
} from './modules/pos.js?v=4.0';

import {
    handleProductoFormSubmit
} from './modules/inventory.js?v=4.0';

import {
    handleClienteFormSubmit,
    handleDeudaFormSubmit,
    handlePagoFormSubmit,
    handleHistorialClick,
    getCurrentClienteData
} from './modules/clients.js?v=4.0';

import {
    handleReporteDateChange,
    handleReporteRefreshClick
} from './modules/reports.js?v=4.0';

export function setupEventListeners() {
    // Navegación de Pestañas
    setupTabs();

    // --- Pestaña Vender (POS) ---
    const searchBar = document.getElementById('search-bar');
    if (searchBar) {
        searchBar.addEventListener('input', filterAndRenderVentaRapida);
    }

    document.getElementById('cart-items').addEventListener('mousedown', handleCartClick);
    document.getElementById('venta-form').addEventListener('submit', handleVentaFormSubmit);
    document.getElementById('venta-metodo-pago').addEventListener('change', toggleClienteFiadoSelect);

    // --- Pestaña Inventario (Modal Producto) ---
    document.getElementById('show-producto-form-btn').addEventListener('click', () => showProductoModal(null));
    document.getElementById('close-producto-modal-btn').addEventListener('click', hideProductoModal);
    document.getElementById('producto-form').addEventListener('submit', handleProductoFormSubmit);

    // --- Pestaña Fiado (Modal Cliente) ---
    document.getElementById('show-cliente-form-btn').addEventListener('click', () => showClienteModal(null));
    document.getElementById('close-cliente-modal-btn').addEventListener('click', hideClienteModal);
    document.getElementById('cliente-form').addEventListener('submit', handleClienteFormSubmit);

    // --- Modal Detalle Cliente ---
    document.getElementById('close-cliente-detalle-modal-btn').addEventListener('click', hideClienteDetalleModal);
    document.getElementById('deuda-form').addEventListener('submit', handleDeudaFormSubmit);
    document.getElementById('pago-form').addEventListener('submit', handlePagoFormSubmit);
    document.getElementById('cliente-detalle-historial').addEventListener('click', handleHistorialClick);
    document.getElementById('edit-cliente-btn').addEventListener('click', () => {
        const cliente = getCurrentClienteData();
        if (cliente) {
            hideClienteDetalleModal();
            showClienteModal(cliente);
        }
    });

    // --- Pestaña Reportes ---
    const reporteFechaInicioInput = document.getElementById('reporte-fecha-inicio');
    const reporteFechaFinInput = document.getElementById('reporte-fecha-fin');
    const actualizarReporteBtn = document.getElementById('actualizar-reporte-btn');

    if (reporteFechaInicioInput && reporteFechaFinInput && actualizarReporteBtn) {
        const today = new Date();
        reporteFechaInicioInput.valueAsDate = today;
        reporteFechaFinInput.valueAsDate = today;

        reporteFechaInicioInput.addEventListener('change', handleReporteDateChange);
        reporteFechaFinInput.addEventListener('change', handleReporteDateChange);
        actualizarReporteBtn.addEventListener('click', handleReporteRefreshClick);
    }
}