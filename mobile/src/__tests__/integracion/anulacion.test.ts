import AsyncStorage from '@react-native-async-storage/async-storage';

import { clasificadorFirebase } from '@/data/firebase/errores';
import { ColaVentasPersistente } from '@/data/local/colaVentas';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import { ErrorDominio } from '@/domain/errors';
import { idAnulacion } from '@/domain/rules/anulacion';
import { agregarAlCarrito } from '@/domain/rules/carrito';
import { calcularSaldo } from '@/domain/rules/fiado';
import { crearRango, generarReporte } from '@/domain/rules/reportes';
import { anularVenta, deshacerVenta } from '@/domain/usecases/anularVenta';
import { registrarVenta } from '@/domain/usecases/registrarVenta';
import { SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';

/** Integración: venta → anulación con la misma semántica transaccional que Firestore. */
function montar() {
  const db = new BaseDatosMemoria();
  db.productos.set('arroz', { id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 10 });
  db.productos.set('pan', { id: 'pan', nombre: 'Pan', precio: 0.3, stock: null });
  const ventas = new VentasMemoria(db);
  const cola = new ColaVentasPersistente(AsyncStorage, 'u-anula');
  const sincronizador = new SincronizadorVentas(ventas, cola, clasificadorFirebase, 50);
  let enLinea = true;
  const deps = { ventas, cola, sincronizador, enLinea: () => enLinea };
  return { db, ventas, cola, deps, setEnLinea: (v: boolean) => (enLinea = v) };
}

const carrito = agregarAlCarrito(
  agregarAlCarrito([], { id: 'arroz', nombre: 'Arroz', precio: 4.2 }, 2),
  { id: 'pan', nombre: 'Pan', precio: 0.3 },
  5,
);

const venta = (db: BaseDatosMemoria, id: string) => {
  const v = db.ventas.get(id);
  if (!v) throw new Error(`No existe la venta ${id}`);
  return v;
};

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('anular venta', () => {
  it('crea el contraasiento, devuelve el stock y deja el reporte en cero', async () => {
    const { db, ventas, deps } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    expect(db.productos.get('arroz')?.stock).toBe(8);

    await anularVenta({ ventas }, venta(db, r.operacion.ventaId), 'Cobro equivocado');

    expect(db.productos.get('arroz')?.stock).toBe(10);
    expect(db.productos.get('pan')?.stock).toBeNull();
    // La venta original se conserva (registro histórico) y se agrega su contraasiento.
    expect(db.ventas.has(r.operacion.ventaId)).toBe(true);
    expect(venta(db, idAnulacion(r.operacion.ventaId))).toMatchObject({
      total: -9.9,
      anulaA: r.operacion.ventaId,
      motivoAnulacion: 'Cobro equivocado',
    });

    const dia = db.reloj();
    const reporte = generarReporte([...db.ventas.values()], [], crearRango(dia, dia));
    expect(reporte.totalIngresos).toBe(0);
    expect(reporte.cantidadVentas).toBe(0);
  });

  it('una venta fiada anulada elimina su cargo y el cliente vuelve a deber 0', async () => {
    const { db, ventas, deps } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Fiado', clienteId: 'cli' });
    expect(calcularSaldo([...db.deudas.values()])).toBe(9.9);

    await anularVenta({ ventas }, venta(db, r.operacion.ventaId), 'El cliente devolvió');

    expect(calcularSaldo([...db.deudas.values()])).toBe(0);
  });

  it('no se puede anular dos veces (ni devolver stock dos veces)', async () => {
    const { db, ventas, deps } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    const original = venta(db, r.operacion.ventaId);

    await anularVenta({ ventas }, original, 'Otro');
    await expect(anularVenta({ ventas }, original, 'Otro')).rejects.toThrow(ErrorDominio);
    expect(db.productos.get('arroz')?.stock).toBe(10);
  });
});

describe('deshacer al momento', () => {
  it('venta sincronizada: se anula', async () => {
    const { db, ventas, cola, deps } = montar();
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });

    await deshacerVenta({ ventas, cola }, r.operacion);

    expect(db.ventas.has(idAnulacion(r.operacion.ventaId))).toBe(true);
    expect(db.productos.get('arroz')?.stock).toBe(10);
  });

  it('venta sin conexión: solo se quita del teléfono, nunca llega a la nube', async () => {
    const { db, ventas, cola, deps, setEnLinea } = montar();
    setEnLinea(false);
    const r = await registrarVenta(deps, { carrito, metodoDePago: 'Efectivo', clienteId: null });
    expect(await cola.listar()).toHaveLength(1);

    await deshacerVenta({ ventas, cola }, r.operacion);

    expect(await cola.listar()).toEqual([]);
    expect(db.ventas.size).toBe(0);
    expect(db.productos.get('arroz')?.stock).toBe(10);
  });
});
