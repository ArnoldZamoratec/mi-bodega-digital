import { calcularVuelto, faltante, montosSugeridos } from '../rules/vuelto';

describe('vuelto', () => {
  it('sugiere el sol siguiente, múltiplos de 5/10 y billetes (máx. 4)', () => {
    expect(montosSugeridos(7.5)).toEqual([8, 10, 20, 50]);
    expect(montosSugeridos(12)).toEqual([15, 20, 50, 100]);
    expect(montosSugeridos(3.2)).toEqual([4, 5, 10, 20]);
    // Total redondo: "Exacto" va aparte; se sugieren los billetes mayores.
    expect(montosSugeridos(20)).toEqual([50, 100, 200]);
  });

  it('total alto: solo billetes que alcanzan', () => {
    expect(montosSugeridos(185)).toEqual([190, 200]);
    expect(montosSugeridos(250)).toEqual([]);
  });

  it('sin total no sugiere nada', () => {
    expect(montosSugeridos(0)).toEqual([]);
  });

  it('calcula el vuelto sin errores de coma flotante', () => {
    expect(calcularVuelto(7.3, 10)).toBe(2.7);
    expect(calcularVuelto(0.1 + 0.2, 0.3)).toBe(0);
    expect(calcularVuelto(18.8, 50)).toBe(31.2);
  });

  it('si no alcanza no hay vuelto y se informa cuánto falta', () => {
    expect(calcularVuelto(12, 10)).toBeNull();
    expect(faltante(12, 10)).toBe(2);
    expect(faltante(12, 20)).toBe(0);
  });
});
