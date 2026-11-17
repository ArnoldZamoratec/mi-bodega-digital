import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import type { Contenedor } from '@/data/contenedor';
import type { EquipoMovil } from '@/data/firebase/equipoFirestore';
import {
  resolverSesionRemota,
  resultadoSesion,
  type CacheSesion,
  type ResultadoSesion,
} from '@/data/sesion';
import type { Usuario } from '@/domain/entities';
import type { ServicioAuth } from '@/domain/ports';
import { sesionDueno, type Sesion } from '@/domain/rules/roles';

import {
  alertarStockBajo,
  prepararNotificaciones,
  programarRecordatorioFiado,
} from '../services/notificaciones';
import { useCarrito } from '../stores/carritoStore';
import { useDatos } from '../stores/datosStore';
import { useRed } from '../stores/redStore';
import { useSesion } from '../stores/sesionStore';
import { registrarControlSesion, revalidarSesion } from './controlSesion';
import { registrarRecuperador, sincronizarTodo } from './sincronizacion';

const sinReinicio = () => undefined;

/** D-31: como mucho una recuperación de Firestore cada 30 s (evita bucles). */
export const ESPERA_RECUPERACION_MS = 30_000;
/** D-33: tope para leer el rol al iniciar; sin respuesta se sigue con la caché o como dueño. */
export const ESPERA_ROL_MS = 8_000;

const opcionesDatos = {
  alCambiarProductos: (...args: Parameters<typeof alertarStockBajo>) =>
    void alertarStockBajo(...args),
};

/** Lo necesario para resolver el rol (D-33). Sin esto, todos son dueños (como antes). */
export interface ServiciosSesion {
  equipo: Pick<EquipoMovil, 'leerCuenta' | 'leerMiembro' | 'observarMiembro'>;
  cacheSesion: Pick<CacheSesion, 'leer' | 'guardar'>;
  /** Nombre para la autoría del dueño (p. ej. el de su cuenta de Google). */
  nombreUsuario?: () => string;
}

const conTiempo = <T>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const t = setTimeout(
      () => reject(Object.assign(new Error('Tiempo agotado'), { code: 'deadline-exceeded' })),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });

const mismaSesion = (a: Sesion, b: Sesion) =>
  a.uid === b.uid && a.bodega === b.bodega && a.rol === b.rol && a.nombre === b.nombre;

function mismoResultado(a: ResultadoSesion | null, b: ResultadoSesion): boolean {
  if (!a || a.tipo !== b.tipo) return false;
  if (a.tipo === 'activa' && b.tipo === 'activa') return mismaSesion(a.sesion, b.sesion);
  return (
    a.tipo === 'sin-acceso' &&
    b.tipo === 'sin-acceso' &&
    a.bodega === b.bodega &&
    a.motivo === b.motivo
  );
}

/**
 * Orquesta el ciclo de vida de la sesión:
 *  - Al iniciar sesión: resuelve el rol (D-33), crea el contenedor de esa sesión, abre los
 *    listeners y sincroniza el outbox.
 *  - Al cerrar sesión: corta listeners y limpia estado (el outbox queda guardado por sesión).
 *  - Sincroniza lo pendiente al recuperar la red o al volver a primer plano.
 *  - Reprograma el recordatorio de fiados cuando cambian los datos.
 *
 * Rol (D-33): primero la última sesión guardada en el teléfono (así un cajero abre sin red y
 * sigue escribiendo en la bodega correcta); con red se confirma con `cuentas/{uid}` y su
 * miembro. Sin caché y sin red se trabaja como dueño (lo que eran todos antes de D-33) en
 * modo provisional: no se sincroniza nada hasta confirmar el rol con el servidor.
 */
export function useArranque(
  auth: ServicioAuth,
  crearContenedor: (sesion: Sesion, enLinea: () => boolean) => Contenedor,
  /** D-31: reemplaza la instancia de Firestore rota (`reiniciarFirestore`). */
  reiniciarCliente: () => void = sinReinicio,
  serviciosSesion?: ServiciosSesion,
) {
  const contenedor = useSesion((s) => s.contenedor);
  const provisional = useSesion((s) => s.provisional);
  const enLinea = useRed((s) => s.enLinea);
  const movimientos = useDatos((s) => s.movimientos.datos);
  const config = useDatos((s) => s.config);
  const cancelarDatos = useRef<(() => void) | null>(null);
  const cancelarMiembro = useRef<(() => void) | null>(null);
  const ultimaRecuperacion = useRef(Number.NEGATIVE_INFINITY);
  /** Cada cambio de usuario invalida lo que siga en vuelo del anterior. */
  const generacion = useRef(0);
  const usuarioActual = useRef<Usuario | null>(null);
  const resultadoActual = useRef<ResultadoSesion | null>(null);
  const deps = useRef({ crearContenedor, serviciosSesion });
  const vigilar = useRef<((usuario: Usuario, sesion: Sesion) => void) | null>(null);
  useEffect(() => {
    deps.current = { crearContenedor, serviciosSesion };
  });

  // Red
  useEffect(() => useRed.getState().iniciar(), []);

  // Sesión
  useEffect(() => {
    const enLineaAhora = () => useRed.getState().enLinea;
    const nombre = () => deps.current.serviciosSesion?.nombreUsuario?.() ?? '';

    const cortar = () => {
      cancelarDatos.current?.();
      cancelarDatos.current = null;
      cancelarMiembro.current?.();
      cancelarMiembro.current = null;
    };

    const aplicar = (
      usuario: Usuario,
      r: ResultadoSesion,
      opciones: { provisional?: boolean } = {},
    ) => {
      cortar();
      useDatos.getState().reiniciar();
      useCarrito.getState().vaciar();
      resultadoActual.current = opciones.provisional ? null : r;
      if (r.tipo === 'sin-acceso') {
        useSesion.getState().sinAccesoA(usuario, r.bodega, r.motivo);
        return;
      }
      const c = deps.current.crearContenedor(r.sesion, enLineaAhora);
      useSesion.getState().autenticar(usuario, c, opciones);
      cancelarDatos.current = useDatos.getState().iniciar(c, opcionesDatos);
      void prepararNotificaciones(false);

      vigilar.current?.(usuario, r.sesion);
      // D-31: sin red no se abren transacciones; se sincroniza al volver la conexión.
      if (!opciones.provisional && enLineaAhora()) void sincronizarTodo(c);
    };

    // Cajero: si el dueño lo desactiva o lo quita, se entera al instante.
    vigilar.current = (usuario, sesion) => {
      cancelarMiembro.current?.();
      cancelarMiembro.current = null;
      const servicios = deps.current.serviciosSesion;
      if (sesion.rol !== 'cajero' || !servicios) return;
      const { uid, bodega } = sesion;
      cancelarMiembro.current = servicios.equipo.observarMiembro(
        bodega,
        uid,
        (miembro) => {
          const nuevo = resultadoSesion(uid, nombre(), { uid, bodega, rol: 'cajero' }, miembro);
          if (nuevo.tipo === 'activa') return;
          void servicios.cacheSesion.guardar(uid, nuevo);
          aplicar(usuario, nuevo);
        },
        () => undefined, // Sin red o sin permiso: lo resuelve la próxima validación.
      );
    };

    /** Confirma el rol con el servidor y lo aplica si cambió (o si aún no había uno). */
    const revalidar = async (gen: number) => {
      const usuario = usuarioActual.current;
      const servicios = deps.current.serviciosSesion;
      if (!usuario || !servicios) return;
      const yaHay = useSesion.getState().estado !== 'cargando';
      const comoDueno = () => {
        if (!yaHay && gen === generacion.current) {
          aplicar(
            usuario,
            { tipo: 'activa', sesion: sesionDueno(usuario.uid, nombre()) },
            {
              provisional: true,
            },
          );
        }
      };
      if (!enLineaAhora()) return comoDueno();
      try {
        const r = await conTiempo(
          resolverSesionRemota(servicios.equipo, usuario.uid, nombre()),
          ESPERA_ROL_MS,
        );
        if (gen !== generacion.current) return;
        await servicios.cacheSesion.guardar(usuario.uid, r);
        if (gen !== generacion.current) return;
        if (mismoResultado(resultadoActual.current, r)) return;
        const actual = useSesion.getState();
        if (
          actual.estado === 'autenticado' &&
          actual.provisional &&
          r.tipo === 'activa' &&
          mismaSesion(actual.sesion, r.sesion)
        ) {
          // Era dueño, como se supuso: se conserva el contenedor (y el carrito) y desde ahora
          // se puede sincronizar.
          resultadoActual.current = r;
          useSesion.setState({ provisional: false });
          return;
        }
        aplicar(usuario, r);
      } catch (e) {
        console.warn('[sesion] No se pudo confirmar el rol', e);
        comoDueno();
      }
    };

    const cancelarControl = registrarControlSesion({
      aplicar: async (pedido) => {
        const usuario = usuarioActual.current;
        if (!usuario) return;
        // El nombre del dueño lo pone la cuenta (el que pasa la pantalla puede venir vacío).
        const r: ResultadoSesion =
          pedido.tipo === 'activa' && pedido.sesion.rol === 'dueno'
            ? { tipo: 'activa', sesion: sesionDueno(usuario.uid, nombre()) }
            : pedido;
        await deps.current.serviciosSesion?.cacheSesion.guardar(usuario.uid, r);
        aplicar(usuario, r);
      },
      revalidar: () => revalidar(generacion.current),
    });

    const cancelarAuth = auth.observar((usuario) => {
      const gen = ++generacion.current;
      cortar();
      useDatos.getState().reiniciar();
      useCarrito.getState().vaciar();
      usuarioActual.current = usuario;
      resultadoActual.current = null;

      if (!usuario) {
        useSesion.getState().cerrar();
        return;
      }
      const servicios = deps.current.serviciosSesion;
      if (!servicios) {
        // Sin servicios de equipo (pruebas, versiones previas): dueño, como antes de D-33.
        aplicar(usuario, { tipo: 'activa', sesion: sesionDueno(usuario.uid, nombre()) });
        return;
      }
      useSesion.getState().esperar();
      void (async () => {
        const guardada = await servicios.cacheSesion.leer(usuario.uid);
        if (gen !== generacion.current) return;
        if (guardada) aplicar(usuario, guardada);
        await revalidar(gen);
      })();
    });

    return () => {
      cancelarAuth();
      cancelarControl();
    };
  }, [auth]);

  // D-31: Firestore quedó inservible (INTERNAL ASSERTION FAILED o envíos que nunca terminan).
  // Se recrea la instancia y el contenedor de la sesión; los outbox persisten y se reenvían.
  useEffect(
    () =>
      registrarRecuperador(() => {
        const sesion = useSesion.getState();
        const ahora = Date.now();
        if (sesion.estado !== 'autenticado') return;
        if (ahora - ultimaRecuperacion.current < ESPERA_RECUPERACION_MS) return;
        ultimaRecuperacion.current = ahora;
        console.warn('[sync] Firestore inutilizable: se recrea la instancia (D-31)');
        cancelarDatos.current?.();
        cancelarDatos.current = null;
        reiniciarCliente();
        const c = deps.current.crearContenedor(sesion.sesion, () => useRed.getState().enLinea);
        useSesion.getState().autenticar(sesion.usuario, c, { provisional: sesion.provisional });
        cancelarDatos.current = useDatos.getState().iniciar(c, opcionesDatos);
        // El listener del propio miembro (cajero) también vivía en la instancia vieja.
        vigilar.current?.(sesion.usuario, sesion.sesion);
        if (useRed.getState().enLinea && !sesion.provisional) {
          void sincronizarTodo(c, { forzar: true });
        }
      }),
    [reiniciarCliente],
  );

  useEffect(
    () => () => {
      cancelarDatos.current?.();
      cancelarMiembro.current?.();
    },
    [],
  );

  // Reintento de lo pendiente al volver la conexión. Si el rol era provisional, primero se
  // confirma (la confirmación ya sincroniza al aplicar la sesión definitiva).
  useEffect(() => {
    if (!enLinea || !contenedor) return;
    if (provisional) {
      void revalidarSesion();
      return;
    }
    void sincronizarTodo(contenedor);
  }, [enLinea, contenedor, provisional]);

  useEffect(() => {
    if (!contenedor || provisional) return;
    const sub = AppState.addEventListener('change', (estado) => {
      if (estado === 'active' && useRed.getState().enLinea) void sincronizarTodo(contenedor);
    });
    return () => sub.remove();
  }, [contenedor, provisional]);

  // Recordatorio de fiados vencidos (con antirrebote para no reprogramar en cada snapshot).
  // Es del dueño: el cajero no programa avisos de cobranza en su teléfono.
  useEffect(() => {
    if (!contenedor || contenedor.sesion?.rol === 'cajero') return;
    const t = setTimeout(() => void programarRecordatorioFiado(movimientos, config), 3000);
    return () => clearTimeout(t);
  }, [contenedor, movimientos, config]);
}
