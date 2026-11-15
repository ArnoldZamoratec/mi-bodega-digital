import AsyncStorage from '@react-native-async-storage/async-storage';

import { clasificadorFirebase } from '@/data/firebase/errores';
import { CacheCatalogo } from '@/data/local/cacheCatalogo';
import { CajaOffline, ColaCajaPersistente } from '@/data/local/cajaOffline';
import { CajaMemoria } from '@/data/memoria/cajaMemoria';
import { BaseDatosMemoria } from '@/data/memoria/repositoriosMemoria';
import {
  cajaAbierta,
  historialCajas,
  type Caja,
  type MovimientoCaja,
  type OperacionCaja,
} from '@/domain/rules/caja';
import { abrirCaja, cerrarCaja, registrarMovimientoCaja } from '@/domain/usecases/caja';
import { SincronizadorCola } from '@/domain/usecases/sincronizarVentas';

/** Integración D-28: caja outbox-first + repositorio con semántica Firestore. */
function montar(uid = 'u1') {
  const db = new BaseDatosMemoria();
  const remoto = new CajaMemoria(db);
  const cola = new ColaCajaPersistente(AsyncStorage, uid);
  const sincronizador = new SincronizadorCola<OperacionCaja>(
    cola,
    (op) => remoto.confirmar(op),
    (op) => op.id,
    clasificadorFirebase,
    50,
  );
  let enLinea = true;
  const cache = new CacheCatalogo(AsyncStorage, uid);
  const caja = new CajaOffline({
    remoto,
    cola,
    sincronizar: () => sincronizador.sincronizar(),
    enLinea: () => enLinea,
    cache,
  });
  return {
    db,
    remoto,
    cola,
    sincronizador,
    caja,
    cache,
    setEnLinea: (v: boolean) => (enLinea = v),
  };
}

const esperar = () => new Promise((r) => setTimeout(r, 0));

async function cajasDe(caja: CajaOffline): Promise<Caja[]> {
  let ultimo: Caja[] = [];
  const cancelar = caja.observarCajas(
    (c) => (ultimo = c),
    () => undefined,
  );
  await esperar();
  cancelar();
  return ultimo;
}

async function movimientosDe(caja: CajaOffline, cajaId: string): Promise<MovimientoCaja[]> {
  let ultimo: MovimientoCaja[] = [];
  const cancelar = caja.observarMovimientos(
    cajaId,
    (m) => (ultimo = m),
    () => undefined,
  );
  await esperar();
  cancelar();
  return ultimo;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('caja sin conexión (D-28)', () => {
  it('abre, registra y cierra sin red; al volver la señal se sincroniza en orden y sin duplicar', async () => {
    const { db, remoto, caja, cola, sincronizador, setEnLinea } = montar();
    db.modo = 'sin-red';
    setEnLinea(false);

    const id = await abrirCaja(caja, [], 50);
    let cajas = await cajasDe(caja);
    expect(cajaAbierta(cajas)).toMatchObject({ id, pendiente: true });

    await registrarMovimientoCaja(caja, cajaAbierta(cajas), 'egreso', 12, 'Proveedor');
    expect((await movimientosDe(caja, id)).map((m) => [m.motivo, m.pendiente])).toEqual([
      ['Proveedor', true],
    ]);

    await cerrarCaja(caja, cajaAbierta(cajas), 38, 38);
    cajas = await cajasDe(caja);
    expect(cajaAbierta(cajas)).toBeUndefined();
    expect(historialCajas(cajas)[0]).toMatchObject({ id, pendiente: true });
    expect(remoto.cajas.size).toBe(0);

    // Vuelve la señal.
    db.modo = 'online';
    setEnLinea(true);
    const r = await sincronizador.sincronizar();
    expect(r).toMatchObject({ sincronizadas: 3, pendientes: 0 });
    expect(remoto.cajas.get(id)).toMatchObject({
      estado: 'cerrada',
      apertura: { monto: 50 },
      cierre: { contado: 38, esperado: 38, diferencia: 0 },
    });
    expect(remoto.movimientos.size).toBe(1);
    expect(await cola.listar()).toHaveLength(0);

    // Reenviar lo mismo (p. ej. tras un timeout) no duplica ni reabre.
    const escrituras = remoto.escrituras;
    for (const op of [
      { id, tipo: 'abrir', cajaId: id, monto: 50, creadaEn: 1 },
      {
        id: `${id}-cierre`,
        tipo: 'cerrar',
        cajaId: id,
        cierre: { contado: 1, esperado: 1, diferencia: 0 },
        creadaEn: 1,
      },
    ] as OperacionCaja[]) {
      expect(await remoto.confirmar(op)).toBe('ya-existia');
    }
    expect(remoto.escrituras).toBe(escrituras);
    expect((await cajasDe(caja))[0]).toMatchObject({ estado: 'cerrada' });
    expect((await cajasDe(caja))[0]?.pendiente).toBeUndefined();
  });

  it('con red, la operación se confirma al instante', async () => {
    const { remoto, caja } = montar();
    const id = await abrirCaja(caja, [], 20);
    await esperar();
    expect(remoto.cajas.get(id)?.estado).toBe('abierta');
  });

  it('sin permiso la operación queda bloqueada y visible, no se pierde', async () => {
    const { db, caja, cola, sincronizador } = montar();
    db.modo = 'sin-permiso';
    await abrirCaja(caja, [], 20);
    await sincronizador.sincronizar();
    const [entrada] = await cola.listar();
    expect(entrada?.bloqueada).toBe(true);
  });

  it('un movimiento en una caja ya cerrada en el servidor se rechaza (caja cerrada inmutable)', async () => {
    const { remoto } = montar();
    await remoto.confirmar({ id: 'c', tipo: 'abrir', cajaId: 'c', monto: 0, creadaEn: 1 });
    await remoto.confirmar({
      id: 'c-cierre',
      tipo: 'cerrar',
      cajaId: 'c',
      cierre: { contado: 0, esperado: 0, diferencia: 0 },
      creadaEn: 2,
    });
    await expect(
      remoto.confirmar({
        id: 'm',
        tipo: 'movimiento',
        cajaId: 'c',
        movimiento: { tipo: 'ingreso', monto: 1, motivo: 'x' },
        creadaEn: 3,
      }),
    ).rejects.toMatchObject({ code: 'permission-denied' });
  });

  it('al reabrir la app sin red muestra la última copia de cajas y movimientos', async () => {
    const primero = montar('u2');
    const id = await abrirCaja(primero.caja, [], 30);
    await registrarMovimientoCaja(
      primero.caja,
      cajaAbierta(await cajasDe(primero.caja)),
      'ingreso',
      10,
      'Sencillo',
    );
    await esperar();
    // Se guarda la caché al recibir datos del servidor.
    await cajasDe(primero.caja);
    await movimientosDe(primero.caja, id);

    // Nueva sesión: el servidor no responde (remoto vacío que nunca emite).
    const segundo = montar('u2');
    segundo.remoto.observarCajas = () => () => undefined;
    segundo.remoto.observarMovimientos = () => () => undefined;
    const cajas = await cajasDe(segundo.caja);
    const abiertaCache = cajaAbierta(cajas);
    expect(abiertaCache).toMatchObject({ id, apertura: { monto: 30 } });
    expect(abiertaCache?.apertura.fecha).toBeInstanceOf(Date);
    const movs = await movimientosDe(segundo.caja, id);
    expect(movs.map((m) => m.motivo)).toEqual(['Sencillo']);
    expect(movs[0]?.fecha).toBeInstanceOf(Date);
  });
});
