import { fireEvent, screen } from '@testing-library/react-native';
import { useState } from 'react';

import { PanelVuelto } from '@/presentation/components/PanelVuelto';

import { renderizar } from '@/test-utils/renderizar';

function Contenedor({ total }: { total: number }) {
  const [recibido, setRecibido] = useState<number | null>(null);
  return <PanelVuelto total={total} recibido={recibido} onCambiar={setRecibido} />;
}

describe('PanelVuelto (efectivo)', () => {
  it('sugiere montos y muestra el vuelto en grande', async () => {
    await renderizar(<Contenedor total={7.5} />);

    expect(screen.queryByTestId('vuelto')).toBeNull();
    await fireEvent.press(screen.getByTestId('recibido-S/ 10'));

    expect(screen.getByText('Vuelto')).toBeTruthy();
    expect(screen.getByText('S/ 2.50')).toBeTruthy();
  });

  it('"Exacto" deja el vuelto en cero y un segundo toque lo quita', async () => {
    await renderizar(<Contenedor total={7.5} />);

    await fireEvent.press(screen.getByTestId('recibido-Exacto'));
    expect(screen.getByText('S/ 0.00')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('recibido-Exacto'));
    expect(screen.queryByTestId('vuelto')).toBeNull();
  });

  it('con otro monto insuficiente avisa cuánto falta', async () => {
    await renderizar(<Contenedor total={12} />);

    await fireEvent.changeText(screen.getByTestId('recibido-otro'), '10');
    expect(screen.getByText('Falta')).toBeTruthy();
    expect(screen.getByText('S/ 2.00')).toBeTruthy();
  });
});
