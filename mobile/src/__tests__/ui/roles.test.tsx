import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import type { Contenedor } from '@/data/contenedor';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import type { MovimientoFiado } from '@/domain/entities';
import { sesionDueno, type Sesion } from '@/domain/rules/roles';
import type { VentaNueva } from '@/domain/rules/venta';
import type { PantallaRaiz, PantallaTab } from '@/presentation/navigation/tipos';
import { AjustesScreen } from '@/presentation/screens/ajustes/AjustesScreen';
import { DetalleCliente } from '@/presentation/screens/fiado/ClienteDetalleScreen';
import { MovimientoFormScreen } from '@/presentation/screens/fiado/MovimientoFormScreen';
import { ProductoFormScreen } from '@/presentation/screens/inventario/ProductoFormScreen';
import { HistorialVentasScreen } from '@/presentation/screens/ventas/HistorialVentasScreen';
import { useDatos } from '@/presentation/stores/datosStore';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';

// useFocusEffect fuera de un NavigationContainer: basta con un efecto.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useFocusEffect: (cb: () => void | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(cb, [cb]),
}));
jest.mock('@/presentation/services/notificaciones', () => ({
  prepararNotificaciones: jest.fn(async () => true),
}));

/**
 * D-33: la interfaz refleja la tabla de permisos del core. El cajero no ve reportes, ajustes
 * del negocio, equipo, edición de productos/clientes, anular venta, fiar sin venta ni borrar
 * movimientos. El dueño sigue viendo todo como antes.
 */

const rosa: Sesion = { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' };
const lucho = sesionDueno('d1', 'Lucho');
const coleccion = <T,>(datos: T[]) => ({ datos, cargando: false, error: null, desdeCache: false });

async function entrar(sesion: Sesion) {
  const db = new BaseDatosMemoria();
  db.reloj = () => new Date();
  const ventas = new VentasMemoria(db);
  // Venta registrada por Rosa (como la deja `sellarVenta` en Firestore).
  const venta = {
    items: [{ id: 'arroz', nombre: 'Arroz', precio: 4.2, cantidad: 2 }],
    total: 8.4,
    metodoDePago: 'Efectivo',
    clienteId: null,
    vendidoPor: 'c1',
    vendidoPorNombre: 'Rosa',
  } as VentaNueva;
  await ventas.confirmar({
    ventaId: 'v1',
    cargoId: null,
    venta,
    cargo: null,
    deltasStock: [],
    creadaEn: Date.now(),
  });
  const contenedor = { uid: sesion.uid, sesion, ventas, config: {} } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: sesion.uid, email: 'x@x.pe', rol: 'dueno' }, contenedor);
}

const props = <T,>(name: string, params?: object) =>
  ({
    navigation: { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn() },
    route: { key: name, name, params },
  }) as unknown as T;

beforeEach(async () => {
  await AsyncStorage.clear();
  useRed.setState({ enLinea: true });
  useDatos.getState().reiniciar();
});

describe('Historial: "Vendió: Rosa" y anular solo para el dueño', () => {
  it('cajero: ve quién vendió, pero no el botón de anular', async () => {
    await entrar(rosa);
    await renderizar(
      <HistorialVentasScreen {...props<PantallaRaiz<'HistorialVentas'>>('HistorialVentas')} />,
    );
    expect(await screen.findByTestId('autor-v1')).toHaveTextContent('Vendió: Rosa');
    await fireEvent.press(screen.getByTestId('venta-v1'));
    expect(screen.getByTestId('detalle-autor')).toHaveTextContent('Vendió: Rosa');
    expect(screen.queryByTestId('boton-anular-venta')).toBeNull();
  });

  it('dueño: ve quién vendió y puede anular', async () => {
    await entrar(lucho);
    await renderizar(
      <HistorialVentasScreen {...props<PantallaRaiz<'HistorialVentas'>>('HistorialVentas')} />,
    );
    await fireEvent.press(await screen.findByTestId('venta-v1'));
    expect(screen.getByTestId('detalle-autor')).toHaveTextContent('Vendió: Rosa');
    expect(screen.getByTestId('boton-anular-venta')).toBeTruthy();
  });
});

describe('Fiado por rol', () => {
  const sembrar = () => {
    const cargo: MovimientoFiado = {
      id: 'm1',
      clienteId: 'a',
      monto: 10,
      descripcion: 'Arroz',
      fecha: new Date(),
      pagado: false,
    };
    useDatos.setState({
      clientes: coleccion([{ id: 'a', nombre: 'Ana', telefono: '' }]),
      movimientos: coleccion([cargo]),
    });
  };

  it('cajero: registra pagos, pero no fía sin venta ni borra movimientos', async () => {
    await entrar(rosa);
    sembrar();
    await renderizar(<DetalleCliente clienteId="a" onMovimiento={jest.fn()} />);
    expect(screen.getByTestId('boton-abonar')).toBeTruthy();
    expect(screen.queryByTestId('boton-fiar')).toBeNull();
    expect(screen.queryByLabelText('Eliminar Arroz')).toBeNull();
  });

  it('dueño: fiar y borrar como siempre', async () => {
    await entrar(lucho);
    sembrar();
    await renderizar(<DetalleCliente clienteId="a" onMovimiento={jest.fn()} />);
    expect(screen.getByTestId('boton-fiar')).toBeTruthy();
    expect(screen.getByLabelText('Eliminar Arroz')).toBeTruthy();
  });

  it('cajero que llega al formulario de fiar: explica cómo fiar con una venta', async () => {
    await entrar(rosa);
    sembrar();
    await renderizar(
      <MovimientoFormScreen
        {...props<PantallaRaiz<'MovimientoForm'>>('MovimientoForm', {
          clienteId: 'a',
          tipo: 'cargo',
        })}
      />,
    );
    expect(screen.getByTestId('fiar-sin-permiso')).toBeTruthy();
  });
});

describe('Productos y ajustes por rol', () => {
  it('cajero: el formulario de producto queda bloqueado', async () => {
    await entrar(rosa);
    await renderizar(
      <ProductoFormScreen {...props<PantallaRaiz<'ProductoForm'>>('ProductoForm')} />,
    );
    expect(screen.getByTestId('producto-sin-permiso')).toBeTruthy();
    expect(screen.queryByTestId('boton-guardar-producto')).toBeNull();
  });

  it('cajero: Ajustes sin datos del negocio, equipo ni notificaciones', async () => {
    await entrar(rosa);
    await renderizar(<AjustesScreen {...props<PantallaTab<'Ajustes'>>('Ajustes')} />);
    expect(screen.getByTestId('ajustes-caja')).toBeTruthy();
    expect(screen.queryByTestId('ajustes-negocio')).toBeNull();
    expect(screen.queryByTestId('ajustes-equipo')).toBeNull();
    expect(screen.queryByTestId('ajustes-unirse')).toBeNull();
    expect(screen.queryByText('Avisar stock bajo')).toBeNull();
    expect(screen.getByTestId('ajustes-rol')).toHaveTextContent(/Cajero de .* · Rosa/);
  });

  it('dueño: Equipo y "Tengo un código de invitación"', async () => {
    await entrar(lucho);
    const p = props<PantallaTab<'Ajustes'>>('Ajustes');
    await renderizar(<AjustesScreen {...p} />);
    expect(screen.getByTestId('ajustes-negocio')).toBeTruthy();
    expect(screen.getByText('Avisar stock bajo')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('ajustes-equipo'));
    expect(p.navigation.navigate).toHaveBeenCalledWith('Equipo');
    await fireEvent.press(screen.getByTestId('ajustes-unirse'));
    expect(p.navigation.navigate).toHaveBeenCalledWith('UnirseEquipo');
  });
});
