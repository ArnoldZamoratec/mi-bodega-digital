import type { Producto } from '@bodegon/core';
import { addDoc, deleteDoc, doc, onSnapshot, query, updateDoc } from 'firebase/firestore';

import { registrarListener } from '../listeners';
import { aProducto, porNombre } from '../mappers';
import { getEditingProductoId, getProductosCol } from '../store';
import { hideProductoModal, renderProductos, showProductoModal, showToast } from '../ui';

/** Carga la lista de productos en la pestaña de Inventario. */
export function loadProductos(): void {
  registrarListener(
    onSnapshot(
      query(getProductosCol()),
      (snapshot) => {
        const productos = snapshot.docs.map((d) => aProducto(d.id, d.data())).sort(porNombre);
        renderProductos(productos, handleEditClick, handleDeleteClick);
      },
      (error) => {
        console.error('Error al cargar productos: ', error);
        showToast('Error al cargar productos', true);
      },
    ),
  );
}

function handleEditClick(producto: Producto): void {
  showProductoModal(producto);
}

async function handleDeleteClick(id: string, nombre: string): Promise<void> {
  if (!confirm(`¿Seguro que quieres eliminar ${nombre}?`)) return;
  try {
    await deleteDoc(doc(getProductosCol(), id));
  } catch (error) {
    console.error('Error al eliminar producto:', error);
    showToast('Error al eliminar', true);
  }
}

/** Valores del formulario → documento `productos` (mismo formato que la v5.3). */
export function leerFormularioProducto(valores: {
  nombre: string;
  precio: string;
  stock: string;
}): { nombre: string; precio: number; stock: number | null } {
  return {
    nombre: valores.nombre,
    precio: parseFloat(valores.precio),
    stock: valores.stock ? parseInt(valores.stock, 10) : null,
  };
}

/** Submit del formulario de Producto (Añadir/Editar). */
export async function handleProductoFormSubmit(e: Event): Promise<void> {
  e.preventDefault();
  const valor = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
  const producto = leerFormularioProducto({
    nombre: valor('producto-nombre'),
    precio: valor('producto-precio'),
    stock: valor('producto-stock'),
  });
  const currentEditingProductoId = getEditingProductoId();

  try {
    if (currentEditingProductoId) {
      await updateDoc(doc(getProductosCol(), currentEditingProductoId), producto);
    } else {
      await addDoc(getProductosCol(), producto);
    }
    hideProductoModal();
  } catch (error) {
    console.error('Error al guardar producto: ', error);
    showToast('Error al guardar producto', true);
  }
}
