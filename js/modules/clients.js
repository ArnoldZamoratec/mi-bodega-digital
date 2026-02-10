import { 
    onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, getDoc, where, serverTimestamp 
} from '../firebase.js?v=4.0'; // MODIFICADO
import { 
    getClientesCol, 
    getDeudasCol, 
    setDeudasPendientes, 
    getEditingClienteId,
    setEditingClienteId
} from '../store.js?v=4.0'; // MODIFICADO
import { 
    showToast, 
    renderClientesFiado, 
    renderClientesParaVenta, 
    showClienteDetalleModalUI,
    renderHistorialCliente,
    hideClienteModal,
    resetDeudaForm,
    resetPagoForm,
    showClienteModal 
} from '../ui.js?v=4.0'; // MODIFICADO

let unsubClienteDetalle = null; 
let currentClienteData = null;  

export const getCurrentClienteData = () => currentClienteData;

/**
 * Carga la lista de clientes en la pestaña Fiado
 */
export function loadClientesFiado() {
    const q = query(getClientesCol());
    
    onSnapshot(q, (snapshot) => {
        const clientesPromises = [];
        snapshot.forEach(doc => {
            clientesPromises.push(async () => {
                const cliente = { id: doc.id, ...doc.data() };
                
                const qDeudas = query(getDeudasCol(), where("clienteId", "==", cliente.id));
                
                let totalDeuda = 0;
                onSnapshot(qDeudas, (deudasSnapshot) => {
                    totalDeuda = 0;
                    deudasSnapshot.forEach(deudaDoc => {
                        const deuda = deudaDoc.data();
                        if (deuda.monto < 0) { 
                            totalDeuda += deuda.monto;
                        } else if (deuda.monto > 0 && deuda.pagado !== true) { 
                            totalDeuda += deuda.monto;
                        }
                    });
                    
                    const totalEl = document.getElementById(`deuda-total-${cliente.id}`);
                    if (totalEl) {
                        totalEl.textContent = `S/ ${totalDeuda.toFixed(2)}`;
                        totalEl.classList.toggle('text-red-500', totalDeuda > 0);
                        totalEl.classList.toggle('text-green-600', totalDeuda < 0);
                        totalEl.classList.toggle('text-gray-500', totalDeuda === 0);
                    }
                });

                return { ...cliente, saldoTotal: totalDeuda };
            });
        });

        Promise.all(clientesPromises.map(f => f())).then(clientes => {
            clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
            renderClientesFiado(clientes, showClienteDetalleModal);
        });

    }, (error) => {
        console.error("Error al cargar clientes: ", error);
        showToast("Error al cargar clientes", true);
    });
}

/**
 * Carga los clientes en el dropdown de la pestaña "Vender".
 */
export function loadClientesParaVenta() {
    const q = query(getClientesCol());
    
    onSnapshot(q, (snapshot) => {
        const clientes = [];
        snapshot.forEach(doc => {
            clientes.push({ id: doc.id, ...doc.data() });
        });
        clientes.sort((a, b) => a.nombre.localeCompare(b.nombre));
        renderClientesParaVenta(clientes);
    }, (error) => {
        console.error("Error al cargar clientes para venta: ", error);
    });
}

/**
 * Handler para el formulario de Añadir/Editar Cliente.
 */
export async function handleClienteFormSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('cliente-nombre').value;
    const telefono = document.getElementById('cliente-telefono').value;
    const currentEditingClienteId = getEditingClienteId(); 

    const cliente = { nombre, telefono };

    try {
        if (currentEditingClienteId) {
            const docRef = doc(getClientesCol(), currentEditingClienteId);
            await updateDoc(docRef, cliente);
            showToast("Cliente actualizado");
        } else {
            await addDoc(getClientesCol(), cliente);
            showToast("Cliente guardado");
        }
        hideClienteModal();
        setEditingClienteId(null); 
    } catch (error) {
        console.error("Error al guardar cliente: ", error);
        showToast("Error al guardar cliente", true);
    }
}

/**
 * Muestra el modal de detalle del cliente y carga su historial.
 */
export async function showClienteDetalleModal(clienteId) {
    if (unsubClienteDetalle) {
        unsubClienteDetalle();
    }

    const docRef = doc(getClientesCol(), clienteId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
        showToast("No se encontró el cliente", true);
        return;
    }
    const cliente = docSnap.data();
    currentClienteData = { id: clienteId, ...cliente };

    showClienteDetalleModalUI({ id: clienteId, ...cliente });

    const qDeudas = query(getDeudasCol(), where("clienteId", "==", clienteId));
    
    unsubClienteDetalle = onSnapshot(qDeudas, (snapshot) => {
        let saldoTotal = 0;
        let historial = [];
        let deudasPendientes = [];

        snapshot.forEach(doc => {
            historial.push({ id: doc.id, ...doc.data() });
        });

        historial.sort((a, b) => (a.fecha?.toMillis() || 0) - (b.fecha?.toMillis() || 0));

        historial.forEach(item => {
            if (item.monto < 0) { 
                saldoTotal += item.monto;
            } else if (item.monto > 0 && item.pagado !== true) { 
                saldoTotal += item.monto;
                deudasPendientes.push(item);
            }
        });

        setDeudasPendientes(deudasPendientes);
        renderHistorialCliente(historial, saldoTotal, handleMarkAsPaid, handleDeleteHistoryEntry);

    }, (error) => {
        console.error("Error al cargar historial: ", error);
        showToast("Error al cargar historial", true);
    });
}

// --- Handlers Internos ---
async function handleMarkAsPaid(id) {
    try {
        const deudaRef = doc(getDeudasCol(), id);
        await updateDoc(deudaRef, { pagado: true });
        showToast("Deuda marcada como pagada");
    } catch (error) {
        console.error("Error al marcar como pagado:", error);
        showToast("Error al actualizar deuda", true);
    }
}

async function handleDeleteHistoryEntry(id) {
    try {
        await deleteDoc(doc(getDeudasCol(), id));
        showToast("Registro eliminado");
    } catch (error) {
        console.error("Error al eliminar registro:", error);
        showToast("Error al eliminar", true);
    }
}

// --- Handlers Exportados (AQUÍ ESTABA EL ERROR) ---

export function handleHistorialClick(e) {
    const markPaidBtn = e.target.closest('.marcar-pagado-btn');
    if (markPaidBtn) {
        handleMarkAsPaid(markPaidBtn.dataset.id);
        return;
    }

    const deleteBtn = e.target.closest('.eliminar-deuda-btn');
    if (deleteBtn) {
        if (confirm("¿Seguro que quieres eliminar este registro?")) {
            handleDeleteHistoryEntry(deleteBtn.dataset.id);
        }
        return;
    }
}

export async function handleDeudaFormSubmit(e) {
    e.preventDefault();
    const clienteId = document.getElementById('deuda-cliente-id').value;
    const monto = parseFloat(document.getElementById('deuda-monto').value);
    const descripcion = document.getElementById('deuda-descripcion').value;

    if (!monto || !descripcion || !clienteId) {
        showToast("Completa todos los campos de deuda", true);
        return;
    }

    try {
        await addDoc(getDeudasCol(), {
            clienteId,
            monto,
            descripcion,
            fecha: serverTimestamp(),
            pagado: false
        });
        showToast("Deuda añadida");
        resetDeudaForm();
    } catch (error) {
        console.error("Error al añadir deuda:", error);
        showToast("Error al añadir deuda", true);
    }
}

export async function handlePagoFormSubmit(e) {
    e.preventDefault();
    const clienteId = document.getElementById('pago-cliente-id').value;
    const monto = parseFloat(document.getElementById('pago-monto').value);
    const descripcion = document.getElementById('pago-descripcion').value;
    const metodoPago = document.getElementById('pago-metodo').value;
    const deudaOrigenId = document.getElementById('pago-deuda-origen-id').value;

    if (!monto || !descripcion || !clienteId) {
        showToast("Completa todos los campos de pago", true);
        return;
    }

    try {
        await addDoc(getDeudasCol(), {
            clienteId,
            monto: -Math.abs(monto), 
            descripcion,
            fecha: serverTimestamp(),
            pagado: false, 
            metodoPago: metodoPago
        });

        if (deudaOrigenId) {
            const deudaRef = doc(getDeudasCol(), deudaOrigenId);
            await updateDoc(deudaRef, { pagado: true });
        }
        
        showToast("Pago registrado");
        resetPagoForm();

    } catch (error) {
        console.error("Error al registrar pago:", error);
        showToast("Error al registrar pago", true);
    }
}