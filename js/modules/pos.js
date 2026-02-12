import { onSnapshot, query, updateDoc, doc, increment, addDoc, serverTimestamp } from '../firebase.js?v=5.3';
import {
    getProductosCol,
    getVentasCol,
    getDeudasCol,
    getCart,
    clearCart,
    addToCartState,
    removeFromCartState
} from '../store.js?v=5.3';
import { showToast, renderVentaRapida, renderCart, resetVentaForm } from '../ui.js?v=5.3';

let allProducts = [];

function handleAddToCart(producto) {
    addToCartState({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio
    });
    renderCart(getCart(), handleRemoveFromCart);
    // Toast removed - user sees product added to cart visually
}

function handleRemoveFromCart(id) {
    removeFromCartState(id);
    renderCart(getCart(), handleRemoveFromCart);
}

export function filterAndRenderVentaRapida() {
    const searchInput = document.getElementById('search-bar');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

    const filteredProducts = allProducts.filter(producto =>
        producto.nombre.toLowerCase().includes(searchTerm)
    );

    renderVentaRapida(filteredProducts, handleAddToCart);
}

export function loadVentaRapidaPanel() {
    const q = query(getProductosCol());

    onSnapshot(q, (snapshot) => {
        const productos = [];
        snapshot.forEach(doc => {
            productos.push({ id: doc.id, ...doc.data() });
        });

        allProducts = productos.sort((a, b) => a.nombre.localeCompare(b.nombre));

        filterAndRenderVentaRapida();

    }, (error) => {
        console.error("Error al cargar panel de venta rápida: ", error);
        showToast("Error al cargar productos", true);
    });
}


export function handleCartClick(e) {
    const removeBtn = e.target.closest('.remove-from-cart-btn');
    if (removeBtn) {
        handleRemoveFromCart(removeBtn.dataset.id);
    }
}

export async function handleVentaFormSubmit(e) {
    e.preventDefault();
    const cart = getCart();
    if (cart.length === 0) {
        showToast("El carrito está vacío", true);
        return;
    }

    const metodoDePago = document.getElementById('venta-metodo-pago').value;
    const clienteId = document.getElementById('venta-cliente-fiado').value;
    const total = cart.reduce((sum, item) => sum + (item.precio * item.cantidad), 0);

    if (metodoDePago === 'Fiado' && !clienteId) {
        showToast("Debes seleccionar un cliente para fiar", true);
        return;
    }

    try {
        const venta = {
            items: cart.map(item => ({ ...item })),
            total: total,
            metodoDePago: metodoDePago,
            clienteId: metodoDePago === 'Fiado' ? clienteId : null,
            fecha: serverTimestamp()
        };
        const ventaDoc = await addDoc(getVentasCol(), venta);

        if (metodoDePago === 'Fiado' && clienteId) {
            let descripcionDeuda = cart.map(item => `${item.nombre} (x${item.cantidad})`).join(', ');
            if (descripcionDeuda.length > 100) {
                descripcionDeuda = descripcionDeuda.substring(0, 97) + '...';
            }

            await addDoc(getDeudasCol(), {
                clienteId: clienteId,
                monto: total,
                descripcion: descripcionDeuda,
                fecha: serverTimestamp(),
                ventaId: ventaDoc.id,
                pagado: false
            });
        }

        const updatePromises = cart.map(item => {
            const productoRef = doc(getProductosCol(), item.id);
            return updateDoc(productoRef, {
                stock: increment(-item.cantidad)
            });
        });
        await Promise.all(updatePromises);

        clearCart();
        renderCart(getCart(), handleRemoveFromCart);
        resetVentaForm();
        // Toast removed - cart clears, form resets = visual confirmation

    } catch (error) {
        console.error("Error al registrar venta: ", error);
        showToast("Error al registrar la venta", true);
    }
}