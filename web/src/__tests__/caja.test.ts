import type { MovimientoFiado, Venta } from '@bodegon/core';
import {
  armarApertura,
  armarCierre,
  armarMovimientoCaja,
  resumenCaja,
  type Caja,
  type MovimientoCaja,
  type OperacionCaja,
} from '@bodegon/core/rules/caja';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FuenteDatos } from '../datos';
import {
  horaLima,
  leerMonto,
  lineaHoyCaja,
  mensajeArqueo,
  periodoCaja,
  rangoVentasCaja,
  textoDiferencia,
  tonoArqueo,
  totalConteo,
  vistaCaja,
} from '../logic/caja';
import { aCaja, aMovimientoCaja, escrituraCaja } from '../mappersCaja';

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));

const datosMod = await import('../datos');
const cajaVista = await import('../views/caja');
const hoyVista = await import('../views/hoy');

// 15/11/2026 en Lima (UTC−5): 08:05 = 13:05Z.
const lima = (h: number, m = 0, dia = 15) => new Date(Date.UTC(2026, 10, dia, h + 5, m));
const AHORA = lima(18, 30);

const abierta: Caja = {
  id: 'c1',
  estado: 'abierta',
  apertura: { monto: 50, fecha: lima(8, 5), creadaEn: lima(8, 5) },
};
const venta = (id: string, total: number, metodoDePago: Venta['metodoDePago'], fecha: Date): Venta => ({
  id,
  items: [{ id: 'p', nombre: 'Pan', precio: total, cantidad: 1 }],
  total,
  metodoDePago,
  clienteId: null,
  fecha,
});
const ventas: Venta[] = [
  venta('v1', 10.1, 'Efectivo', lima(9)),
  venta('v2', 20.2, 'Efectivo', lima(10)),
  venta('v3', 30, 'Yape/Plin', lima(11)),
  venta('v0', 99, 'Efectivo', lima(7)), // antes de abrir: no cuenta
];
const abonos: MovimientoFiado[] = [
  { id: 'a1', clienteId: 'x', monto: -5, descripcion: 'Abono', fecha: lima(12), pagado: false, metodoPago: 'Efectivo' },
  { id: 'a2', clienteId: 'x', monto: -7, descripcion: 'Abono', fecha: lima(12), pagado: false, metodoPago: 'Yape/Plin' },
];
const movsCaja: MovimientoCaja[] = [
  { id: 'm1', cajaId: 'c1', tipo: 'egreso', monto: 18, motivo: 'Pan', fecha: lima(8, 40) },
  { id: 'm2', cajaId: 'c1', tipo: 'ingreso', monto: 20, motivo: 'Sencillo', fecha: lima(9, 15) },
];

describe('lógica de caja (web)', () => {
  it('el esperado es exactamente el de resumenCaja del core', () => {
    const v = vistaCaja(
      { cajas: [abierta], cajaVivo: { cajaId: 'c1', movimientos: movsCaja, ventas }, movimientos: abonos },
      AHORA,
    );
    const core = resumenCaja({ caja: abierta, ventas, movimientosFiado: abonos, movimientosCaja: movsCaja, ahora: AHORA });
    expect(v.resumen).toEqual(core);
    // 50 + 30.30 + 5 + 20 − 18
    expect(v.resumen?.esperado).toBe(87.3);
    expect(v.movimientos.map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('sin movimientos, ventas o cuaderno todavía: resumen null (esqueleto), no un cero falso', () => {
    const base = { cajas: [abierta], movimientos: abonos };
    expect(vistaCaja({ ...base, cajaVivo: null }, AHORA).resumen).toBeNull();
    expect(vistaCaja({ ...base, cajaVivo: { cajaId: 'c1', movimientos: [], ventas: null } }, AHORA).resumen).toBeNull();
    expect(vistaCaja({ ...base, cajaVivo: { cajaId: 'otra', movimientos: [], ventas: [] } }, AHORA).resumen).toBeNull();
    expect(vistaCaja({ cajas: null, cajaVivo: null, movimientos: null }, AHORA).cargando).toBe(true);
  });

  it('historial: solo cerradas, la más reciente primero', () => {
    const cerrada = (id: string, dia: number): Caja => ({
      id,
      estado: 'cerrada',
      apertura: { monto: 0, fecha: lima(8, 0, dia) },
      cierre: { contado: 1, esperado: 1, diferencia: 0, fecha: lima(21, 0, dia) },
    });
    const v = vistaCaja({ cajas: [cerrada('a', 12), abierta, cerrada('b', 14)], cajaVivo: null, movimientos: [] }, AHORA);
    expect(v.historial.map((c) => c.id)).toEqual(['b', 'a']);
    expect(v.abierta?.id).toBe('c1');
    expect(periodoCaja(cerrada('b', 14))).toBe('sáb 14 · 8:00 a 21:00');
  });

  it('rango de ventas: desde el día de la apertura (Lima) hasta hoy; cruza la medianoche', () => {
    const r = rangoVentasCaja({ ...abierta, apertura: { monto: 0, fecha: lima(22, 0, 14) } }, AHORA);
    expect(r.inicio.toISOString()).toBe('2026-11-14T05:00:00.000Z');
    expect(r.fin.toISOString()).toBe('2026-11-16T04:59:59.999Z');
    // Reloj atrasado respecto de la apertura: solo ese día.
    const r2 = rangoVentasCaja(abierta, lima(10, 0, 14));
    expect(r2.inicio.toISOString()).toBe('2026-11-15T05:00:00.000Z');
  });

  it('arqueo: tono tranquilo; ladrillo solo con faltante de más de S/ 1', () => {
    expect(tonoArqueo(0)).toBe('cuadra');
    expect(tonoArqueo(2)).toBe('sobrante');
    expect(tonoArqueo(-0.5)).toBe('faltante-leve');
    expect(tonoArqueo(-1)).toBe('faltante-leve');
    expect(tonoArqueo(-1.01)).toBe('faltante');
    const m = mensajeArqueo(10.1, 10.3);
    expect(m.diferencia).toBe(-0.2);
    expect(m.titulo).toBe('Faltan S/ 0.20');
    expect(mensajeArqueo(90, 87.3).titulo).toBe('Sobran S/ 2.70');
    expect(mensajeArqueo(87.3, 87.3).titulo).toBe('Cuadra exacto');
    for (const t of [mensajeArqueo(70, 87.3), mensajeArqueo(90, 87.3)]) {
      expect(t.detalle).not.toMatch(/robo|culpa|error tuyo/i);
    }
    expect(textoDiferencia(-8)).toBe('Faltante S/ 8.00');
    expect(textoDiferencia(2)).toBe('Sobrante S/ 2.00');
    expect(textoDiferencia(0)).toBe('Cuadra');
  });

  it('textos de hora y la línea de Hoy', () => {
    expect(horaLima(lima(8, 5))).toBe('8:05');
    expect(horaLima(lima(20, 10))).toBe('20:10');
    expect(lineaHoyCaja(abierta, null, AHORA)).toBe('Caja abierta desde 8:05');
    const r = resumenCaja({ caja: abierta, ventas, movimientosFiado: abonos, movimientosCaja: movsCaja, ahora: AHORA });
    expect(lineaHoyCaja(abierta, r, AHORA)).toBe('Caja abierta desde 8:05 · debería haber S/ 87.30');
    const deAyer = { ...abierta, apertura: { monto: 0, fecha: lima(20, 10, 14) } };
    expect(lineaHoyCaja(deAyer, null, AHORA)).toBe('Caja abierta desde ayer 20:10');
  });

  it('conteo de billetes y monedas en céntimos exactos', () => {
    expect(totalConteo({ '0.1': 3 })).toBe(0.3);
    expect(totalConteo({ '200': 1, '20': 2, '0.5': 3, '0.2': 1 })).toBe(241.7);
    expect(totalConteo({ '10': -2, '5': 1.5, '1': Number.NaN })).toBe(0);
  });

  it('leerMonto: vacío solo es cero en la apertura; acepta "S/"', () => {
    expect(leerMonto('', true)).toBe(0);
    expect(leerMonto('')).toBeNaN();
    expect(leerMonto('S/ 12,50')).toBe(12.5);
    expect(leerMonto('abc')).toBeNaN();
  });
});

describe('Firestore: forma exacta que aceptan las reglas (firestore.rules /cajas)', () => {
  const SELLO = { servidor: true };
  const HORA = { telefono: 1 };
  const claves = (o: object) => Object.keys(o).sort();

  it('apertura: { estado, apertura{monto, fecha=serverTimestamp, creadaEn} } y sin `origen`', () => {
    const op = armarApertura([], 'c9', 50.5, 1_000);
    const w = escrituraCaja(op, SELLO, HORA);
    expect(w.tipo).toBe('crear-caja');
    if (w.tipo !== 'crear-caja') return;
    expect(w.cajaId).toBe('c9');
    expect(claves(w.datos)).toEqual(['apertura', 'estado']);
    expect(w.datos.estado).toBe('abierta');
    expect(claves(w.datos.apertura)).toEqual(['creadaEn', 'fecha', 'monto']);
    expect(w.datos.apertura).toEqual({ monto: 50.5, fecha: SELLO, creadaEn: HORA });
  });

  it('movimiento: solo tipo, monto, motivo (1–80), fecha y creadaEn', () => {
    const op = armarMovimientoCaja(abierta, 'm9', 'egreso', 7, `  Pago   al ${'x'.repeat(100)}`, 1_000);
    const w = escrituraCaja(op, SELLO, HORA);
    expect(w.tipo).toBe('crear-movimiento');
    if (w.tipo !== 'crear-movimiento') return;
    expect(w.movimientoId).toBe('m9');
    expect(claves(w.datos)).toEqual(['creadaEn', 'fecha', 'monto', 'motivo', 'tipo']);
    expect(w.datos.motivo.length).toBe(80);
    expect(w.datos.motivo.startsWith('Pago al x')).toBe(true);
    expect(w.datos.monto).toBeGreaterThan(0);
  });

  it('cierre: cambia solo estado y cierre; diferencia = contado − esperado (± medio céntimo)', () => {
    for (const [contado, esperado] of [
      [10.1, 10.3],
      [58, 60],
      [87.3, 87.3],
      [412.8, 0.1],
    ] as const) {
      const op = armarCierre(abierta, contado, esperado, 1_000);
      const w = escrituraCaja(op, SELLO, HORA);
      expect(w.tipo).toBe('cerrar-caja');
      if (w.tipo !== 'cerrar-caja') return;
      expect(claves(w.datos)).toEqual(['cierre', 'estado']);
      expect(w.datos.estado).toBe('cerrada');
      expect(claves(w.datos.cierre)).toEqual(['contado', 'creadaEn', 'diferencia', 'esperado', 'fecha']);
      const c = w.datos.cierre;
      expect(Math.abs(c.contado - c.esperado - c.diferencia)).toBeLessThan(0.005);
      expect(c.contado).toBeGreaterThanOrEqual(0);
      expect(c.fecha).toBe(SELLO);
    }
  });

  it('lectura tolerante: estado raro = cerrada; fechas Timestamp', () => {
    const ts = (iso: string) => ({ toDate: () => new Date(iso) });
    expect(aCaja('x', { estado: '???', apertura: {} }).estado).toBe('cerrada');
    const c = aCaja('y', {
      estado: 'cerrada',
      apertura: { monto: '50', fecha: ts('2026-11-15T13:05:00Z') },
      cierre: { contado: 58, esperado: 60, diferencia: -2, fecha: null, creadaEn: ts('2026-11-16T02:00:00Z') },
    });
    expect(c.apertura).toEqual({ monto: 50, fecha: new Date('2026-11-15T13:05:00Z') });
    expect(c.cierre?.creadaEn?.toISOString()).toBe('2026-11-16T02:00:00.000Z');
    expect(aMovimientoCaja('c', 'm', { tipo: 'raro', monto: 3, motivo: 1 })).toMatchObject({
      tipo: 'ingreso',
      motivo: '',
      monto: 3,
      fecha: null,
    });
  });
});

// ---------- Pantalla ----------
function fuenteFalsa(guardarCaja: FuenteDatos['guardarCaja']): FuenteDatos {
  let n = 0;
  return {
    nuevoIdVenta: () => `v${++n}`,
    nuevoIdCargo: () => `d${++n}`,
    cobrar: vi.fn(async () => undefined),
    deshacerVenta: vi.fn(async () => undefined),
    guardarProducto: vi.fn(async () => undefined),
    eliminarProducto: vi.fn(async () => undefined),
    ajustarStock: vi.fn(async () => undefined),
    guardarCliente: vi.fn(async () => 'nuevo'),
    registrarMovimiento: vi.fn(async () => undefined),
    eliminarMovimiento: vi.fn(async () => undefined),
    marcarRecordatorio: vi.fn(async () => undefined),
    observarRango: vi.fn(() => () => undefined),
    nuevoIdCaja: () => `caja${++n}`,
    nuevoIdMovimientoCaja: () => `mc${++n}`,
    guardarCaja,
    observarMovimientosCaja: vi.fn(() => () => undefined),
    cerrarSesion: vi.fn(async () => undefined),
  };
}

const esperarTareas = () => new Promise((r) => setTimeout(r, 0));
const enLinea = (v: boolean) => vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(v);

describe('pantalla Caja', () => {
  let guardar: ReturnType<typeof vi.fn<FuenteDatos['guardarCaja']>>;
  let raiz: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(AHORA);
    document.body.innerHTML = '<section id="v"></section><div id="aviso" hidden></div>';
    datosMod.reiniciarDatos();
    cajaVista.reiniciarCaja();
    guardar = vi.fn<FuenteDatos['guardarCaja']>(async () => undefined);
    datosMod.usarFuente(fuenteFalsa(guardar));
    raiz = document.getElementById('v')!;
    cajaVista.montarCaja(raiz);
    enLinea(true);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const pintar = () => cajaVista.renderCaja(datosMod.datos());

  it('sin caja abierta: estado vacío con atajos y "Abrir caja"; guarda la apertura del core', async () => {
    datosMod.actualizarDatos({ cajas: [], movimientos: [] });
    pintar();
    expect(raiz.textContent).toContain('Abre la caja con el efectivo con el que empiezas');
    (raiz.querySelector('[data-atajo="100"]') as HTMLButtonElement).click();
    expect((raiz.querySelector('#monto-inicial') as HTMLInputElement).value).toBe('100');
    const form = raiz.querySelector('#form-apertura') as HTMLFormElement;
    form.requestSubmit();
    form.requestSubmit(); // doble clic: una sola escritura
    await esperarTareas();
    expect(guardar).toHaveBeenCalledTimes(1);
    const op = guardar.mock.calls[0]![0] as OperacionCaja;
    expect(op).toMatchObject({ tipo: 'abrir', monto: 100, cajaId: op.id });
  });

  it('sin internet: no escribe y lo dice con el mismo tono que Vender', async () => {
    datosMod.actualizarDatos({ cajas: [], movimientos: [] });
    pintar();
    enLinea(false);
    (raiz.querySelector('#form-apertura') as HTMLFormElement).requestSubmit();
    await esperarTareas();
    expect(guardar).not.toHaveBeenCalled();
    expect(raiz.querySelector('#error-apertura')?.textContent).toContain('Sin internet');
  });

  it('un reintento tras un fallo reutiliza el mismo id (idempotente)', async () => {
    guardar.mockRejectedValueOnce(new Error('unavailable'));
    datosMod.actualizarDatos({ cajas: [], movimientos: [] });
    pintar();
    (raiz.querySelector('#monto-inicial') as HTMLInputElement).value = '50';
    const form = raiz.querySelector('#form-apertura') as HTMLFormElement;
    form.requestSubmit();
    await esperarTareas();
    expect(raiz.querySelector<HTMLElement>('#error-apertura')?.hidden).toBe(false);
    form.requestSubmit();
    await esperarTareas();
    expect(guardar).toHaveBeenCalledTimes(2);
    expect(guardar.mock.calls[0]![0].id).toBe(guardar.mock.calls[1]![0].id);
  });

  it('caja abierta: "Debería haber", desglose, movimientos y cierre con faltante en ladrillo', async () => {
    datosMod.actualizarDatos({
      cajas: [abierta],
      movimientos: abonos,
      cajaVivo: { cajaId: 'c1', movimientos: movsCaja, ventas },
    });
    pintar();
    expect(raiz.querySelector('#caja-esperado')?.textContent).toBe('S/ 87.30');
    expect(raiz.querySelector('#caja-desde')?.textContent).toContain('Abierta desde 8:05');
    expect(raiz.querySelectorAll('.desglose-fila')).toHaveLength(6);
    expect(raiz.querySelectorAll('.caja-mov')).toHaveLength(2);

    // Ingreso/egreso con motivo
    (raiz.querySelector('[data-abrir-mov]') as HTMLButtonElement).click();
    const formMov = raiz.querySelector('#form-mov') as HTMLFormElement;
    expect((formMov.querySelector('[name="motivo"]') as HTMLInputElement).maxLength).toBe(80);
    (formMov.querySelector('[name="monto"]') as HTMLInputElement).value = '5';
    formMov.requestSubmit();
    await esperarTareas();
    expect(guardar).not.toHaveBeenCalled(); // falta el motivo (MOTIVO_VACIO del core)
    expect(raiz.querySelector('#error-mov')?.textContent).toContain('motivo');
    (formMov.querySelector('[name="motivo"]') as HTMLInputElement).value = 'Bolsas';
    formMov.requestSubmit();
    await esperarTareas();
    expect(guardar.mock.calls[0]![0]).toMatchObject({
      tipo: 'movimiento',
      cajaId: 'c1',
      movimiento: { tipo: 'egreso', monto: 5, motivo: 'Bolsas' },
    });

    // Cierre: panel en la página
    (raiz.querySelector('[data-abrir-cierre]') as HTMLButtonElement).click();
    const contado = raiz.querySelector('#contado') as HTMLInputElement;
    const confirmar = raiz.querySelector('#btn-confirmar-cierre') as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
    contado.value = '86.80';
    contado.dispatchEvent(new Event('input', { bubbles: true }));
    expect(raiz.querySelector('#arqueo')?.className).toBe('arqueo arqueo-faltante-leve');
    contado.value = '80';
    contado.dispatchEvent(new Event('input', { bubbles: true }));
    expect(raiz.querySelector('#arqueo')?.className).toBe('arqueo arqueo-faltante');
    expect(raiz.querySelector('#arqueo')?.textContent).toContain('Faltan S/ 7.30');
    // Ayuda de conteo: escribe el total en "Efectivo contado"
    const cien = raiz.querySelector('[data-denom="50"]') as HTMLInputElement;
    cien.value = '2';
    cien.dispatchEvent(new Event('input', { bubbles: true }));
    expect(contado.value).toBe('100.00');
    expect(raiz.querySelector('#arqueo')?.textContent).toContain('Sobran S/ 12.70');
    expect(confirmar.disabled).toBe(false);
    confirmar.click();
    await esperarTareas();
    expect(guardar.mock.calls[1]![0]).toMatchObject({
      tipo: 'cerrar',
      id: 'c1-cierre',
      cierre: { contado: 100, esperado: 87.3, diferencia: 12.7 },
    });
  });

  it('cajaVivo: escucha movimientos y ventas solo con caja abierta, una vez por caja', async () => {
    const vivo = await import('../cajaVivo');
    vivo.reiniciarCajaVivo();
    const f = fuenteFalsa(guardar);
    const cancelarMovs = vi.fn();
    f.observarMovimientosCaja = vi.fn((_id, onDatos) => {
      onDatos(movsCaja);
      return cancelarMovs;
    });
    f.observarRango = vi.fn((_r, onDatos) => {
      onDatos(ventas, []);
      return () => undefined;
    });
    datosMod.usarFuente(f);
    datosMod.actualizarDatos({ cajas: [abierta], movimientos: abonos });
    vivo.sincronizarCajaVivo();
    vivo.sincronizarCajaVivo();
    expect(f.observarMovimientosCaja).toHaveBeenCalledTimes(1);
    expect(f.observarRango).toHaveBeenCalledTimes(1);
    expect(datosMod.datos().cajaVivo).toEqual({ cajaId: 'c1', movimientos: movsCaja, ventas });
    datosMod.actualizarDatos({ cajas: [{ ...abierta, estado: 'cerrada' }] });
    vivo.sincronizarCajaVivo();
    expect(cancelarMovs).toHaveBeenCalled();
    expect(datosMod.datos().cajaVivo).toBeNull();
  });

  it('Hoy: línea discreta con la caja abierta, o enlace "Abrir caja"', () => {
    document.body.innerHTML = '<section id="h"></section>';
    const h = document.getElementById('h')!;
    hoyVista.montarHoy(h);
    datosMod.actualizarDatos({
      cajas: [abierta],
      movimientos: abonos,
      clientes: [],
      productos: [],
      cajaVivo: { cajaId: 'c1', movimientos: movsCaja, ventas },
    });
    hoyVista.renderHoy(datosMod.datos());
    expect(h.querySelector('.hoy-caja')?.textContent).toContain('Caja abierta desde 8:05 · debería haber S/ 87.30');
    datosMod.actualizarDatos({ cajas: [], cajaVivo: null });
    hoyVista.renderHoy(datosMod.datos());
    expect(h.querySelector('.hoy-caja')?.textContent?.trim()).toBe('Abrir caja');
    expect(h.querySelector('.hoy-caja')?.getAttribute('href')).toBe('#caja');
  });
});
