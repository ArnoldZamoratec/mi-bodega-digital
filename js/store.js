import { db, appId } from './firebase.js?v=4.0'; // MODIFICADO
import { collection } from './firebase.js?v=4.0'; // MODIFICADO

// --- Estado Global ---
let userId = null;
let cart = [];
let currentEditingProductoId = null;
let currentEditingClienteId = null;
let deudasPendientesCliente = [];

// --- Selectores de Estado ---
export const getUserId = () => userId;
export const getCart = () => cart;
export const getEditingProductoId = () => currentEditingProductoId;
export const getEditingClienteId = () => currentEditingClienteId;
export const getDeudasPendientes = () => deudasPendientesCliente;

// --- Modificadores de Estado ---
export const setUserId = (id) => { userId = id; };
export const setCart = (newCart) => { cart = newCart; };
export const clearCart = () => { cart = []; };
export const setEditingProductoId = (id) => { currentEditingProductoId = id; };
export const setEditingClienteId = (id) => { currentEditingClienteId = id; };
export const setDeudasPendientes = (deudas) => { deudasPendientesCliente = deudas; };

// --- Ayudantes del Carrito ---
export const addToCartState = (producto) => {
    const existingItem = cart.find(item => item.id === producto.id);
    if (existingItem) {
        existingItem.cantidad++;
    } else {
        cart.push({ ...producto, cantidad: 1 });
    }
};

export const removeFromCartState = (id) => {
    const itemIndex = cart.findIndex(item => item.id === id);
    if (itemIndex > -1) {
        const item = cart[itemIndex];
        if (item.cantidad > 1) {
            item.cantidad--;
        } else {
            cart.splice(itemIndex, 1);
        }
    }
};

// --- Funciones de Ayuda (Paths de Firestore) ---
export const getProductosCol = () => collection(db, `artifacts/${appId}/users/${userId}/productos`);
export const getClientesCol = ()  => collection(db, `artifacts/${appId}/users/${userId}/clientes`);
export const getVentasCol = ()    => collection(db, `artifacts/${appId}/users/${userId}/ventas`);
export const getDeudasCol = ()    => collection(db, `artifacts/${appId}/users/${userId}/deudas`);