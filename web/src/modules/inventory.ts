import { onSnapshot, query, addDoc, updateDoc, deleteDoc, doc } from '../firebase.js?v=5.3'; // MODIFICADO
import { getProductosCol, getEditingProductoId } from '../store.js?v=5.3'; // MODIFICADO
import { showToast, renderProductos, showProductoModal, hideProductoModal } from '../ui.js?v=5.3'; // MODIFICADO

/**
 * Carga la lista de productos en la pestaña de Inventario.
 */
export function loadProductos() {
    const q = query(getProductosCol());

    onSnapshot(q, (snapshot) => {
        const productos = [];
        snapshot.forEach(doc => {
            productos.push({ id: doc.id, ...doc.data() });
        });
        productos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        // Renderizar pasando los handlers
        renderProductos(productos, handleEditClick, handleDeleteClick);

    }, (error) => {
        console.error("Error al cargar productos: ", error);
        showToast("Error al cargar productos", true);
    });
}

// Handler para el botón de editar
function handleEditClick(producto) {
    showProductoModal(producto);
}

// Handler para el botón de eliminar
async function handleDeleteClick(id, nombre) {
    if (confirm(`¿Seguro que quieres eliminar ${nombre}?`)) {
        try {
            await deleteDoc(doc(getProductosCol(), id));
            // Toast removed - product disappears from list
        } catch (error) {
            console.error("Error al eliminar producto:", error);
            showToast("Error al eliminar", true);
        }
    }
}

/**
 * Handler para el submit del formulario de Producto (Añadir/Editar).
 */
export async function handleProductoFormSubmit(e) {
    e.preventDefault();
    const nombre = document.getElementById('producto-nombre').value;
    const precio = parseFloat(document.getElementById('producto-precio').value);
    const stockInput = document.getElementById('producto-stock').value;
    const stock = stockInput ? parseInt(stockInput) : null;
    const currentEditingProductoId = getEditingProductoId();

    const producto = { nombre, precio, stock };

    try {
        if (currentEditingProductoId) {
            // Actualizar
            const docRef = doc(getProductosCol(), currentEditingProductoId);
            await updateDoc(docRef, producto);
            // Toast removed - modal closes, list updates visually
        } else {
            // Crear
            await addDoc(getProductosCol(), producto);
            // Toast removed - modal closes, new product appears in list
        }
        hideProductoModal();
    } catch (error) {
        console.error("Error al guardar producto: ", error);
        showToast("Error al guardar producto", true);
    }
}