import AsyncStorage from '@react-native-async-storage/async-storage';

import { asegurarToken } from '@/data/contenedor';
import { clasificadorFirebase } from '@/data/firebase/errores';
import { escucharSeguro } from '@/data/firebase/repositorios';
import { ColaVentasPersistente } from '@/data/local/colaVentas';
import type { OperacionVenta } from '@/domain/rules/venta';
import { SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';

/** D-31: el bug del Samsung A24 (Firestore 13.3 roto tras pedir el token sin red). */
const ASERCION = new Error(
  'FIRESTORE (13.3.0) INTERNAL ASSERTION FAILED: Unexpected state (ID: 3c6b) CONTEXT: {"code":"auth/network-request-failed"}',
);
const TERMINADA = Object.assign(new Error('The client has already been terminated.'), {
  code: 'failed-precondition',
});

describe('clasificadorFirebase (D-31)', () => {
  it('reconoce la instancia rota y no la confunde con un error permanente', () => {
    expect(clasificadorFirebase.esInstanciaRota?.(ASERCION)).toBe(true);
    expect(clasificadorFirebase.esInstanciaRota?.(TERMINADA)).toBe(true);
    expect(clasificadorFirebase.esErrorPermanente(TERMINADA)).toBe(false);
    expect(clasificadorFirebase.esErrorPermanente({ code: 'permission-denied' })).toBe(true);
    expect(clasificadorFirebase.esInstanciaRota?.({ code: 'unavailable' })).toBe(false);
  });

  it('auth/network-request-failed es transitorio', () => {
    expect(clasificadorFirebase.esErrorPermanente({ code: 'auth/network-request-failed' })).toBe(
      false,
    );
  });
});

describe('asegurarToken (D-31)', () => {
  it('sin red el token vencido falla antes de abrir la transacción', async () => {
    const error = Object.assign(new Error('net'), { code: 'auth/network-request-failed' });
    const auth = { currentUser: { getIdToken: jest.fn().mockRejectedValue(error) } };
    await expect(asegurarToken(auth as never)).rejects.toBe(error);
  });

  it('sin usuario restaurado es un error transitorio', async () => {
    await expect(asegurarToken({ currentUser: null })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
});

describe('escucharSeguro (D-31)', () => {
  it('suscribirse o cancelar sobre una instancia rota no lanza', () => {
    const onError = jest.fn();
    const cancelar = escucharSeguro(() => {
      throw ASERCION;
    }, onError);
    expect(onError).toHaveBeenCalledWith(ASERCION);
    expect(() => cancelar()).not.toThrow();

    const cancelar2 = escucharSeguro(
      () => () => {
        throw ASERCION;
      },
      onError,
    );
    expect(() => cancelar2()).not.toThrow();
  });
});

describe('venta atascada en vuelo (escenario del dispositivo)', () => {
  beforeEach(() => AsyncStorage.clear());

  it('"Sincronizar ahora" reenvía, detecta la instancia rota y, recreada, sincroniza', async () => {
    const cola = new ColaVentasPersistente(AsyncStorage, 'u1');
    const op = { ventaId: 'v1', creadaEn: 1, deltasStock: [], venta: { total: 5 } };
    await cola.agregar(op as unknown as OperacionVenta);

    // Instancia rota: la primera transacción nunca termina, las siguientes lanzan la aserción.
    let llamadas = 0;
    const rota = new SincronizadorVentas(
      {
        confirmar: () => {
          llamadas += 1;
          if (llamadas === 1) return new Promise(() => undefined);
          throw ASERCION;
        },
      },
      cola,
      clasificadorFirebase,
      20,
    );
    expect(await rota.sincronizar()).toMatchObject({ pendientes: 1, interrumpida: true });
    const forzada = await rota.sincronizar({ forzar: true });
    expect(forzada).toMatchObject({ pendientes: 1, instanciaRota: true });
    expect((await cola.listar())[0]).toMatchObject({ bloqueada: false });

    // Contenedor nuevo sobre la instancia recreada.
    const nueva = new SincronizadorVentas(
      { confirmar: () => Promise.resolve('escrita' as const) },
      cola,
      clasificadorFirebase,
      20,
    );
    expect(await nueva.sincronizar({ forzar: true })).toMatchObject({
      sincronizadas: 1,
      pendientes: 0,
    });
  });
});
