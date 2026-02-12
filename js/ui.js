import { 
    setEditingProductoId, 
    setEditingClienteId, 
    getDeudasPendientes 
} from './store.js?v=5.3'; // MODIFICADO

// --- INICIO MEJORA 2A: GRÁFICO ---
let mySalesChart = null;
// --- FIN MEJORA 2A ---

// --- Selectores de DOM Estáticos ---
const elements = {
    toast: document.getElementById('toast-notification'),
    toastMessage: document.getElementById('toast-message'),
    
    productoModal: document.getElementById('producto-modal'),
    productoForm: document.getElementById('producto-form'),
    productoModalTitle: document.getElementById('producto-modal-title'),
    
    clienteModal: document.getElementById('cliente-modal'),
    clienteForm: document.getElementById('cliente-form'),
    clienteModalTitle: document.getElementById('cliente-modal-title'),

    clienteDetalleModal: document.getElementById('cliente-detalle-modal'),
    clienteDetalleNombre: document.getElementById('cliente-detalle-nombre'),
    clienteDetalleSaldo: document.getElementById('cliente-detalle-saldo'),
    clienteDetalleHistorial: document.getElementById('cliente-detalle-historial'),
    deudaForm: document.getElementById('deuda-form'),
    pagoForm: document.getElementById('pago-form'),

    listaVentaRapida: document.getElementById('lista-venta-rapida'),
    cartItems: document.getElementById('cart-items'),
    cartTotal: document.getElementById('cart-total'),
    listaProductos: document.getElementById('lista-productos'),
    listaClientesFiado: document.getElementById('lista-clientes-fiado'),
    ventaClienteSelect: document.getElementById('venta-cliente-fiado'),
    ventaClienteContainer: document.getElementById('venta-cliente-fiado-container'),

    reporteTotalGeneral: document.getElementById('reporte-total-general'),
    reporteTotalEfectivo: document.getElementById('reporte-total-efectivo'),
    reporteTotalYape: document.getElementById('reporte-total-yape'),
    reporteTotalFiado: document.getElementById('reporte-total-fiado'),
    topProductsList: document.getElementById('top-products-list'),
    salesChartCanvas: document.getElementById('salesChart')
};

// --- Notificación Toast ---
export function showToast(message, isError = false) {
    elements.toastMessage.textContent = message;
    
    elements.toast.classList.remove('hidden', 'bg-green-500', 'bg-red-500', 'opacity-0');
    
    elements.toast.classList.add(isError ? 'bg-red-500' : 'bg-green-500');
    elements.toast.classList.remove('hidden');
    
    setTimeout(() => {
        elements.toast.classList.add('opacity-0');
        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 500);
    }, 3000);
}

// --- Lógica de Modales ---

export function showProductoModal(producto = null) {
    elements.productoForm.reset();
    setEditingProductoId(null);

    if (producto) {
        elements.productoModalTitle.textContent = "Editar Producto";
        document.getElementById('producto-id').value = producto.id;
        document.getElementById('producto-nombre').value = producto.nombre;
        document.getElementById('producto-precio').value = producto.precio;
        document.getElementById('producto-stock').value = producto.stock;
        setEditingProductoId(producto.id);
    } else {
        elements.productoModalTitle.textContent = "Nuevo Producto";
    }
    elements.productoModal.classList.remove('hidden');
}
export const hideProductoModal = () => elements.productoModal.classList.add('hidden');

export function showClienteModal(cliente = null) {
    elements.clienteForm.reset();
    setEditingClienteId(null);

    if (cliente) {
        elements.clienteModalTitle.textContent = "Editar Cliente";
        document.getElementById('cliente-id').value = cliente.id;
        document.getElementById('cliente-nombre').value = cliente.nombre;
        document.getElementById('cliente-telefono').value = cliente.telefono;
        setEditingClienteId(cliente.id);
    } else {
        elements.clienteModalTitle.textContent = "Nuevo Cliente";
    }
    elements.clienteModal.classList.remove('hidden');
}
export const hideClienteModal = () => elements.clienteModal.classList.add('hidden');

export function showClienteDetalleModalUI(cliente) {
    elements.clienteDetalleNombre.textContent = cliente.nombre;
    document.getElementById('deuda-cliente-id').value = cliente.id;
    document.getElementById('pago-cliente-id').value = cliente.id;
    elements.clienteDetalleModal.classList.remove('hidden');
}
export const hideClienteDetalleModal = () => {
    elements.clienteDetalleModal.classList.add('hidden');
    resetDeudaForm();
    resetPagoForm();
}

// --- Lógica de Renderizado ---

export function renderVentaRapida(productos, onAddToCart) {
    const lista = elements.listaVentaRapida;
    if (!lista) return; 

    if (productos.length === 0) {
        lista.innerHTML = '<p class="text-gray-500 text-sm">No se encontraron productos.</p>';
        return;
    }
    
    lista.innerHTML = '';
    productos.forEach(producto => {
        const stock = producto.stock !== null && producto.stock !== undefined ? producto.stock : 'N/A';
        const stockColor = stock <= 0 ? 'text-red-500' : 'text-gray-500';

        const itemEl = document.createElement('div');
        itemEl.className = 'p-2 bg-white rounded-md shadow-sm flex justify-between items-center cursor-pointer hover:bg-gray-100';
        itemEl.innerHTML = `
            <div>
                <p class="font-medium">${producto.nombre}</p>
                <p class="text-sm text-blue-600 font-semibold">S/ ${producto.precio.toFixed(2)}</p>
            </div>
            <div class="text-right">
                <p class="text-xs ${stockColor}">Stock: ${stock}</p>
                <button class="add-to-cart-btn bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold">+</button>
            </div>
        `;
        itemEl.querySelector('.add-to-cart-btn').addEventListener('click', () => onAddToCart(producto));
        lista.appendChild(itemEl);
    });
}

export function renderCart(cart, onRemoveFromCart) {
    if (!elements.cartItems) return;
    let total = 0;
    if (cart.length === 0) {
        elements.cartItems.innerHTML = '<p class="text-gray-500 text-center">El carrito está vacío.</p>';
    } else {
        elements.cartItems.innerHTML = '';
        cart.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.className = 'flex justify-between items-center mb-2 p-2 bg-gray-50 rounded';
            itemEl.innerHTML = `
                <div>
                    <p class="font-medium">${item.nombre}</p>
                    <p class="text-sm text-gray-600">S/ ${item.precio.toFixed(2)} x ${item.cantidad}</p>
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-bold">S/ ${(item.precio * item.cantidad).toFixed(2)}</span>
                    <button data-id="${item.id}" class="remove-from-cart-btn bg-red-100 text-red-600 rounded-full w-6 h-6 flex items-center justify-center font-bold">-</button>
                </div>
            `;
            itemEl.querySelector('.remove-from-cart-btn').addEventListener('click', () => onRemoveFromCart(item.id));
            elements.cartItems.appendChild(itemEl);
            total += item.precio * item.cantidad;
        });
    }
    elements.cartTotal.textContent = `S/ ${total.toFixed(2)}`;
}

export function renderProductos(productos, onEdit, onDelete) {
    const lista = elements.listaProductos;
    if (!lista) return;

    if (productos.length === 0) {
        lista.innerHTML = '<p class="text-gray-500 text-center">No hay productos registrados.</p>';
        return;
    }
    
    lista.innerHTML = '';
    productos.forEach(producto => {
        const stock = producto.stock !== null && producto.stock !== undefined ? producto.stock : 'N/A';
        const stockColor = stock <= 0 ? 'text-red-500' : 'text-gray-500';

        const itemEl = document.createElement('div');
        itemEl.className = 'p-4 bg-white rounded-lg shadow-sm flex justify-between items-center';

        if (producto.stock !== null && producto.stock !== undefined && producto.stock <= 5) {
            itemEl.classList.add('bg-yellow-50', 'border', 'border-yellow-300');
        }

        itemEl.innerHTML = `
            <div>
                <p class="font-semibold text-lg">${producto.nombre}</p>
                <p class="text-blue-600 font-bold">S/ ${producto.precio.toFixed(2)}</p>
                <p class="text-sm ${stockColor}">Stock: ${stock} Uds.</p>
            </div>
            <div class="flex gap-2">
                <button class="edit-producto-btn p-2 bg-yellow-100 text-yellow-700 rounded-md hover:bg-yellow-200">Editar</button>
                <button class="delete-producto-btn p-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200">X</button>
            </div>
        `;
        
        itemEl.querySelector('.edit-producto-btn').addEventListener('click', () => onEdit(producto));
        itemEl.querySelector('.delete-producto-btn').addEventListener('click', () => onDelete(producto.id, producto.nombre));
        lista.appendChild(itemEl);
    });
}

export function renderClientesFiado(clientes, onShowDetails) {
    const lista = elements.listaClientesFiado;
    if (!lista) return;

    if (clientes.length === 0) {
        lista.innerHTML = '<p class="text-gray-500 text-center">No hay clientes registrados.</p>';
        return;
    }
    
    lista.innerHTML = '';
    clientes.forEach(cliente => {
        const clienteEl = document.createElement('div');
        clienteEl.className = 'p-4 bg-white rounded-lg shadow cursor-pointer hover:bg-gray-50';
        
        const saldo = cliente.saldoTotal || 0;
        const saldoColor = saldo > 0 ? 'text-red-500' : (saldo < 0 ? 'text-green-600' : 'text-gray-500');

        clienteEl.innerHTML = `
            <div class="flex justify-between items-center">
                <div>
                    <p class="font-semibold text-lg">${cliente.nombre}</p>
                    <p class="text-sm text-gray-500">${cliente.telefono || 'Sin teléfono'}</p>
                </div>
                <span id="deuda-total-${cliente.id}" class="text-lg font-bold ${saldoColor}">
                    S/ ${saldo.toFixed(2)}
                </span>
            </div>
        `;
        clienteEl.onclick = () => onShowDetails(cliente.id);
        lista.appendChild(clienteEl);
    });
}

export function renderClientesParaVenta(clientes) {
    const select = elements.ventaClienteSelect;
    if (!select) return;

    select.innerHTML = '<option value="">Seleccione un cliente...</option>';
    clientes.forEach(cliente => {
        const option = document.createElement('option');
        option.value = cliente.id;
        option.textContent = cliente.nombre;
        select.appendChild(option);
    });
}

export function renderHistorialCliente(historial, saldoTotal, onMarkPaid, onDeleteEntry) {
    const lista = elements.clienteDetalleHistorial;
    if (!lista) return;
    lista.innerHTML = '';
    
    historial.forEach(deuda => {
        const itemEl = document.createElement('div');
        const fecha = deuda.fecha ? deuda.fecha.toDate().toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : '...';
        const esDeuda = deuda.monto > 0;
        const estaPagada = deuda.pagado === true;

        let montoDisplay = '';
        let descripcionDisplay = deuda.descripcion;
        let clasesMonto = '';
        let accionesBtn = '';

        if (esDeuda) {
            montoDisplay = `+ S/ ${deuda.monto.toFixed(2)}`;
            clasesMonto = 'text-red-600 font-semibold';
            
            if (!estaPagada) {
                accionesBtn = `<button data-id="${deuda.id}" class="marcar-pagado-btn p-1 bg-green-100 text-green-700 rounded-md text-xs hover:bg-green-200">Pagar</button>`;
            } else {
                descripcionDisplay = `(Pagado) ${deuda.descripcion}`;
                clasesMonto = 'text-gray-400 line-through';
            }
        } else {
            montoDisplay = `- S/ ${Math.abs(deuda.monto).toFixed(2)}`;
            clasesMonto = 'text-green-600 font-semibold';
            descripcionDisplay = `${deuda.descripcion} (${deuda.metodoPago || 'Efectivo'})`;
        }

        accionesBtn += `<button data-id="${deuda.id}" class="eliminar-deuda-btn p-1 bg-gray-100 text-gray-500 rounded-md text-xs hover:bg-gray-200">X</button>`;

        itemEl.className = `p-2 rounded-md bg-white shadow-sm flex justify-between items-center ${estaPagada ? 'opacity-60' : ''}`;
        itemEl.innerHTML = `
            <div>
                <p class="font-medium ${estaPagada ? 'line-through' : ''}">${descripcionDisplay}</p>
                <p class="text-xs text-gray-500">${fecha}</p>
            </div>
            <div class="flex items-center gap-2">
                <span class="${clasesMonto} text-sm">${montoDisplay}</span>
                <div class="flex flex-col gap-1">
                    ${accionesBtn}
                </div>
            </div>
        `;
        
        const markPaidBtn = itemEl.querySelector('.marcar-pagado-btn');
        if (markPaidBtn) {
            markPaidBtn.addEventListener('click', () => onMarkPaid(deuda.id));
        }
        itemEl.querySelector('.eliminar-deuda-btn').addEventListener('click', () => onDeleteEntry(deuda.id));

        lista.appendChild(itemEl);
    });

    elements.clienteDetalleSaldo.textContent = `S/ ${saldoTotal.toFixed(2)}`;
    elements.clienteDetalleSaldo.classList.toggle('text-red-900', saldoTotal > 0);
    elements.clienteDetalleSaldo.classList.toggle('text-blue-900', saldoTotal <= 0);

    preLlenarPagoUI();
}


export function updateReporteUI(totales) {
    if(elements.reporteTotalGeneral) elements.reporteTotalGeneral.textContent = `S/ ${totales.totalGeneral.toFixed(2)}`;
    if(elements.reporteTotalEfectivo) elements.reporteTotalEfectivo.textContent = `S/ ${totales.totalEfectivo.toFixed(2)}`;
    if(elements.reporteTotalYape) elements.reporteTotalYape.textContent = `S/ ${totales.totalYape.toFixed(2)}`;
    if(elements.reporteTotalFiado) elements.reporteTotalFiado.textContent = `S/ ${totales.totalFiado.toFixed(2)}`;

    if (elements.topProductsList) {
        elements.topProductsList.innerHTML = ''; 
        if (totales.top5Products.length === 0) {
            elements.topProductsList.innerHTML = '<p class="text-gray-500">No hay datos de productos para este periodo.</p>';
        } else {
            totales.top5Products.forEach(([nombre, cantidad], index) => {
                const itemEl = document.createElement('div');
                itemEl.className = 'flex justify-between items-center p-2 rounded';
                itemEl.classList.add(index % 2 === 0 ? 'bg-gray-50' : 'bg-white'); 
                itemEl.innerHTML = `
                    <p class="font-medium text-gray-800">${index + 1}. ${nombre}</p>
                    <p class="font-bold text-blue-600">${cantidad} Uds.</p>
                `;
                elements.topProductsList.appendChild(itemEl);
            });
        }
    }

    if (!elements.salesChartCanvas) return; 
    const ctx = elements.salesChartCanvas.getContext('2d');

    if (mySalesChart) {
        mySalesChart.destroy();
    }
    
    mySalesChart = new Chart(ctx, {
        type: 'line', 
        data: {
            labels: totales.chartLabels, 
            datasets: [{
                label: 'Ingresos Totales (Efectivo + Yape/Plin)',
                data: totales.chartData, 
                backgroundColor: 'rgba(59, 130, 246, 0.2)', 
                borderColor: 'rgba(59, 130, 246, 1)',   
                borderWidth: 2,
                fill: true,
                tension: 0.1 
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value, index, values) {
                            return 'S/ ' + value.toFixed(2);
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += 'S/ ' + context.parsed.y.toFixed(2);
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}
// --- FIN MEJORA 2A ---


// --- Funciones de Ayuda de UI ---

export function toggleClienteFiadoSelect() {
    const metodoPagoEl = document.getElementById('venta-metodo-pago');
    if (!metodoPagoEl) return;
    
    const metodoPago = metodoPagoEl.value;
    const clienteSelect = elements.ventaClienteSelect;
    
    if (metodoPago === 'Fiado') {
        elements.ventaClienteContainer.classList.remove('hidden');
        if(clienteSelect) clienteSelect.required = true;
    } else {
        elements.ventaClienteContainer.classList.add('hidden');
        if(clienteSelect) clienteSelect.required = false;
    }
}

export function resetVentaForm() {
    const ventaForm = document.getElementById('venta-form');
    if(ventaForm) ventaForm.reset();
    toggleClienteFiadoSelect();
}

export function resetDeudaForm() {
    if(elements.deudaForm) elements.deudaForm.reset();
}

export function resetPagoForm() {
    if(elements.pagoForm) elements.pagoForm.reset();
    const origenInput = document.getElementById('pago-deuda-origen-id');
    if(origenInput) origenInput.value = '';
}

function preLlenarPagoUI() {
    const montoInput = document.getElementById('pago-monto');
    const descInput = document.getElementById('pago-descripcion');
    const origenInput = document.getElementById('pago-deuda-origen-id');
    
    if (!montoInput || !descInput || !origenInput) return;

    if (montoInput.value) return; 

    const deudasPendientes = getDeudasPendientes();
    if (deudasPendientes.length > 0) {
        const deudaMasAntigua = deudasPendientes[0];
        montoInput.value = deudaMasAntigua.monto.toFixed(2);
        descInput.value = `Pago de: ${deudaMasAntigua.descripcion}`;
        origenInput.value = deudaMasAntigua.id;
    } else {
        montoInput.value = '';
        descInput.value = '';
        origenInput.value = '';
    }
}

export function setupTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.add('hidden');
            });
            navTabs.forEach(t => {
                t.classList.remove('text-blue-600', 'bg-blue-50');
                t.classList.add('text-gray-500');
            });
            
            const tabId = tab.dataset.tab;
            const activeTabContent = document.getElementById(tabId);
            if(activeTabContent) activeTabContent.classList.remove('hidden');
            
            tab.classList.add('text-blue-600', 'bg-blue-50');
            tab.classList.remove('text-gray-500');

            if (tabId === 'tab-reportes') {
                // Importamos dinámicamente para evitar loops
                import('./modules/reports.js?v=5.3').then(reportsModule => { // MODIFICADO
                    reportsModule.loadReporteDelDia();
                });
            }
        });
    });
}