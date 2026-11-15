import {
  armarOperacionVenta,
  ErrorDominio,
  type MetodoPagoVenta,
  type Producto,
} from '@bodegon/core';
import { doc, increment, onSnapshot, query, runTransaction, serverTimestamp } from 'firebase/firestore';

import { db } from '../firebase';
import { registrarListener } from '../listeners';
import { aProducto, porNombre } from '../mappers';
import {
  addToCartState,
  clearCart,
  getCart,
  getDeudasCol,
  getProductosCol,
  getVentasCol,
  removeFromCartState,
} from '../store';
import { renderCart, renderVentaRapida, resetVentaForm, showToast } from '../ui';

let allProducts: Producto[] = [];
let ventaEnCurso = false;

function handleAddToCart(producto: Producto): void {
  addToCartState({ id: producto.id, nombre: producto.nombre, precio: producto.precio });
  renderCart(getCart());
}

function handleRemoveFromCart(id: string): void {
  removeFromCartState(id);
  renderCart(getCart());
}

/** Filtro del POS: "contiene", sin distinguir mayúsculas (igual que la v5.3). */
export function filtrarProductos(productos: readonly Producto[], termino: string): Producto[] {
  const t = termino.toLowerCase();
  return productos.filter((p) => p.nombre.toLowerCase().includes(t));
}

export function filterAndRenderVentaRapida(): void {
  const searchInput = document.getElementById('search-bar') as HTMLInputElement | null;
  renderVentaRapida(filtrarProductos(allProducts, searchInput?.value ?? ''), handleAddToCart);
}

export function loadVentaRapidaPanel(): void {
  registrarListener(
    onSnapshot(
      query(getProductosCol()),
      (snapshot) => {
        allProducts = snapshot.docs.map((d) => aProducto(d.id, d.data())).sort(porNombre);
        filterAndRenderVentaRapida();
      },
      (error) => {
        console.error('Error al cargar panel de venta rápida: ', error);
        showToast('Error al cargar productos', true);
      },
    ),
  );
}

/** Al cerrar sesión. */
export function resetPos(): void {
  allProducts = [];
  ventaEnCurso = false;
  clearCart();
  renderCart(getCart());
}

export function handleCartClick(e: Event): void {
  const removeBtn = (e.target as Element | null)?.closest<HTMLElement>('.remove-from-cart-btn');
  const id = removeBtn?.dataset.id;
  if (id) handleRemoveFromCart(id);
}

export async function handleVentaFormSubmit(e: SubmitEvent): Promise<void> {
  e.preventDefault();
  if (ventaEnCurso) return; // evita ventas duplicadas por doble clic

  const metodoDePago = (document.getElementById('venta-metodo-pago') as HTMLSelectElement)
    .value as MetodoPagoVenta;
  const clienteId =
    (document.getElementById('venta-cliente-fiado') as HTMLSelectElement | null)?.value || null;

  // Reglas del core (RN-03/04/05, total en céntimos). Mismos mensajes que la v5.3:
  // "El carrito está vacío", "Debes seleccionar un cliente para fiar".
  let op;
  try {
    op = armarOperacionVenta({
      carrito: getCart(),
      metodoDePago,
      clienteId,
      ventaId: doc(getVentasCol()).id,
      cargoId: doc(getDeudasCol()).id,
      ahora: Date.now(),
    });
  } catch (error) {
    showToast(error instanceof ErrorDominio ? error.message : 'Error al registrar la venta', true);
    return;
  }

  const submitBtn =
    (e.submitter as HTMLButtonElement | null) ??
    (e.target as HTMLFormElement).querySelector<HTMLButtonElement>('[type="submit"]');
  ventaEnCurso = true;
  if (submitBtn) submitBtn.disabled = true;

  try {
    // Transacción atómica: venta + cargo de fiado + stock, todo o nada (B-03).
    await runTransaction(db, async (tx) => {
      const refs = op.deltasStock.map((d) => doc(getProductosCol(), d.productoId));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));

      tx.set(doc(getVentasCol(), op.ventaId), { ...op.venta, fecha: serverTimestamp() });

      if (op.cargo && op.cargoId) {
        tx.set(doc(getDeudasCol(), op.cargoId), { ...op.cargo, fecha: serverTimestamp() });
      }

      // B-10: solo descuenta stock de productos que existen y tienen stock controlado (no null).
      snaps.forEach((snap, i) => {
        const ref = refs[i];
        const delta = op.deltasStock[i]?.delta;
        if (!ref || delta === undefined || !snap.exists()) return;
        const stock = snap.data().stock;
        if (stock === null || stock === undefined) return;
        tx.update(ref, { stock: increment(delta) });
      });
    });

    clearCart();
    renderCart(getCart());
    resetVentaForm();
  } catch (error) {
    console.error('Error al registrar venta: ', error);
    showToast('Error al registrar la venta', true);
  } finally {
    ventaEnCurso = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}
