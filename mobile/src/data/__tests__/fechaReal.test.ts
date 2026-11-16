import { escucharUnion } from '@/data/firebase/repositorios';
import type { Venta } from '@/domain/entities';
import { crearRango, generarReporte, resumenVentas } from '@/domain/rules/reportes';

/**
 * D-32 (bug real): venta cobrada sin conexión el 2/11 y sincronizada el 15/11. Antes caía en
 * "Vendido hoy" del 15 (D-26 la mandaba a `fecha` por tener más de 3 días).
 */
const venta = (id: string, total: number, fecha: Date, creadaEn?: Date): Venta => ({
  id,
  items: [{ id: 'p', nombre: 'Pan', precio: total, cantidad: 1 }],
  total,
  metodoDePago: 'Efectivo',
  clienteId: null,
  fecha,
  ...(creadaEn ? { creadaEn } : {}),
});

const hoy = crearRango(new Date(2026, 10, 15), new Date(2026, 10, 15));
const dia2 = crearRango(new Date(2026, 10, 2), new Date(2026, 10, 2));
const sync = new Date(2026, 10, 15, 9, 0);
const vieja = venta('vieja', 40, sync, new Date(2026, 10, 2, 18, 30));
const deHoy = venta('hoy', 10, new Date(2026, 10, 15, 8, 0));

/** Dos "consultas" controladas a mano (por `fecha` y por `creadaEn`). */
function dosConsultas() {
  const emisores: ((d: Venta[]) => void)[] = [];
  const cancelados: number[] = [];
  const suscripciones = [0, 1].map((i) => (emitir: (d: Venta[]) => void) => {
    emisores[i] = emitir;
    return () => cancelados.push(i);
  });
  return { suscripciones, emisores, cancelados };
}

describe('consultas por fecha y por creadaEn (D-32)', () => {
  it('creada hace 13 días y sincronizada hoy: no entra en el total de hoy', () => {
    const { suscripciones, emisores, cancelados } = dosConsultas();
    const recibido: Venta[][] = [];
    const cancelar = escucharUnion(suscripciones, hoy, (d) => recibido.push(d));

    emisores[0]?.([vieja, deHoy]); // por `fecha`: ambas llegaron hoy al servidor
    expect(recibido).toEqual([]); // espera a las dos consultas
    emisores[1]?.([deHoy]); // por `creadaEn`
    expect(recibido.at(-1)?.map((v) => v.id)).toEqual(['hoy']);
    expect(resumenVentas(recibido.at(-1) ?? [], [], hoy)).toEqual({ total: 10, cantidad: 1 });

    cancelar();
    expect(cancelados).toEqual([0, 1]);
  });

  it('el reporte del día real la encuentra por creadaEn', () => {
    const { suscripciones, emisores } = dosConsultas();
    let datos: Venta[] = [];
    escucharUnion(suscripciones, dia2, (d) => (datos = d));
    emisores[0]?.([]); // nada con `fecha` el 2/11
    emisores[1]?.([vieja]);
    expect(generarReporte(datos, [], dia2)).toMatchObject({ totalEfectivo: 40, cantidadVentas: 1 });
  });

  it('reloj adelantado y creadaEn absurdo cuentan el día del servidor', () => {
    const { suscripciones, emisores } = dosConsultas();
    let datos: Venta[] = [];
    escucharUnion(suscripciones, hoy, (d) => (datos = d));
    const adelantada = venta('adel', 7, sync, new Date(2026, 10, 16, 9, 0));
    const absurda = venta('abs', 3, sync, new Date(2000, 0, 1));
    emisores[0]?.([adelantada, absurda]);
    emisores[1]?.([]);
    expect(resumenVentas(datos, [], hoy)).toEqual({ total: 10, cantidad: 2 });
  });
});
