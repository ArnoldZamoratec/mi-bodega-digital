import { create } from 'zustand';

import type { Contenedor } from '@/data/contenedor';
import { mensajeDeError } from '@/data/firebase/errores';
import {
  CONFIG_NEGOCIO_POR_DEFECTO,
  type Cliente,
  type ConfigNegocio,
  type MovimientoFiado,
  type Producto,
} from '@/domain/entities';
import type { EntradaCola } from '@/domain/ports';
import { ordenarPorNombre } from '@/domain/rules/productos';

export interface Coleccion<T> {
  datos: T[];
  cargando: boolean;
  error: string | null;
  /** true mientras se muestran datos de la caché local (sin confirmar con el servidor). */
  desdeCache: boolean;
}

const vacia = <T>(): Coleccion<T> => ({
  datos: [],
  cargando: true,
  error: null,
  desdeCache: false,
});

interface EstadoDatos {
  productos: Coleccion<Producto>;
  clientes: Coleccion<Cliente>;
  movimientos: Coleccion<MovimientoFiado>;
  config: ConfigNegocio;
  pendientes: EntradaCola[];
}

export interface OpcionesSuscripcion {
  alCambiarProductos?: (
    anteriores: Producto[],
    actuales: Producto[],
    config: ConfigNegocio,
  ) => void;
}

type DatosStore = EstadoDatos & {
  iniciar: (c: Contenedor, opciones?: OpcionesSuscripcion) => () => void;
  /** Vuelve a abrir los listeners con la misma sesión (botón "Reintentar" de los errores). */
  reintentar: () => void;
  reiniciar: () => void;
};

/** Suscripción activa: permite reintentar y garantiza un solo juego de listeners. */
let activa: { c: Contenedor; opciones: OpcionesSuscripcion; cancelar: () => void } | null = null;

const inicial = (): EstadoDatos => ({
  productos: vacia(),
  clientes: vacia(),
  movimientos: vacia(),
  config: CONFIG_NEGOCIO_POR_DEFECTO,
  pendientes: [],
});

/**
 * Un único listener por colección para toda la app (corrige B-05 de la web, que abría
 * un listener por cliente en cada cambio). Las pantallas solo leen de este store.
 */
export const useDatos = create<DatosStore>((set, get) => ({
  ...inicial(),

  iniciar: (c, opciones = {}) => {
    activa?.cancelar();
    let activo = true;
    let primeraCargaProductos = true;

    // 1) Hidratar desde caché para poder vender sin conexión tras reiniciar (D-05).
    void (async () => {
      const [productos, clientes] = await Promise.all([
        c.cache.leer<Producto>('productos'),
        c.cache.leer<Cliente>('clientes'),
      ]);
      if (!activo) return;
      if (productos && get().productos.cargando) {
        set({ productos: { datos: productos, cargando: false, error: null, desdeCache: true } });
      }
      if (clientes && get().clientes.cargando) {
        set({ clientes: { datos: clientes, cargando: false, error: null, desdeCache: true } });
      }
    })();

    // 2) Listeners en tiempo real.
    const cancelaciones = [
      c.productos.observar(
        (lista) => {
          const actuales = ordenarPorNombre(lista);
          const anteriores = get().productos.datos;
          set({ productos: { datos: actuales, cargando: false, error: null, desdeCache: false } });
          void c.cache.guardar('productos', actuales);
          if (!primeraCargaProductos)
            opciones.alCambiarProductos?.(anteriores, actuales, get().config);
          primeraCargaProductos = false;
        },
        (e) =>
          set((s) => ({
            productos: {
              ...s.productos,
              cargando: false,
              error: mensajeDeError(e, 'Error al cargar productos'),
            },
          })),
      ),
      c.clientes.observar(
        (lista) => {
          const actuales = ordenarPorNombre(lista);
          set({ clientes: { datos: actuales, cargando: false, error: null, desdeCache: false } });
          void c.cache.guardar('clientes', actuales);
        },
        (e) =>
          set((s) => ({
            clientes: {
              ...s.clientes,
              cargando: false,
              error: mensajeDeError(e, 'Error al cargar clientes'),
            },
          })),
      ),
      c.fiado.observarTodos(
        (movs) =>
          set({ movimientos: { datos: movs, cargando: false, error: null, desdeCache: false } }),
        (e) =>
          set((s) => ({
            movimientos: {
              ...s.movimientos,
              cargando: false,
              error: mensajeDeError(e, 'Error al cargar el fiado'),
            },
          })),
      ),
      c.config.observar(
        (config) => set({ config }),
        () => undefined, // Sin config se usan los valores por defecto.
      ),
      c.cola.suscribir((pendientes) => set({ pendientes })),
    ];

    const cancelar = () => {
      if (!activo) return;
      activo = false;
      cancelaciones.forEach((fn) => fn());
      if (activa?.cancelar === cancelar) activa = null;
    };
    activa = { c, opciones, cancelar };
    return cancelar;
  },

  reintentar: () => {
    if (!activa) return;
    const { c, opciones } = activa;
    // Se conservan los datos que ya había (p. ej. de la caché); solo se muestra "cargando".
    set((s) => ({
      productos: { ...s.productos, cargando: s.productos.datos.length === 0, error: null },
      clientes: { ...s.clientes, cargando: s.clientes.datos.length === 0, error: null },
      movimientos: { ...s.movimientos, cargando: s.movimientos.datos.length === 0, error: null },
    }));
    get().iniciar(c, opciones);
  },

  reiniciar: () => {
    activa?.cancelar();
    set(inicial());
  },
}));
