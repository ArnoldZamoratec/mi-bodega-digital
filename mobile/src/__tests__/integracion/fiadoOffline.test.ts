import AsyncStorage from '@react-native-async-storage/async-storage';

import { clasificadorFirebase } from '@/data/firebase/errores';
import { CacheCatalogo } from '@/data/local/cacheCatalogo';
import { ColaMovimientosPersistente, ColaVentasPersistente } from '@/data/local/colaVentas';
import { FiadoOffline } from '@/data/local/fiadoOffline';
import { BaseDatosMemoria, FiadoMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import type { MovimientoFiado } from '@/domain/entities';
import { agregarAlCarrito } from '@/domain/rules/carrito';
import { calcularSaldo, type OperacionMovimiento } from '@/domain/rules/fiado';
import { registrarAbono, registrarCargo } from '@/domain/usecases/fiado';
import { registrarVenta } from '@/domain/usecases/registrarVenta';
import { SincronizadorCola, SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';

/** Integración D-24: decorador offline + outbox persistente + repositorio con semántica Firestore. */
function montar(uid = 'u1') {
  const db = new BaseDatosMemoria();
  const remoto = new FiadoMemoria(db);
  const cola = new ColaMovimientosPersistente(AsyncStorage, uid);
  const colaVentas = new ColaVentasPersistente(AsyncStorage, uid);
  const sincronizador = new SincronizadorCola<OperacionMovimiento>(
    cola,
    (op) => remoto.confirmar(op),
    (op) => op.id,
    clasificadorFirebase,
    50,
  );
  let enLinea = true;
  const fiado = new FiadoOffline({
    remoto,
    cola,
    colaVentas,
    sincronizar: () => sincronizador.sincronizar(),
    enLinea: () => enLinea,
    ahora: () => new Date(2026, 0, 15, 10).getTime(),
  });
  return {
    db,
    remoto,
    cola,
    colaVentas,
    sincronizador,
    fiado,
    setEnLinea: (v: boolean) => (enLinea = v),
  };
}

/** Última emisión de `observarCliente` (espera a que lleguen las suscripciones a la cola). */
async function movimientosDe(fiado: FiadoOffline, clienteId: string): Promise<MovimientoFiado[]> {
  let ultimo: MovimientoFiado[] = [];
  const cancelar = fiado.observarCliente(
    clienteId,
    (m) => (ultimo = m),
    () => undefined,
  );
  await new Promise((r) => setTimeout(r, 0));
  cancelar();
  return ultimo;
}

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('fiado sin conexión', () => {
  it('el pago se guarda en el teléfono, cuenta en el saldo y sube al volver la red', async () => {
    const { db, cola, sincronizador, fiado, setEnLinea } = montar();
    db.deudas.set('c1', {
      id: 'c1',
      clienteId: 'cli',
      monto: 20,
      descripcion: 'Arroz',
      fecha: new Date(2026, 0, 10),
      pagado: false,
    });
    db.modo = 'sin-red';
    setEnLinea(false);

    const id = await registrarAbono(fiado, {
      clienteId: 'cli',
      monto: 5,
      descripcion: 'Pago',
      metodoPago: 'Efectivo',
    });

    expect(db.deudas.has(id)).toBe(false);
    const movs = await movimientosDe(fiado, 'cli');
    expect(movs.find((m) => m.id === id)).toMatchObject({ monto: -5, pendiente: true });
    expect(calcularSaldo(movs)).toBe(15);

    // Sobrevive a cerrar la app.
    expect(await new ColaMovimientosPersistente(AsyncStorage, 'u1').listar()).toHaveLength(1);

    db.modo = 'online';
    setEnLinea(true);
    const r = await sincronizador.sincronizar();
    expect(r).toMatchObject({ sincronizadas: 1, pendientes: 0 });
    expect(db.deudas.get(id)).toMatchObject({
      clienteId: 'cli',
      monto: -5,
      metodoPago: 'Efectivo',
      // D-26: la hora del teléfono al registrar el pago viaja con el movimiento.
      creadaEn: new Date(2026, 0, 15, 10),
    });
    expect(await cola.listar()).toEqual([]);

    // Ya confirmado: aparece una sola vez y sin la marca de pendiente.
    const despues = await movimientosDe(fiado, 'cli');
    expect(despues.filter((m) => m.id === id)).toEqual([
      expect.not.objectContaining({ pendiente: true }),
    ]);
    expect(calcularSaldo(despues)).toBe(15);
  });

  it('con red se envía de inmediato', async () => {
    const { db, cola, fiado } = montar();
    const id = await registrarCargo(fiado, 'cli', 8, 'Gaseosa');
    await new Promise((r) => setTimeout(r, 0));
    expect(db.deudas.get(id)).toMatchObject({ monto: 8, descripcion: 'Gaseosa' });
    expect(await cola.listar()).toEqual([]);
  });

  it('el cargo de una venta fiada pendiente ya cuenta en el saldo del cliente', async () => {
    const { db, colaVentas, fiado } = montar();
    db.productos.set('arroz', { id: 'arroz', nombre: 'Arroz', precio: 4, stock: null });
    db.modo = 'sin-red';
    const ventas = new VentasMemoria(db);
    await registrarVenta(
      {
        ventas,
        cola: colaVentas,
        sincronizador: new SincronizadorVentas(ventas, colaVentas, clasificadorFirebase, 50),
        enLinea: () => false,
      },
      {
        carrito: agregarAlCarrito([], { id: 'arroz', nombre: 'Arroz', precio: 4 }, 3),
        metodoDePago: 'Fiado',
        clienteId: 'cli',
      },
    );

    const movs = await movimientosDe(fiado, 'cli');
    expect(movs).toEqual([expect.objectContaining({ monto: 12, pendiente: true })]);
    expect(movs[0]?.ventaId).toBeDefined();
    expect(calcularSaldo(movs)).toBe(12);
  });

  it('borrar un movimiento que aún no se envió no toca el servidor', async () => {
    const { db, cola, fiado, setEnLinea } = montar();
    db.modo = 'sin-red';
    setEnLinea(false);
    const id = await registrarCargo(fiado, 'cli', 3, 'Pan');

    await fiado.eliminar(id);

    expect(await cola.listar()).toEqual([]);
    expect(await movimientosDe(fiado, 'cli')).toEqual([]);
  });

  it('reenviar un movimiento ya escrito no lo duplica', async () => {
    const { db, remoto } = montar();
    const op: OperacionMovimiento = {
      id: 'm1',
      tipo: 'cargo',
      datos: { clienteId: 'cli', monto: 2, descripcion: 'X', pagado: false },
      creadaEn: 0,
    };
    expect(await remoto.confirmar(op)).toBe('escrita');
    expect(await remoto.confirmar(op)).toBe('ya-existia');
    expect([...db.deudas.values()]).toHaveLength(1);
  });

  it('un error de permisos bloquea solo esa entrada', async () => {
    const { db, cola, sincronizador, fiado, setEnLinea } = montar();
    setEnLinea(false);
    await registrarCargo(fiado, 'cli', 3, 'Pan');
    db.modo = 'sin-permiso';

    await sincronizador.sincronizar();

    expect(await cola.listar()).toEqual([expect.objectContaining({ bloqueada: true })]);
  });

  it('al abrir la app sin red usa la última copia guardada más lo pendiente', async () => {
    const { db, remoto, cola, colaVentas } = montar();
    const cache = new CacheCatalogo(AsyncStorage, 'u1');
    db.deudas.set('c1', {
      id: 'c1',
      clienteId: 'cli',
      monto: 20,
      descripcion: 'Arroz',
      fecha: new Date(2026, 0, 10),
      pagado: false,
    });
    const deps = {
      cola,
      colaVentas,
      sincronizar: () => undefined,
      enLinea: () => false,
      cache,
    };

    // Sesión con red: guarda la copia confirmada.
    const conRed = new FiadoOffline({ ...deps, remoto });
    conRed.observarTodos(
      () => undefined,
      () => undefined,
    )();
    await new Promise((r) => setTimeout(r, 0));

    // Reinicio sin red: el servidor nunca responde.
    const sinRespuesta = Object.assign(Object.create(remoto) as typeof remoto, {
      observarCliente: () => () => undefined,
    });
    const sinRed = new FiadoOffline({ ...deps, remoto: sinRespuesta });
    await registrarAbono(sinRed, {
      clienteId: 'cli',
      monto: 5,
      descripcion: 'Pago',
      metodoPago: 'Yape/Plin',
    });

    const movs = await movimientosDe(sinRed, 'cli');
    expect(movs.find((m) => m.id === 'c1')?.fecha).toBeInstanceOf(Date);
    expect(calcularSaldo(movs)).toBe(15);
  });
});
