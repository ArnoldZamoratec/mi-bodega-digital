import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Contenedor } from '@/data/contenedor';
import { clasificadorFirebase } from '@/data/firebase/errores';
import { ColaVentasPersistente } from '@/data/local/colaVentas';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import { SincronizadorVentas } from '@/domain/usecases/sincronizarVentas';
import type { PantallaRaiz } from '@/presentation/navigation/tipos';
import { CobroScreen } from '@/presentation/screens/pos/CobroScreen';
import { useAvisos } from '@/presentation/stores/avisosStore';
import { useCarrito } from '@/presentation/stores/carritoStore';
import { useCelebracion } from '@/presentation/stores/celebracionStore';
import { useDatos } from '@/presentation/stores/datosStore';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';

function montar() {
  const db = new BaseDatosMemoria();
  db.productos.set('arroz', { id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 1 });
  const ventas = new VentasMemoria(db);
  const cola = new ColaVentasPersistente(AsyncStorage, 'u-test');
  const contenedor = {
    uid: 'u-test',
    ventas,
    cola,
    sincronizador: new SincronizadorVentas(ventas, cola, clasificadorFirebase, 100),
  } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: 'u-test', email: 'a@b.pe', rol: 'dueno' }, contenedor);
  useDatos.setState({
    productos: {
      datos: [...db.productos.values()],
      cargando: false,
      error: null,
      desdeCache: false,
    },
    clientes: {
      datos: [{ id: 'cli', nombre: 'Doña Rosa', telefono: '' }],
      cargando: false,
      error: null,
      desdeCache: false,
    },
  });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const props = {
    navigation,
    route: { key: 'c', name: 'Cobro' },
  } as unknown as PantallaRaiz<'Cobro'>;
  return { db, navigation, props };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useCarrito.getState().vaciar();
  useRed.setState({ enLinea: true });
  useAvisos.getState().cerrar();
  useCelebracion.getState().cerrar();
});

describe('CobroScreen (POS → venta)', () => {
  it('cobra en efectivo, descuenta stock, vacía el carrito y vuelve', async () => {
    const { db, navigation, props } = montar();
    await act(() => {
      useCarrito.getState().agregar({ id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 1 });
    });
    await renderizar(<CobroScreen {...props} />);

    expect(screen.getByTestId('total-cobro')).toHaveTextContent('S/ 4.20');

    await fireEvent.press(screen.getByTestId('boton-confirmar-venta'));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(db.ventas.size).toBe(1);
    expect([...db.ventas.values()][0]).toMatchObject({
      total: 4.2,
      metodoDePago: 'Efectivo',
      clienteId: null,
    });
    expect(db.productos.get('arroz')?.stock).toBe(0);
    expect(useCarrito.getState().items).toEqual([]);
    // Pico de la experiencia: la venta se celebra con su monto y medio de pago.
    expect(useCelebracion.getState().actual).toMatchObject({
      total: 4.2,
      metodo: 'Efectivo',
      sincronizada: true,
      unidades: 1,
    });
  });

  it('no deja agregar más unidades que el stock (R-07)', async () => {
    const { props } = montar();
    const arroz = { id: 'arroz', nombre: 'Arroz', precio: 4.2, stock: 1 };
    await act(() => {
      expect(useCarrito.getState().agregar(arroz)).toBe(true);
      expect(useCarrito.getState().agregar(arroz)).toBe(false);
      expect(useCarrito.getState().agregar({ ...arroz, id: 'x', stock: 0 })).toBe(false);
    });
    expect(useCarrito.getState().items).toEqual([
      { id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 1 },
    ]);

    await renderizar(<CobroScreen {...props} />);
    expect(screen.getByTestId('mas-Arroz')).toBeDisabled();
    expect(screen.getByText('Máximo disponible')).toBeTruthy();
  });

  it('bloquea la venta si el stock bajó después de armar el carrito (R-07)', async () => {
    const { db, props } = montar();
    // Carrito armado cuando había stock; luego otra venta dejó solo 1.
    await act(() => {
      useCarrito.getState().agregar({ id: 'arroz', nombre: 'Arroz', precio: 4.2 });
      useCarrito.getState().fijarCantidad('arroz', 2);
    });
    await renderizar(<CobroScreen {...props} />);

    expect(screen.getByText(/pides 2 y hay 1/)).toBeTruthy();
    expect(screen.getByTestId('boton-confirmar-venta')).toBeDisabled();
    expect(screen.getByText('Stock insuficiente')).toBeTruthy();
    expect(db.ventas.size).toBe(0);
  });

  it('fiado exige cliente antes de confirmar', async () => {
    const { props } = montar();
    await act(() => {
      useCarrito.getState().agregar({ id: 'arroz', nombre: 'Arroz', precio: 4.2 });
      useCarrito.getState().fijarMetodo('Fiado');
    });
    await renderizar(<CobroScreen {...props} />);

    expect(screen.getByTestId('boton-confirmar-venta')).toBeDisabled();
    expect(screen.getByText('Elige un cliente')).toBeTruthy();
  });

  it('sin conexión guarda la venta en el teléfono', async () => {
    const { db, navigation, props } = montar();
    useRed.setState({ enLinea: false });
    await act(() => useCarrito.getState().agregar({ id: 'arroz', nombre: 'Arroz', precio: 4.2 }));
    await renderizar(<CobroScreen {...props} />);

    await fireEvent.press(screen.getByTestId('boton-confirmar-venta'));

    await waitFor(() => expect(navigation.goBack).toHaveBeenCalled());
    expect(db.ventas.size).toBe(0);
    expect(await new ColaVentasPersistente(AsyncStorage, 'u-test').listar()).toHaveLength(1);
    expect(useCelebracion.getState().actual).toMatchObject({ sincronizada: false });
  });
});
