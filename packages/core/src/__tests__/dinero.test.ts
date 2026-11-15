import {
  aCentimos,
  formatearSoles,
  parsearSoles,
  redondearSoles,
  subtotalCentimos,
  sumarSoles,
} from '../rules/dinero';

describe('dinero', () => {
  it('evita errores de coma flotante al sumar', () => {
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(sumarSoles([0.1, 0.2])).toBe(0.3);
    expect(sumarSoles([1.15, 2.3, 0.05])).toBe(3.5);
  });

  it('convierte a céntimos redondeando', () => {
    expect(aCentimos(1.005)).toBe(101);
    expect(aCentimos(2.5)).toBe(250);
    expect(redondearSoles(3.14159)).toBe(3.14);
    expect(subtotalCentimos(1.1, 3)).toBe(330);
  });

  it('formatea como la web: S/ 0.00', () => {
    expect(formatearSoles(0)).toBe('S/ 0.00');
    expect(formatearSoles(12.5)).toBe('S/ 12.50');
    expect(formatearSoles(1234567.891)).toBe('S/ 1,234,567.89');
    expect(formatearSoles(-10)).toBe('S/ -10.00');
  });

  it('parsea entradas con coma o punto', () => {
    expect(parsearSoles('12,5')).toBe(12.5);
    expect(parsearSoles(' 3.25 ')).toBe(3.25);
    expect(parsearSoles('10')).toBe(10);
    expect(parsearSoles('abc')).toBeNaN();
    expect(parsearSoles('1.234')).toBeNaN();
    expect(parsearSoles('')).toBeNaN();
  });
});
