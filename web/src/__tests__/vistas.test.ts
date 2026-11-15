import type { MovimientoFiado, OperacionVenta } from '@bodegon/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FuenteDatos } from '../datos';

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));

const dom = await import('../dom');
const datosMod = await import('../datos');
const store = await import('../store');
const ticket = await import('../views/ticket');
const cobrar = await import('../views/cobrar');
const vender = await import('../views/vender');

const BASE = `
  <div id="app"><section id="v"></section></div>
  <div id="panel-fondo" hidden></div>
  <aside id="panel" hidden></aside>
  <div id="aviso" hidden></div>`;

const mov = (id: string, monto: number, dia: number, extra: Partial<MovimientoFiado> = {}): MovimientoFiado => ({
  id,
  clienteId: 'c1',
  monto,
  descripcion: id,
  fecha: new Date(Date.UTC(2026, 10, dia, 15)),
  pagado: false,
  ...extra,
});

function fuenteFalsa(extra: Partial<FuenteDatos> = {}): FuenteDatos {
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
    guardarCaja: vi.fn(async () => undefined),
    observarMovimientosCaja: vi.fn(() => () => undefined),
    cerrarSesion: vi.fn(async () => undefined),
    ...extra,
  };
}

beforeEach(() => {
  document.body.innerHTML = BASE;
  store.resetState();
  datosMod.reiniciarDatos();
  vender.reiniciarVender();
});

describe('esc (XSS)', () => {
  it('escapa HTML', () => {
    expect(dom.esc('<img src=x onerror=alert(1)>"\'&')).toBe('&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
    expect(dom.esc(null)).toBe('');
  });

  it('un nombre malicioso en el ticket se muestra como texto', () => {
    const html = ticket.ticketEnCurso([{ id: 'x"><b>', nombre: '<b>hack</b>', precio: 1, cantidad: 1 }], {
      negocio: '<i>Bodega</i>',
      ahora: new Date(),
    });
    const div = document.createElement('div');
    div.innerHTML = html;
    expect(div.querySelector('b')).toBeNull();
    expect(div.querySelector('i')).toBeNull();
    expect(div.textContent).toContain('<b>hack</b>');
  });

  it('un producto malicioso en el catálogo de Vender se muestra como texto', () => {
    datosMod.usarFuente(fuenteFalsa());
    vender.montarVender(document.getElementById('v')!);
    datosMod.actualizarDatos({ productos: [{ id: 'p', nombre: '<img src=x onerror=alert(1)>', precio: 1, stock: 3 }] });
    vender.renderVender(datosMod.datos());
    const v = document.getElementById('v')!;
    expect(v.querySelector('img')).toBeNull();
    expect(v.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('ticket', () => {
  it('total en céntimos con el core (0.1 + 0.2 + 0.1)', () => {
    store.addToCartState({ id: 'a', nombre: 'A', precio: 0.1 });
    store.addToCartState({ id: 'b', nombre: 'B', precio: 0.2 });
    store.addToCartState({ id: 'a', nombre: 'A', precio: 0.1 });
    const div = document.createElement('div');
    div.innerHTML = ticket.ticketEnCurso(store.getCart(), { negocio: 'X', ahora: new Date() });
    expect(div.querySelector('#ticket-total')?.textContent).toBe('S/ 0.40');
    expect(ticket.resumenUnidades(store.getCart())).toBe('3 productos');
  });

  it('impreso: muestra recibido y vuelto en efectivo; fiado muestra el cliente', () => {
    const base = {
      negocio: 'X',
      fecha: new Date('2026-11-15T20:00:00Z'),
      items: [{ id: 'a', nombre: 'Arroz', precio: 12.5, cantidad: 1 }],
      total: 12.5,
      sello: true,
    };
    const ef = ticket.ticketImpreso({ ...base, metodo: 'Efectivo', recibido: 20, vuelto: 7.5 });
    expect(ef).toContain('Venta registrada');
    expect(ef).toContain('S/ 7.50');
    expect(ef).toContain('15/11/2026 15:00');
    const fi = ticket.ticketImpreso({ ...base, metodo: 'Fiado', cliente: 'Rosa' });
    expect(fi).toContain('Fiado a');
    expect(fi).toContain('Rosa');
  });
});

describe('cuaderno del cliente (FIFO del core)', () => {
  const html = (movs: MovimientoFiado[]) => {
    const div = document.createElement('div');
    div.innerHTML = cobrar.htmlHistorial(movs);
    return div;
  };

  it('un cargo cubierto por abonos no ofrece "Cobrar este" y el parcial dice cuánto falta (B-01)', () => {
    const div = html([mov('Arroz', 10, 1), mov('Leche', 6, 2), mov('Abono', -12, 3, { metodoPago: 'Efectivo' })]);
    const botones = [...div.querySelectorAll<HTMLElement>('[data-liquidar]')];
    expect(botones.map((b) => b.dataset.liquidar)).toEqual(['Leche']);
    expect(div.textContent).toContain('Cubierto con abonos');
    expect(div.textContent).toContain('Falta S/ 4.00');
    expect(div.textContent).toContain('Abono en Efectivo');
  });

  it('respeta cargos heredados con pagado: true', () => {
    const div = html([mov('Viejo', 5, 1, { pagado: true })]);
    expect(div.querySelector('[data-liquidar]')).toBeNull();
    expect(div.textContent).toContain('Pagado');
  });

  it('descripciones maliciosas como texto', () => {
    const div = html([mov('<script>x</script>', 5, 1)]);
    expect(div.querySelector('script')).toBeNull();
  });
});

describe('Por cobrar', () => {
  const rosa = { id: 'c1', nombre: 'Rosa Quispe', telefono: '987 654 321' };
  const carmen = { id: 'c3', nombre: 'Carmen', telefono: '' };

  function montar(f = fuenteFalsa()) {
    datosMod.usarFuente(f);
    cobrar.montarCobrar(document.getElementById('v')!);
    datosMod.actualizarDatos({
      clientes: [rosa, carmen, { id: 'c9', nombre: 'Al día', telefono: '' }],
      movimientos: [mov('Arroz', 12.5, 1), mov('Pan', 3, 10, { clienteId: 'c3' })],
      nombreBodega: 'Bodega Don Lucho',
    });
    cobrar.renderCobrar(datosMod.datos());
    return f;
  }

  it('lista primero al que debe desde hace más tiempo, con total por cobrar', () => {
    montar();
    const v = document.getElementById('v')!;
    const nombres = [...v.querySelectorAll('.cuaderno .renglon-nombre')].map((n) => n.textContent);
    expect(nombres.slice(0, 2)).toEqual(['Rosa Quispe', 'Carmen']);
    expect(v.querySelector('.total-cobrar')?.textContent).toBe('S/ 15.50');
    // Sin celular no hay botón "Recordar".
    expect(v.querySelectorAll('[data-recordar]')).toHaveLength(1);
  });

  it('Recordar muestra el mensaje ANTES de abrir WhatsApp y luego anota ultimoRecordatorio', () => {
    const f = montar();
    document.querySelector<HTMLElement>('[data-recordar="c1"]')!.click();
    const panel = document.getElementById('panel')!;
    expect(panel.hidden).toBe(false);
    const preview = panel.querySelector('.recordatorio-preview')!.textContent!;
    expect(preview).toContain('Hola Rosa');
    expect(preview).toContain('S/ 12.50');
    expect(preview).toContain('te saluda Bodega Don Lucho');
    const enlace = panel.querySelector<HTMLAnchorElement>('#abrir-wa')!;
    expect(enlace.href).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    expect(enlace.rel).toContain('noopener');
    expect(f.marcarRecordatorio).not.toHaveBeenCalled();
    enlace.addEventListener('click', (e) => e.preventDefault());
    enlace.click();
    expect(f.marcarRecordatorio).toHaveBeenCalledWith('c1');
  });

  it('detalle: el abono se prellena con lo que falta del cargo más antiguo (RN-09)', () => {
    montar();
    document.querySelector<HTMLElement>('[data-cliente="c1"]')!.click();
    const form = document.querySelector<HTMLFormElement>('#form-abono')!;
    expect((form.elements.namedItem('monto') as HTMLInputElement).value).toBe('12.50');
    expect((form.elements.namedItem('descripcion') as HTMLInputElement).value).toBe('Pago de: Arroz');
    expect((form.elements.namedItem('origen') as HTMLInputElement).value).toBe('Arroz');
  });

  it('borrar un movimiento pide confirmación en la página (nunca window.confirm)', async () => {
    const confirmar = vi.spyOn(window, 'confirm');
    const f = montar();
    document.querySelector<HTMLElement>('[data-cliente="c1"]')!.click();
    document.querySelector<HTMLElement>('[data-eliminar="Arroz"]')!.click();
    await Promise.resolve();
    const si = document.querySelector<HTMLElement>('.confirmacion [data-si]');
    expect(si).not.toBeNull();
    si!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(f.eliminarMovimiento).toHaveBeenCalledWith('Arroz');
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe('Vender: cobrar con teclado y deshacer', () => {
  const pulsar = (key: string, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra });
    vender.teclaVender(e);
    return e;
  };

  function montar(f: FuenteDatos) {
    datosMod.usarFuente(f);
    vender.montarVender(document.getElementById('v')!);
    datosMod.actualizarDatos({
      productos: [
        { id: 'p1', nombre: 'Arroz', precio: 4.6, stock: 10 },
        { id: 'p2', nombre: 'Leche', precio: 4.2, stock: null },
      ],
      clientes: [],
      movimientos: [],
    });
    vender.renderVender(datosMod.datos());
  }

  it('"/" enfoca la búsqueda, Enter agrega el primer resultado y Ctrl+Enter cobra', async () => {
    const f = fuenteFalsa();
    montar(f);
    pulsar('/');
    const buscar = document.getElementById('buscar') as HTMLInputElement;
    expect(document.activeElement).toBe(buscar);
    buscar.value = 'lech';
    buscar.dispatchEvent(new Event('input', { bubbles: true }));
    pulsar('Enter');
    pulsar('Enter');
    expect(store.getCart()).toEqual([{ id: 'p2', nombre: 'Leche', precio: 4.2, cantidad: 2 }]);
    expect(document.getElementById('ticket-total')?.textContent).toBe('S/ 8.40');

    pulsar('Enter', { ctrlKey: true });
    await new Promise((r) => setTimeout(r, 0));
    expect(f.cobrar).toHaveBeenCalledTimes(1);
    const op = (f.cobrar as ReturnType<typeof vi.fn>).mock.calls[0]![0] as OperacionVenta;
    expect(op.venta).toMatchObject({ total: 8.4, metodoDePago: 'Efectivo', clienteId: null });
    expect(document.querySelector('.ticket-sello')?.textContent).toContain('Venta registrada');
    expect(store.getCart()).toHaveLength(0);
  });

  it('Deshacer dentro de 6 s escribe el contraasiento y devuelve el ticket', async () => {
    const f = fuenteFalsa();
    montar(f);
    document.querySelector<HTMLElement>('[data-producto="p1"]')!.click();
    document.querySelector<HTMLElement>('#btn-cobrar')!.click();
    await new Promise((r) => setTimeout(r, 0));
    const boton = document.querySelector<HTMLElement>('[data-deshacer]');
    expect(boton?.textContent).toContain('Deshacer (6 s)');
    boton!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(f.deshacerVenta).toHaveBeenCalledTimes(1);
    expect(store.getCart()).toEqual([{ id: 'p1', nombre: 'Arroz', precio: 4.6, cantidad: 1 }]);
    expect(document.querySelector('.ticket-sello')).toBeNull();
  });

  it('pasados 6 s ya no se puede deshacer', async () => {
    vi.useFakeTimers();
    try {
      const f = fuenteFalsa();
      montar(f);
      document.querySelector<HTMLElement>('[data-producto="p1"]')!.click();
      document.querySelector<HTMLElement>('#btn-cobrar')!.click();
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('[data-deshacer]')).not.toBeNull();
      await vi.advanceTimersByTimeAsync(6000);
      expect(document.querySelector('[data-deshacer]')).toBeNull();
      expect(document.querySelector('[data-nueva-venta]')).not.toBeNull();
      expect(f.deshacerVenta).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('si la venta falla, el ticket sigue y se explica qué hacer', async () => {
    const f = fuenteFalsa({ cobrar: vi.fn(async () => Promise.reject(new Error('unavailable'))) });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    montar(f);
    document.querySelector<HTMLElement>('[data-producto="p1"]')!.click();
    document.querySelector<HTMLElement>('#btn-cobrar')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getCart()).toHaveLength(1);
    expect(document.getElementById('cobro-error')?.textContent).toContain('el ticket sigue aquí');
  });

  it('Fiado sin cliente no cobra y lo pide con palabras claras', async () => {
    const f = fuenteFalsa();
    montar(f);
    document.querySelector<HTMLElement>('[data-producto="p1"]')!.click();
    document.querySelector<HTMLElement>('[data-metodo="Fiado"]')!.click();
    document.querySelector<HTMLElement>('#btn-cobrar')!.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(f.cobrar).not.toHaveBeenCalled();
    expect(document.getElementById('cobro-error')?.textContent).toContain('Elige a quién le fías');
  });

  it('calculadora de vuelto con billetes', () => {
    montar(fuenteFalsa());
    document.querySelector<HTMLElement>('[data-producto="p1"]')!.click();
    document.querySelector<HTMLElement>('[data-billete="20"]')!.click();
    expect(document.getElementById('vuelto-res')?.textContent).toContain('S/ 15.40');
    expect(document.querySelector<HTMLButtonElement>('[data-billete="10"]')?.disabled).toBe(false);
  });
});
