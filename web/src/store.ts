import {
  agregarAlCarrito,
  eliminarDelCarrito,
  quitarDelCarrito,
  type ItemCarrito,
} from '@bodegon/core';
import { collection, type CollectionReference, type DocumentReference, doc } from 'firebase/firestore';

import { appId, db } from './firebase';

// --- Estado de la sesión ---
let userId: string | null = null;
let cart: ItemCarrito[] = [];

export const getUserId = (): string | null => userId;
export const getCart = (): readonly ItemCarrito[] => cart;

export const setUserId = (id: string | null): void => {
  userId = id;
};
export const clearCart = (): void => {
  cart = [];
};

/** Al cerrar sesión: nada del usuario anterior debe quedar en memoria. */
export const resetState = (): void => {
  userId = null;
  cart = [];
};

// --- Carrito (reglas del core: mismo comportamiento que la v5.3) ---
export const addToCartState = (producto: { id: string; nombre: string; precio: number }): void => {
  cart = agregarAlCarrito(cart, producto);
};
/** Resta una unidad (la quita si llega a cero). */
export const removeFromCartState = (id: string): void => {
  cart = quitarDelCarrito(cart, id);
};
/** "Deshacer": el ticket vuelve tal como estaba para corregirlo. */
export const restaurarCarrito = (items: readonly ItemCarrito[]): void => {
  cart = items.map((i) => ({ ...i }));
};
/** Quita la línea completa. */
export const deleteFromCartState = (id: string): void => {
  cart = eliminarDelCarrito(cart, id);
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
/** Caja (D-28): `cajas/{cajaId}` y `cajas/{cajaId}/movimientos/{id}`. */
export const getCajasCol = (): CollectionReference => collection(db, ruta('cajas'));
export const getMovimientosCajaCol = (cajaId: string): CollectionReference =>
  collection(db, ruta(`cajas/${cajaId}/movimientos`));
