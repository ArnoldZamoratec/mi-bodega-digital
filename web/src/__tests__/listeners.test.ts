import { describe, expect, it, vi } from 'vitest';

import { cancelarTodosLosListeners, listenersActivos, registrarListener } from '../listeners';

describe('registro de listeners', () => {
  it('logout cancela todos los listeners registrados', () => {
    const a = vi.fn();
    const b = vi.fn();
    registrarListener(a);
    registrarListener(b);
    expect(listenersActivos()).toBe(2);

    cancelarTodosLosListeners();
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(listenersActivos()).toBe(0);
  });

  it('cancelar un handle lo quita del registro y no se vuelve a llamar', () => {
    const a = vi.fn();
    const cancelar = registrarListener(a);
    cancelar();
    cancelar();
    cancelarTodosLosListeners();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('un handle viejo no hace nada tras el logout', () => {
    const a = vi.fn();
    const cancelar = registrarListener(a);
    cancelarTodosLosListeners();
    cancelar();
    expect(a).toHaveBeenCalledTimes(1);
  });

  it('un listener que falla no impide cerrar el resto', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const malo = vi.fn(() => {
      throw new Error('x');
    });
    const bueno = vi.fn();
    registrarListener(malo);
    registrarListener(bueno);
    cancelarTodosLosListeners();
    expect(bueno).toHaveBeenCalledTimes(1);
    expect(listenersActivos()).toBe(0);
  });
});
