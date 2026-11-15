import { act, fireEvent, screen } from '@testing-library/react-native';

import { CelebracionVenta } from '@/presentation/components/CelebracionVenta';
import { celebrarVenta, useCelebracion } from '@/presentation/stores/celebracionStore';

import { renderizar } from '@/test-utils/renderizar';

beforeEach(() => useCelebracion.getState().cerrar());

describe('CelebracionVenta (pico de la experiencia)', () => {
  it('muestra monto, medio de pago y unidades; "Nueva venta" la cierra', async () => {
    await renderizar(<CelebracionVenta />);
    await act(() =>
      celebrarVenta({ total: 12.5, metodo: 'Yape/Plin', sincronizada: true, unidades: 3 }),
    );

    expect(screen.getByText('Venta registrada')).toBeTruthy();
    expect(screen.getByText('S/ 12.50')).toBeTruthy();
    expect(screen.getByText('Yape/Plin')).toBeTruthy();
    expect(screen.getByText('3 productos')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('celebracion-nueva-venta'));
    expect(useCelebracion.getState().actual).toBeNull();
  });

  it('sin conexión explica que se enviará luego', async () => {
    await renderizar(<CelebracionVenta />);
    await act(() =>
      celebrarVenta({ total: 4, metodo: 'Efectivo', sincronizada: false, unidades: 1 }),
    );

    expect(screen.getByText('Venta guardada en el teléfono')).toBeTruthy();
    expect(screen.getByText(/Se enviará sola/)).toBeTruthy();
  });

  it('se cierra sola para no frenar la fila de clientes', async () => {
    jest.useFakeTimers();
    try {
      await renderizar(<CelebracionVenta />);
      await act(() =>
        celebrarVenta({ total: 1, metodo: 'Efectivo', sincronizada: true, unidades: 1 }),
      );
      // 4 s: da tiempo a "Deshacer" sin bloquear (la tarjeta no es modal).
      await act(() => jest.advanceTimersByTime(4100));
      expect(useCelebracion.getState().actual).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
