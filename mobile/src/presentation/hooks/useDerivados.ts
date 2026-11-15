import { useMemo } from 'react';
import { useTheme } from 'react-native-paper';

import type { Producto } from '@/domain/entities';
import { saldosPorCliente } from '@/domain/rules/fiado';
import { aplicarDeltasStock } from '@/domain/rules/productos';
import { deltasPendientes } from '@/domain/rules/venta';

import { useDatos } from '../stores/datosStore';
import type { TemaApp } from '../theme/tema';

export const useTema = () => useTheme<TemaApp>();

/** Catálogo con el stock descontado por ventas aún no sincronizadas (D-05). */
export function useProductosVisibles(): Producto[] {
  const productos = useDatos((s) => s.productos.datos);
  const pendientes = useDatos((s) => s.pendientes);
  return useMemo(
    () => aplicarDeltasStock(productos, deltasPendientes(pendientes.map((p) => p.operacion))),
    [productos, pendientes],
  );
}

export function useSaldos(): Map<string, number> {
  const movimientos = useDatos((s) => s.movimientos.datos);
  return useMemo(() => saldosPorCliente(movimientos), [movimientos]);
}
