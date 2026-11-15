import type { MovimientoFiado } from '@bodegon/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../firebase', () => ({ db: {}, auth: {}, appId: 'mi-bodega-app' }));

const ui = await import('../ui');
const store = await import('../store');

const DETALLE = `
  <div id="cliente-detalle-modal">
    <p id="cliente-detalle-saldo" class="text-blue-900">S/ 0.00</p>
    <a id="recordar-whatsapp-btn" href="#" class="hidden"></a>
    <div id="cliente-detalle-historial"></div>
    <input id="pago-monto"><input id="pago-descripcion"><input id="pago-deuda-origen-id">
  </div>
  <div id="lista-clientes-fiado"></div>
  <div id="cart-items"></div><span id="cart-total"></span>
`;

const mov = (
  id: string,
  monto: number,
  dia: number,
  extra: Partial<MovimientoFiado> = {},
): MovimientoFiado => ({
  id,
  clienteId: 'c1',
  monto,
  descripcion: id,
  fecha: new Date(Date.UTC(2026, 10, dia, 15)),
  pagado: false,
  ...extra,
});

const rosa = { id: 'c1', nombre: 'Rosa', telefono: '987 654 321' };

beforeEach(() => {
  document.body.innerHTML = DETALLE;
  store.resetState();
});

describe('esc (XSS)', () => {
  it('escapa HTML', () => {
    expect(ui.esc('<img src=x onerror=alert(1)>"\'&')).toBe(
      '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;',
    );
    expect(ui.esc(null)).toBe('');
  });

  it('un nombre malicioso se muestra como texto en la lista de clientes', () => {
    ui.renderClientesFiado([{ id: 'x', nombre: '<b>hack</b>', telefono: '', saldoTotal: 0 }], () => {});
    const lista = document.getElementById('lista-clientes-fiado')!;
    expect(lista.querySelector('b')).toBeNull();
    expect(lista.textContent).toContain('<b>hack</b>');
  });
});

describe('historial del cliente con FIFO del core', () => {
  it('un cargo cubierto por abonos no ofrece "Pagar" y el saldo no se descuenta dos veces (B-01)', () => {
    ui.renderHistorialCliente(rosa, [
      mov('Arroz', 10, 1),
      mov('Leche', 6, 2),
      mov('Abono', -12, 3, { metodoPago: 'Efectivo' }),
    ]);
    const historial = document.getElementById('cliente-detalle-historial')!;
    const botones = [...historial.querySelectorAll<HTMLElement>('.marcar-pagado-btn')];
    expect(botones.map((b) => b.dataset.id)).toEqual(['Leche']);
    expect(historial.textContent).toContain('(Cubierto) Arroz');
    expect(historial.textContent).toContain('Leche (falta S/ 4.00)');
    expect(document.getElementById('cliente-detalle-saldo')!.textContent).toBe('S/ 4.00');
  });

  it('pre-llena el pago con lo que falta del cargo más antiguo (RN-09)', () => {
    ui.renderHistorialCliente(rosa, [mov('Arroz', 10, 1), mov('Abono', -2.5, 2)]);
    expect((document.getElementById('pago-monto') as HTMLInputElement).value).toBe('7.50');
    expect((document.getElementById('pago-descripcion') as HTMLInputElement).value).toBe(
      'Pago de: Arroz',
    );
    expect((document.getElementById('pago-deuda-origen-id') as HTMLInputElement).value).toBe(
      'Arroz',
    );
  });

  it('respeta cargos heredados con pagado: true', () => {
    ui.renderHistorialCliente(rosa, [mov('Viejo', 5, 1, { pagado: true })]);
    const historial = document.getElementById('cliente-detalle-historial')!;
    expect(historial.querySelector('.marcar-pagado-btn')).toBeNull();
    expect(historial.textContent).toContain('(Pagado) Viejo');
  });
});

describe('Recordar por WhatsApp', () => {
  const boton = () => document.getElementById('recordar-whatsapp-btn') as HTMLAnchorElement;

  it('aparece si debe y tiene celular; el texto lo arma el core', () => {
    ui.renderHistorialCliente(rosa, [mov('Arroz', 12.5, 1)]);
    expect(boton().classList.contains('hidden')).toBe(false);
    expect(boton().href).toMatch(/^https:\/\/wa\.me\/51987654321\?text=/);
    const texto = decodeURIComponent(boton().href.split('text=')[1]!);
    expect(texto).toContain('Hola Rosa');
    expect(texto).toContain('S/ 12.50');
    expect(texto).toContain('tu bodega');
  });

  it('firma con el nombre de la bodega de config/negocio', () => {
    store.setNombreBodega('Bodega Don Lucho');
    ui.renderHistorialCliente(rosa, [mov('Arroz', 3, 1)]);
    expect(decodeURIComponent(boton().href)).toContain('te saluda Bodega Don Lucho');
  });

  it('oculto si no debe o si no tiene celular', () => {
    ui.renderHistorialCliente(rosa, [mov('Arroz', 3, 1), mov('Abono', -3, 2)]);
    expect(boton().classList.contains('hidden')).toBe(true);
    ui.renderHistorialCliente({ ...rosa, telefono: '01 4251234' }, [mov('Arroz', 3, 1)]);
    expect(boton().classList.contains('hidden')).toBe(true);
  });
});

describe('carrito', () => {
  it('total en céntimos con las reglas del core', () => {
    store.addToCartState({ id: 'a', nombre: 'A', precio: 0.1 });
    store.addToCartState({ id: 'b', nombre: 'B', precio: 0.2 });
    store.addToCartState({ id: 'a', nombre: 'A', precio: 0.1 });
    ui.renderCart(store.getCart());
    expect(document.getElementById('cart-total')!.textContent).toBe('S/ 0.40');
    store.removeFromCartState('a');
    store.removeFromCartState('a');
    expect(store.getCart().map((i) => i.id)).toEqual(['b']);
  });
});
