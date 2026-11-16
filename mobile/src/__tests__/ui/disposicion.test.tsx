import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { act, fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import type { Contenedor } from '@/data/contenedor';
import type { Cliente, MovimientoFiado, Producto } from '@/domain/entities';
import {
  columnasPorAncho,
  disposicionDeAncho,
  useEstiloDialogo,
} from '@/presentation/hooks/useDisposicion';
import { BarraPestanas } from '@/presentation/navigation/BarraPestanas';
import { ICONOS_PESTANAS } from '@/presentation/navigation/iconosPestanas';
import type { PantallaRaiz, PantallaTab } from '@/presentation/navigation/tipos';
import { CajaScreen } from '@/presentation/screens/caja/CajaScreen';
import { ClientesScreen } from '@/presentation/screens/fiado/ClientesScreen';
import { CobranzaScreen } from '@/presentation/screens/fiado/CobranzaScreen';
import { InventarioScreen } from '@/presentation/screens/inventario/InventarioScreen';
import { CobroScreen } from '@/presentation/screens/pos/CobroScreen';
import { PosScreen } from '@/presentation/screens/pos/PosScreen';
import { ReportesScreen } from '@/presentation/screens/reportes/ReportesScreen';
import { useCarrito } from '@/presentation/stores/carritoStore';
import { useCromoInferior } from '@/presentation/stores/cromoInferiorStore';
import { useDatos } from '@/presentation/stores/datosStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';
import { restaurarVentana, simularVentana, VENTANAS } from '@/test-utils/ventana';

// Las pestañas usan useFocusEffect; fuera de un NavigationContainer basta con un efecto.
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual<object>('@react-navigation/native'),
  useFocusEffect: (cb: () => void | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(cb, [cb]),
}));

const coleccion = <T,>(datos: T[]) => ({ datos, cargando: false, error: null, desdeCache: false });
const sinDatos = () => () => undefined;
const ayer = new Date(Date.now() - 86_400_000);

const productos: Producto[] = [
  { id: 'p1', nombre: 'Arroz Costeño', precio: 4.5, stock: 20 },
  { id: 'p2', nombre: 'Leche Gloria', precio: 3.8, stock: 2, codigoBarras: '7751271000011' },
  { id: 'p3', nombre: 'Pan francés', precio: 0.3, stock: null },
];
const clientes: Cliente[] = [
  { id: 'a', nombre: 'Ana Torres', telefono: '987654321' },
  { id: 'b', nombre: 'Beto Ríos', telefono: '' },
];
const movimientos: MovimientoFiado[] = [
  { id: 'm1', clienteId: 'a', monto: 12.5, descripcion: 'Arroz', fecha: ayer, pagado: false },
  { id: 'm2', clienteId: 'b', monto: 1234.5, descripcion: 'Cuenta', fecha: ayer, pagado: false },
];

const navigate = jest.fn();
/** Ancho de la tarjeta (el estilo vive en la vista animada dentro del Pressable). */
const anchoTarjeta = (nombre: string) => {
  const interior = screen.getByTestId(`producto-${nombre}`).children[0] as unknown as {
    props: { style: object };
  };
  return (StyleSheet.flatten(interior.props.style) as { width?: number }).width;
};
function props<T>(name: string) {
  return {
    navigation: { navigate, goBack: jest.fn(), setOptions: jest.fn() },
    route: { key: name, name },
  } as unknown as T;
}

beforeEach(() => {
  navigate.mockReset();
  useDatos.getState().reiniciar();
  useCarrito.getState().vaciar();
  const contenedor = {
    uid: 'u',
    ventas: { observarRango: (_r: unknown, cb: (v: never[]) => void) => (cb([]), () => undefined) },
    fiado: {
      observarRango: (_r: unknown, cb: (v: never[]) => void) => (cb([]), () => undefined),
      eliminar: jest.fn(),
    },
    caja: {
      observarCajas: (cb: (c: never[]) => void) => (cb([]), () => undefined),
      observarMovimientos: sinDatos,
    },
    recordatorios: {},
  } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: 'u', email: 'a@b.pe', rol: 'dueno' }, contenedor);
  useDatos.setState({
    productos: coleccion(productos),
    clientes: coleccion(clientes),
    movimientos: coleccion(movimientos),
  });
});

afterEach(restaurarVentana);

describe('clases de ventana (M3)', () => {
  it('compacta < 600 ≤ media < 840 ≤ expandida', () => {
    expect(disposicionDeAncho(320)).toBe('compacta');
    expect(disposicionDeAncho(599)).toBe('compacta');
    expect(disposicionDeAncho(600)).toBe('media');
    expect(disposicionDeAncho(839)).toBe('media');
    expect(disposicionDeAncho(840)).toBe('expandida');
    expect(disposicionDeAncho(1280)).toBe('expandida');
  });

  it('columnas según el ancho real y la escala de letra', () => {
    expect(columnasPorAncho(358, 1, 12)).toBe(2); // teléfono 390dp
    expect(columnasPorAncho(288, 2, 12)).toBe(1); // 320dp con letra al 200 %
    expect(columnasPorAncho(1200 - 32, 1, 12)).toBe(6); // tope
    expect(columnasPorAncho(10, 1, 12)).toBe(1); // nunca 0
  });
});

describe('POS', () => {
  it('teléfono: sin ticket lateral; la barra flotante de Cobrar aparece al agregar', async () => {
    simularVentana(VENTANAS.telefono);
    await renderizar(<PosScreen {...props<PantallaTab<'Vender'>>('Vender')} />);

    expect(screen.queryByTestId('panel-ticket')).toBeNull();
    expect(anchoTarjeta('Arroz Costeño')).toBe(173); // 2 columnas: (390 − 32 − 12) / 2
    await fireEvent.press(screen.getByTestId('producto-Arroz Costeño'));
    expect(screen.getByTestId('boton-cobrar')).toBeTruthy();
  });

  it('POS de mostrador (1280×800): ticket persistente y catálogo de más columnas', async () => {
    simularVentana(VENTANAS.posMostrador);
    await renderizar(<PosScreen {...props<PantallaTab<'Vender'>>('Vender')} />);

    expect(screen.getByTestId('panel-ticket')).toBeTruthy();
    // Catálogo = 1280 − 80 (riel) − 360 (ticket) = 840dp → 5 columnas de 152dp.
    expect(anchoTarjeta('Arroz Costeño')).toBe(152);
    expect(screen.getByTestId('ticket-cobrar')).toBeDisabled();

    await fireEvent.press(screen.getByTestId('producto-Arroz Costeño'));
    await fireEvent.press(screen.getByTestId('producto-Arroz Costeño'));
    expect(screen.getByTestId('ticket-item-Arroz Costeño')).toHaveTextContent(/2 × S\/ 4\.50/);
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('S/ 9.00');
    // Con el ticket a la vista no se duplica la barra flotante.
    expect(screen.queryByTestId('boton-cobrar')).toBeNull();
    expect(useCromoInferior.getState().flotante).toBe(0);

    await fireEvent.press(screen.getByTestId('ticket-menos-Arroz Costeño'));
    expect(screen.getByTestId('ticket-total')).toHaveTextContent('S/ 4.50');
    await fireEvent.press(screen.getByTestId('ticket-cobrar'));
    expect(navigate).toHaveBeenCalledWith('Cobro');
  });

  it('el ticket respeta el stock al sumar desde el panel', async () => {
    simularVentana(VENTANAS.tabletVertical);
    await renderizar(<PosScreen {...props<PantallaTab<'Vender'>>('Vender')} />);

    expect(screen.getByTestId('panel-ticket')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('producto-Leche Gloria'));
    await fireEvent.press(screen.getByTestId('ticket-mas-Leche Gloria'));
    expect(useCarrito.getState().items[0]?.cantidad).toBe(2);
    expect(screen.getByTestId('ticket-mas-Leche Gloria')).toBeDisabled();
  });
});

describe('lista–detalle en expandida', () => {
  it('Fiado: lista y detalle lado a lado; tocar una fila cambia el detalle', async () => {
    simularVentana(VENTANAS.posMostrador);
    await renderizar(<ClientesScreen {...props<PantallaTab<'Fiado'>>('Fiado')} />);

    expect(screen.getByTestId('fiado-dos-paneles')).toBeTruthy();
    expect(screen.getByTestId('saldo-cliente')).toHaveTextContent('S/ 12.50');
    await fireEvent.press(screen.getByTestId('cliente-Beto Ríos'));
    expect(screen.getByTestId('saldo-cliente')).toHaveTextContent('S/ 1,234.50');
    expect(navigate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('boton-abonar'));
    expect(navigate).toHaveBeenCalledWith('MovimientoForm', { clienteId: 'b', tipo: 'abono' });
  });

  it('Fiado en teléfono: una columna y la fila abre la pantalla de detalle', async () => {
    simularVentana(VENTANAS.telefono);
    await renderizar(<ClientesScreen {...props<PantallaTab<'Fiado'>>('Fiado')} />);

    expect(screen.queryByTestId('fiado-dos-paneles')).toBeNull();
    await fireEvent.press(screen.getByTestId('cliente-Ana Torres'));
    expect(navigate).toHaveBeenCalledWith('ClienteDetalle', { clienteId: 'a' });
  });

  it('Cobranza: dos paneles con el que debe hace más tiempo elegido', async () => {
    simularVentana(VENTANAS.posMostrador);
    await renderizar(<CobranzaScreen {...props<PantallaRaiz<'Cobranza'>>('Cobranza')} />);

    expect(screen.getByTestId('cobranza-dos-paneles')).toBeTruthy();
    expect(screen.getByTestId('saldo-cliente')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('cobro-Ana Torres'));
    expect(screen.getByTestId('saldo-cliente')).toHaveTextContent('S/ 12.50');
  });

  it('Inventario: ficha del producto a la derecha; Editar abre el formulario', async () => {
    simularVentana(VENTANAS.posMostrador);
    await renderizar(<InventarioScreen {...props<PantallaTab<'Inventario'>>('Inventario')} />);

    expect(screen.getByTestId('inventario-dos-paneles')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('inventario-Leche Gloria'));
    expect(screen.getByTestId('ficha-producto')).toHaveTextContent(/7751271000011/);
    await fireEvent.press(screen.getByTestId('ficha-editar'));
    expect(navigate).toHaveBeenCalledWith('ProductoForm', { productoId: 'p2' });
  });

  it('Inventario en tablet vertical (media): una columna', async () => {
    simularVentana(VENTANAS.tabletVertical);
    await renderizar(<InventarioScreen {...props<PantallaTab<'Inventario'>>('Inventario')} />);

    expect(screen.queryByTestId('inventario-dos-paneles')).toBeNull();
    await fireEvent.press(screen.getByTestId('inventario-Arroz Costeño'));
    expect(navigate).toHaveBeenCalledWith('ProductoForm', { productoId: 'p1' });
  });

  it('Caja: dos columnas en expandida, una en teléfono', async () => {
    simularVentana(VENTANAS.posMostrador);
    const { unmount } = await renderizar(<CajaScreen {...props<PantallaRaiz<'Caja'>>('Caja')} />);
    expect(screen.getByTestId('caja-dos-columnas')).toBeTruthy();
    await act(async () => unmount());

    simularVentana(VENTANAS.telefono);
    await renderizar(<CajaScreen {...props<PantallaRaiz<'Caja'>>('Caja')} />);
    expect(screen.getByTestId('caja-una-columna')).toBeTruthy();
  });
});

describe('Reportes', () => {
  const kpi = () =>
    StyleSheet.flatten(screen.getByLabelText(/^Efectivo que entró/).props.style) as {
      flexBasis?: string;
    };

  it('KPIs en una fila desde la disposición media', async () => {
    simularVentana(VENTANAS.posMostrador);
    await renderizar(<ReportesScreen {...props<PantallaTab<'Reportes'>>('Reportes')} />);
    expect(kpi().flexBasis).toBe('22%');
  });

  it('teléfono con letra al 200 %: un KPI por fila', async () => {
    simularVentana(VENTANAS.telefonoAngosto, 2);
    await renderizar(<ReportesScreen {...props<PantallaTab<'Reportes'>>('Reportes')} />);
    expect(kpi().flexBasis).toBe('100%');
  });
});

describe('letra del sistema al 200 % en 320dp', () => {
  beforeEach(() => simularVentana(VENTANAS.telefonoAngosto, 2));

  it('POS pasa a una columna y el total tiene tope de crecimiento', async () => {
    await renderizar(<PosScreen {...props<PantallaTab<'Vender'>>('Vender')} />);
    expect(anchoTarjeta('Arroz Costeño')).toBe(288); // una columna: 320 − 32
    await fireEvent.press(screen.getByTestId('producto-Pan francés'));
    expect(screen.getByTestId('total-pos').props.maxFontSizeMultiplier).toBe(1.6);
  });

  it('Cobro, Fiado, Cobranza, Inventario y Caja se dibujan sin errores', async () => {
    useCarrito.getState().agregar(productos[0]!);
    const pantallas = [
      <CobroScreen key="1" {...props<PantallaRaiz<'Cobro'>>('Cobro')} />,
      <ClientesScreen key="2" {...props<PantallaTab<'Fiado'>>('Fiado')} />,
      <CobranzaScreen key="3" {...props<PantallaRaiz<'Cobranza'>>('Cobranza')} />,
      <InventarioScreen key="4" {...props<PantallaTab<'Inventario'>>('Inventario')} />,
      <CajaScreen key="5" {...props<PantallaRaiz<'Caja'>>('Caja')} />,
    ];
    for (const ui of pantallas) {
      const { unmount } = await renderizar(ui);
      await act(async () => unmount());
    }
    // Cobranza en teléfono con letra grande apila sus dos métricas.
    await renderizar(<CobranzaScreen {...props<PantallaRaiz<'Cobranza'>>('Cobranza')} />);
    expect(screen.getByTestId('cobranza-por-cobrar').props.maxFontSizeMultiplier).toBe(1.6);
  });
});

describe('navegación', () => {
  const tabProps = () =>
    ({
      state: {
        index: 0,
        routes: ['Vender', 'Inventario', 'Fiado', 'Reportes', 'Ajustes'].map((name) => ({
          key: name,
          name,
        })),
      },
      descriptors: {},
      navigation: { emit: () => ({ defaultPrevented: false }), navigate: jest.fn() },
      insets: { top: 0, left: 0, right: 0, bottom: 0 },
    }) as unknown as BottomTabBarProps;

  it('riel lateral en expandida: no reserva alto al pie para los avisos', async () => {
    useCromoInferior.getState().fijarAltoPestanas(80);
    await renderizar(<BarraPestanas {...tabProps()} iconos={ICONOS_PESTANAS} riel />);
    expect(screen.getByTestId('riel-navegacion')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(useCromoInferior.getState().altoPestanas).toBe(0);
  });

  it('barra inferior por defecto', async () => {
    await renderizar(<BarraPestanas {...tabProps()} iconos={ICONOS_PESTANAS} />);
    expect(screen.getByTestId('barra-pestanas')).toBeTruthy();
  });

  it('diálogos con tope de 560dp en tablets, sin cambios en teléfonos', async () => {
    let estilo: unknown;
    function Sonda() {
      estilo = useEstiloDialogo();
      return null;
    }
    simularVentana(VENTANAS.posMostrador);
    const { unmount } = await renderizar(<Sonda />);
    expect(estilo).toEqual({ width: 560, alignSelf: 'center' });
    await act(async () => unmount());

    simularVentana(VENTANAS.telefono);
    await renderizar(<Sonda />);
    expect(estilo).toEqual({});
  });
});
