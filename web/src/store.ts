import { agregarAlCarrito, quitarDelCarrito, type ItemCarrito } from '@bodegon/core';
import { collection, type CollectionReference, type DocumentReference, doc } from 'firebase/firestore';

import { appId, db } from './firebase';

// --- Estado Global ---
let userId: string | null = null;
let cart: ItemCarrito[] = [];
let currentEditingProductoId: string | null = null;
let currentEditingClienteId: string | null = null;
let nombreBodega: string | null = null;

// --- Selectores de Estado ---
export const getUserId = (): string | null => userId;
export const getCart = (): readonly ItemCarrito[] => cart;
export const getEditingProductoId = (): string | null => currentEditingProductoId;
export const getEditingClienteId = (): string | null => currentEditingClienteId;
/** `config/negocio.nombre` (null si no está configurado). Lo usa el recordatorio de WhatsApp. */
export const getNombreBodega = (): string | null => nombreBodega;

// --- Modificadores de Estado ---
export const setUserId = (id: string | null): void => {
  userId = id;
};
export const clearCart = (): void => {
  cart = [];
};
export const setEditingProductoId = (id: string | null): void => {
  currentEditingProductoId = id;
};
export const setEditingClienteId = (id: string | null): void => {
  currentEditingClienteId = id;
};
export const setNombreBodega = (nombre: string | null): void => {
  nombreBodega = nombre;
};

/** Al cerrar sesión: nada del usuario anterior debe quedar en memoria. */
export const resetState = (): void => {
  userId = null;
  cart = [];
  currentEditingProductoId = null;
  currentEditingClienteId = null;
  nombreBodega = null;
};

// --- Ayudantes del Carrito (reglas del core: mismo comportamiento que la v5.3) ---
export const addToCartState = (producto: { id: string; nombre: string; precio: number }): void => {
  cart = agregarAlCarrito(cart, producto);
};

export const removeFromCartState = (id: string): void => {
  cart = quitarDelCarrito(cart, id);
};

// --- Rutas de Firestore: artifacts/{appId}/users/{uid}/... ---
const ruta = (sub: string): string => {
  if (!userId) throw new Error('Sin sesión');
  return `artifacts/${appId}/users/${userId}/${sub}`;
};

export const getProductosCol = (): CollectionReference => collection(db, ruta('productos'));
export const getClientesCol = (): CollectionReference => collection(db, ruta('clientes'));
export const getVentasCol = (): CollectionReference => collection(db, ruta('ventas'));
export const getDeudasCol = (): CollectionReference => collection(db, ruta('deudas'));
export const getConfigNegocioDoc = (): DocumentReference => doc(db, ruta('config/negocio'));
