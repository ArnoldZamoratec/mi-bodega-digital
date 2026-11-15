import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Contenedor } from '@/data/contenedor';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import { idAnulacion } from '@/domain/rules/anulacion';
import type { PantallaRaiz } from '@/presentation/navigation/tipos';
import { HistorialVentasScreen } from '@/presentation/screens/ventas/HistorialVentasScreen';
import { useAvisos } from '@/presentation/stores/avisosStore';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';

async function montar() {
  const db = new BaseDatosMemoria();
  db.reloj = () => new Date(); // el historial muestra "Hoy"
  db.productos.set('arroz', { id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 8 });
  const ventas = new VentasMemoria(db);
  await ventas.confirmar({
    ventaId: 'v1',
    cargoId: null,
    venta: {
      items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 2 }],
      total: 8.4,
      metodoDePago: 'Efectivo',
      clienteId: null,
    },
    cargo: null,
    deltasStock: [],
    creadaEn: Date.now(),
  });
  const contenedor = { uid: 'u', ventas } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: 'u', email: 'a@b.pe', rol: 'dueno' }, contenedor);
  const props = {
    navigation: { navigate: jest.fn(), goBack: jest.fn() },
    route: { key: 'h', name: 'HistorialVentas' },
  } as unknown as PantallaRaiz<'HistorialVentas'>;
  return { db, props };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useRed.setState({ enLinea: true });
  useAvisos.getState().cerrar();
});

describe('Historial de ventas', () => {
  it('lista la venta y permite anularla con motivo (stock devuelto)', async () => {
    const { db, props } = await montar();
    await renderizar(<HistorialVentasScreen {...props} />);

    expect(await screen.findByText('Arroz ×2')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('venta-v1'));
    await fireEvent.press(screen.getByTestId('boton-anular-venta'));

    // Sin motivo no se puede confirmar.
    expect(screen.getByTestId('confirmar-anulacion')).toBeDisabled();
    await fireEvent.press(screen.getByTestId('motivo-Cobro equivocado'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirmar-anulacion'));
    });

    await waitFor(() => expect(db.ventas.has(idAnulacion('v1'))).toBe(true));
    expect(db.productos.get('arroz')?.stock).toBe(10);
    expect(db.ventas.get(idAnulacion('v1'))?.motivoAnulacion).toBe('Cobro equivocado');
    expect(useAvisos.getState().actual?.mensaje).toMatch(/Venta anulada/);
  });

  it('sin conexión no anula: lo explica y no toca nada', async () => {
    const { db, props } = await montar();
    useRed.setState({ enLinea: false });
    await renderizar(<HistorialVentasScreen {...props} />);

    await fireEvent.press(await screen.findByTestId('venta-v1'));
    await fireEvent.press(screen.getByTestId('boton-anular-venta'));
    await fireEvent.press(screen.getByTestId('motivo-Otro'));
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirmar-anulacion'));
    });

    expect(db.ventas.has(idAnulacion('v1'))).toBe(false);
    expect(db.productos.get('arroz')?.stock).toBe(8);
  });
});
