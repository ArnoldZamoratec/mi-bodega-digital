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
import { SincronizadorCola, SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';
import { dataAppId } from '@/shared/env';

import { CajaFirestore, RecordatoriosFirestore } from './firebase/cajaFirestore';
import { obtenerFirebase } from './firebase/client';
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

/** Dependencias de una sesión de usuario. Se crea al iniciar sesión, se descarta al salir. */
export interface Contenedor {
  uid: string;
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

export function crearContenedor(uid: string, enLinea: () => boolean): Contenedor {
  const { db } = obtenerFirebase();
  const rutas = new Rutas(db, dataAppId(), uid);
  const ventas = new VentasFirestore(db, rutas);
  const cola = new ColaVentasPersistente(AsyncStorage, uid);
  const remotoFiado = new FiadoFirestore(db, rutas);
  const colaFiado = new ColaMovimientosPersistente(AsyncStorage, uid);
  const cache = new CacheCatalogo(AsyncStorage, uid);
  const sincronizadorFiado = new SincronizadorCola<OperacionMovimiento>(
    colaFiado,
    (op) => remotoFiado.confirmar(op),
    (op) => op.id,
    clasificadorFirebase,
  );
  const remotoCaja = new CajaFirestore(db, rutas);
  const colaCaja = new ColaCajaPersistente(AsyncStorage, uid);
  const sincronizadorCaja = new SincronizadorCola<OperacionCaja>(
    colaCaja,
    (op) => remotoCaja.confirmar(op),
    (op) => op.id,
    clasificadorFirebase,
  );
  return {
    uid,
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
    sincronizador: new SincronizadorVentas(ventas, cola, clasificadorFirebase),
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
