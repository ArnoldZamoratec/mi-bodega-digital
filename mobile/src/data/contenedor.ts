import AsyncStorage from '@react-native-async-storage/async-storage';

import type {
  ColaMovimientos,
  ColaVentas,
  RepositorioClientes,
  RepositorioConfig,
  RepositorioFiado,
  RepositorioProductos,
  RepositorioVentas,
} from '@/domain/ports';
import type { RepositorioCaja } from '@/domain/portsCaja';
import type { RepositorioRecordatorios } from '@/domain/portsCobranza';
import type { OperacionCaja } from '@/domain/rules/caja';
import type { OperacionMovimiento } from '@/domain/rules/fiado';
import type { Sesion } from '@/domain/rules/roles';
import type { OperacionVenta } from '@/domain/rules/venta';
import { SincronizadorCola, SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';
import { dataAppId } from '@/shared/env';

import { asegurarToken } from './asegurarToken';
import { CajaFirestore, RecordatoriosFirestore } from './firebase/cajaFirestore';
import { obtenerFirebase } from './firebase/client';
import { EquipoFirestore } from './firebase/equipoFirestore';
import { clasificadorFirebase } from './firebase/errores';
import {
  ClientesFirestore,
  ConfigFirestore,
  FiadoFirestore,
  ProductosFirestore,
  VentasFirestore,
} from './firebase/repositorios';
import { Rutas } from './firebase/rutas';
import { CacheCatalogo } from './local/cacheCatalogo';
import { CajaOffline, ColaCajaPersistente, type ColaCaja } from './local/cajaOffline';
import { ColaMovimientosPersistente, ColaVentasPersistente } from './local/colaVentas';
import { FiadoOffline } from './local/fiadoOffline';
import { CacheSesion, claveLocal } from './sesion';

/** Dependencias de una sesión de usuario. Se crea al iniciar sesión, se descarta al salir. */
export interface Contenedor {
  /** uid de quien usa la app (Firebase Auth). */
  uid: string;
  /**
   * D-33: rol y bodega. La raíz de datos es `users/{sesion.bodega}` (el dueño: su propio uid;
   * el cajero: el uid del dueño). Cada escritura lleva la autoría de esta sesión.
   */
  sesion: Sesion;
  productos: RepositorioProductos;
  clientes: RepositorioClientes;
  fiado: RepositorioFiado;
  ventas: RepositorioVentas;
  config: RepositorioConfig;
  cola: ColaVentas;
  cache: CacheCatalogo;
  sincronizador: SincronizadorVentas;
  colaFiado: ColaMovimientos;
  sincronizadorFiado: SincronizadorCola<OperacionMovimiento>;
  /** Cobranza (D-27): `clientes.ultimoRecordatorio`. */
  recordatorios: RepositorioRecordatorios;
  /** Caja (D-28), outbox-first como ventas y fiado. */
  caja: RepositorioCaja;
  colaCaja: ColaCaja;
  sincronizadorCaja: SincronizadorCola<OperacionCaja>;
}

export { asegurarToken };

export function crearContenedor(sesion: Sesion, enLinea: () => boolean): Contenedor {
  const { db, auth } = obtenerFirebase();
  const { uid } = sesion;
  // Outbox y caché del teléfono separados por sesión (el dueño mantiene su clave de siempre).
  const local = claveLocal(sesion);
  const conToken =
    <T, R>(enviar: (op: T) => Promise<R>) =>
    async (op: T): Promise<R> => {
      await asegurarToken(auth);
      return enviar(op);
    };
  const rutas = new Rutas(db, dataAppId(), sesion.bodega);
  const ventas = new VentasFirestore(db, rutas, sesion);
  const confirmarVenta = conToken((op: OperacionVenta) => ventas.confirmar(op));
  const cola = new ColaVentasPersistente(AsyncStorage, local);
  const remotoFiado = new FiadoFirestore(db, rutas, sesion);
  const colaFiado = new ColaMovimientosPersistente(AsyncStorage, local);
  const cache = new CacheCatalogo(AsyncStorage, local);
  const sincronizadorFiado = new SincronizadorCola<OperacionMovimiento>(
    colaFiado,
    conToken((op: OperacionMovimiento) => remotoFiado.confirmar(op)),
    (op) => op.id,
    clasificadorFirebase,
  );
  const remotoCaja = new CajaFirestore(db, rutas, sesion);
  const colaCaja = new ColaCajaPersistente(AsyncStorage, local);
  const sincronizadorCaja = new SincronizadorCola<OperacionCaja>(
    colaCaja,
    conToken((op: OperacionCaja) => remotoCaja.confirmar(op)),
    (op) => op.id,
    clasificadorFirebase,
  );
  return {
    uid,
    sesion,
    productos: new ProductosFirestore(rutas),
    clientes: new ClientesFirestore(rutas),
    fiado: new FiadoOffline({
      remoto: remotoFiado,
      cola: colaFiado,
      colaVentas: cola,
      sincronizar: () => sincronizadorFiado.sincronizar(),
      enLinea,
      cache,
    }),
    ventas,
    config: new ConfigFirestore(rutas),
    cola,
    cache,
    sincronizador: new SincronizadorVentas(
      { confirmar: confirmarVenta },
      cola,
      clasificadorFirebase,
    ),
    colaFiado,
    sincronizadorFiado,
    recordatorios: new RecordatoriosFirestore(rutas),
    caja: new CajaOffline({
      remoto: remotoCaja,
      cola: colaCaja,
      sincronizar: () => sincronizadorCaja.sincronizar(),
      enLinea,
      cache,
    }),
    colaCaja,
    sincronizadorCaja,
  };
}

/**
 * D-33: equipo (invitaciones, miembros, cuentas) y caché de la sesión resuelta. Viven fuera
 * del contenedor porque se usan antes de saber el rol (y para un cajero sin acceso).
 */
export function crearServiciosEquipo() {
  return {
    equipo: new EquipoFirestore(() => obtenerFirebase().db, obtenerFirebase().auth, dataAppId()),
    cacheSesion: new CacheSesion(AsyncStorage),
  };
}
