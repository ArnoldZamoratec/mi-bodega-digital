import { fireEvent, screen } from '@testing-library/react-native';

import { DialogoMontoLibre } from '@/presentation/screens/pos/DialogoMontoLibre';

import { renderizar } from '@/test-utils/renderizar';

function montar() {
  const onAgregar = jest.fn();
  const onCerrar = jest.fn();
  return {
    onAgregar,
    onCerrar,
    ui: <DialogoMontoLibre visible onCerrar={onCerrar} onAgregar={onAgregar} />,
  };
}

describe('DialogoMontoLibre', () => {
  it('agrega el monto escrito con su descripción', async () => {
    const { onAgregar, onCerrar, ui } = montar();
    await renderizar(ui);

    await fireEvent.changeText(screen.getByTestId('campo-monto-libre'), '2,5');
    await fireEvent.changeText(screen.getByTestId('campo-desc-libre'), 'Pan suelto');
    expect(screen.getByText('Agregar S/ 2.50')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('agregar-monto-libre'));

    expect(onAgregar).toHaveBeenCalledWith(2.5, 'Pan suelto');
    expect(onCerrar).toHaveBeenCalled();
  });

  it('los montos rápidos llenan el campo', async () => {
    const { onAgregar, ui } = montar();
    await renderizar(ui);

    await fireEvent.press(screen.getByTestId('monto-rapido-0.5'));
    await fireEvent.press(screen.getByTestId('agregar-monto-libre'));

    expect(onAgregar).toHaveBeenCalledWith(0.5, '');
  });

  it('un monto fuera de rango no se puede agregar', async () => {
    const { onAgregar, ui } = montar();
    await renderizar(ui);

    await fireEvent.changeText(screen.getByTestId('campo-monto-libre'), '25000');
    expect(screen.getByTestId('error-monto-libre')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('agregar-monto-libre'));

    expect(onAgregar).not.toHaveBeenCalled();
  });
});
