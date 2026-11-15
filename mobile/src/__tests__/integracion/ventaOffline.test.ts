import AsyncStorage from '@react-native-async-storage/async-storage';

import { clasificadorFirebase } from '@/data/firebase/errores';
import { ColaVentasPersistente } from '@/data/local/colaVentas';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import { agregarAlCarrito } from '@/domain/rules/carrito';
import { crearRango, generarReporte } from '@/domain/rules/reportes';
import { deltasPendientes } from '@/domain/rules/venta';
import { registrarVenta } from '@/domain/usecases/registrarVenta';
import { SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';

/**
 * Integración: caso de uso + sincronizador + outbox persistente (AsyncStorage mock)
 * + repositorio con la misma semántica transaccional que Firestore.
 */
function montar(uid = 'u1') {
  const db = new BaseDatosMemoria();
  db.productos.set('arroz', { id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 10 });
  db.productos.set('pan', { id: 'pan', nombre: 'Pan', precio: 0.3, stock: null });
  const ventas = new VentasMemoria(db);
  const cola = new ColaVentasPersistente(AsyncStorage, uid);
  const sincronizador = new SincronizadorVentas(ventas, cola, clasificadorFirebase, 50);
  let enLinea = true;
  const deps = { ventas, cola, sincronizador, enLinea: () => enLinea };
  return { db, ventas, cola, sincronizador, deps, setEnLinea: (v: boolean) => (enLinea = v) };
}

const carrito = agregarAlCarrito(
  agregarAlCarrito([], { id: 'arroz', nombre: 'Arroz', precio: 4.2 }, 2),
  { id: 'pan', nombre: 'Pan', precio: 0.3 },
  5,
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('venta online', () => {
  it('escribe venta y descuenta stock controlado', async () => {
    const { db, deps, cola } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });

    expect(r.estado).toBe('sincronizada');
    expect(db.ventas.get(r.operacion.ventaId)?.total).toBe(9.9);
    expect(db.productos.get('arroz')?.stock).toBe(8);
    expect(db.productos.get('pan')?.stock).toBeNull();
    expect(await cola.listar()).toEqual([]);
  });

  it('venta fiada crea el cargo vinculado', async () => {
    const { db, deps } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Fiado', clienteId: 'cli' });
    const cargo = db.deudas.get(r.operacion.cargoId!);
    expect(cargo).toMatchObject({ clienteId: 'cli', monto: 9.9, ventaId: r.operacion.ventaId });
  });
});

describe('venta sin conexión', () => {
  it('queda en el outbox, persiste y se sincroniza al volver la red', async () => {
    const { db, deps, cola, sincronizador, setEnLinea } = montar();
    setEnLinea(false);
    db.modo = 'sin-red';

    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Yape/Plin', clienteId: null });
    expect(r.estado).toBe('pendiente');
    expect(db.ventas.size).toBe(0);

    // El outbox sobrevive a "reiniciar la app" (nueva instancia, mismo almacenamiento).
    const colaReiniciada = new ColaVentasPersistente(AsyncStorage, 'u1');
    const pendientes = await colaReiniciada.listar();
    expect(pendientes).toHaveLength(1);
    expect(deltasPendientes(pendientes.map((e) => e.operacion)).get('arroz')).toBe(-2);

    // Intento con red pero servidor caído: se registra el intento, sigue pendiente.
    setEnLinea(true);
    const fallo = await sincronizador.sincronizar();
    expect(fallo).toMatchObject({ sincronizadas: 0, pendientes: 1, interrumpida: true });
    expect((await cola.listar())[0]?.intentos).toBe(1);

    db.modo = 'online';
    const ok = await sincronizador.sincronizar();
    expect(ok).toMatchObject({ sincronizadas: 1, pendientes: 0 });
    expect(db.productos.get('arroz')?.stock).toBe(8);
  });

  it('es idempotente: reintentar una venta ya escrita no descuenta stock dos veces', async () => {
    const { db, ventas, cola, sincronizador, deps, setEnLinea } = montar();
    setEnLinea(false);
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });

    // Simula: la escritura llegó al servidor pero la app murió antes de limpiar el outbox.
    await ventas.confirmar(r.operacion);
    expect(db.productos.get('arroz')?.stock).toBe(8);

    await sincronizador.sincronizar();
    expect(db.productos.get('arroz')?.stock).toBe(8);
    expect(ventas.escrituras).toBe(1);
    expect(await cola.listar()).toEqual([]);
  });

  it('timeout: la operación queda en vuelo y no se reenvía en paralelo', async () => {
    const { db, ventas, cola, sincronizador, deps, setEnLinea } = montar();
    setEnLinea(false);
    await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });

    db.modo = 'colgado';
    const r1 = await sincronizador.sincronizar();
    expect(r1.interrumpida).toBe(true);

    db.modo = 'online';
    const r2 = await sincronizador.sincronizar();
    expect(r2.sincronizadas).toBe(0);
    expect(ventas.escrituras).toBe(0);
    expect(await cola.listar()).toHaveLength(1);
  });

  it('error permanente bloquea solo esa venta y continúa con las demás', async () => {
    const { db, cola, sincronizador, deps, setEnLinea } = montar();
    setEnLinea(false);
    await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });

    db.modo = 'sin-permiso';
    const r = await sincronizador.sincronizar();
    expect(r.interrumpida).toBe(false);
    const entradas = await cola.listar();
    expect(entradas.every((e) => e.bloqueada)).toBe(true);
    expect(entradas[0]?.ultimoError).toBe('permission-denied');

    db.modo = 'online';
    expect((await sincronizador.sincronizar()).sincronizadas).toBe(0);
  });

  it('las llamadas concurrentes comparten una sola ejecución', async () => {
    const { ventas, sincronizador, deps, setEnLinea } = montar();
    setEnLinea(false);
    await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    const [a, b] = await Promise.all([sincronizador.sincronizar(), sincronizador.sincronizar()]);
    expect(a).toBe(b);
    expect(ventas.escrituras).toBe(1);
  });

  it('aísla el outbox por usuario', async () => {
    const u1 = montar('u1');
    u1.setEnLinea(false);
    await registrarVenta(u1.deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    expect(await new ColaVentasPersistente(AsyncStorage, 'u2').listar()).toEqual([]);
  });
});

describe('fecha de la venta sin conexión (D-26)', () => {
  it('cobrada a las 23:50 y sincronizada al día siguiente cuenta en el día del cobro', async () => {
    const { db, deps, ventas, sincronizador, setEnLinea } = montar();
    const cobro = new Date(2026, 0, 14, 23, 50);
    db.reloj = () => new Date(2026, 0, 15, 8, 30); // hora del servidor al sincronizar
    setEnLinea(false);
    db.modo = 'sin-red';
    const r = await registrarVenta(
      { ...deps, ahora: () => cobro.getTime() },
      { carrito, metodoDePago: 'Fiado', clienteId: 'cli' },
    );

    setEnLinea(true);
    db.modo = 'online';
    await sincronizador.sincronizar();

    expect(db.ventas.get(r.operacion.ventaId)?.creadaEn).toEqual(cobro);
    expect(db.deudas.get(r.operacion.cargoId!)?.creadaEn).toEqual(cobro);

    const dia14 = crearRango(cobro, cobro);
    const dia15 = crearRango(new Date(2026, 0, 15), new Date(2026, 0, 15));
    const observar = (rango: typeof dia14) => {
      let datos: Parameters<typeof generarReporte>[0] = [];
      ventas.observarRango(rango, (v) => (datos = v));
      return datos;
    };
    expect(observar(dia14).map((v) => v.id)).toEqual([r.operacion.ventaId]);
    expect(observar(dia15)).toEqual([]);
    expect(generarReporte(observar(dia14), [], dia14).totalFiado).toBe(9.9);
  });
});
