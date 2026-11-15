import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import type { Contenedor } from '@/data/contenedor';
import { clasificadorFirebase } from '@/data/firebase/errores';
import { CajaOffline, ColaCajaPersistente } from '@/data/local/cajaOffline';
import { CajaMemoria } from '@/data/memoria/cajaMemoria';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import type { MovimientoFiado } from '@/domain/entities';
import type { EntradaCola } from '@/domain/ports';
import type { OperacionCaja } from '@/domain/rules/caja';
import { SincronizadorCola } from '@/domain/usecases/sincronizarVentas';
import type { PantallaRaiz } from '@/presentation/navigation/tipos';
import { CajaScreen } from '@/presentation/screens/caja/CajaScreen';
import { useAvisos } from '@/presentation/stores/avisosStore';
import { useDatos } from '@/presentation/stores/datosStore';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';

const haceMin = (min: number) => new Date(Date.now() - min * 60_000);

const props = {
  navigation: { navigate: jest.fn(), goBack: jest.fn() },
  route: { key: 'c', name: 'Caja' },
} as unknown as PantallaRaiz<'Caja'>;

async function montar() {
  const db = new BaseDatosMemoria();
  db.reloj = () => new Date();
  const ventas = new VentasMemoria(db);
  const remoto = new CajaMemoria(db);
  const cola = new ColaCajaPersistente(AsyncStorage, 'u');
  const sincronizador = new SincronizadorCola<OperacionCaja>(
    cola,
    (op) => remoto.confirmar(op),
    (op) => op.id,
    clasificadorFirebase,
    50,
  );
  const caja = new CajaOffline({
    remoto,
    cola,
    sincronizar: () => sincronizador.sincronizar(),
    enLinea: () => true,
  });
  const contenedor = { uid: 'u', ventas, caja } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: 'u', email: 'a@b.pe', rol: 'dueno' }, contenedor);
  return { db, ventas, remoto };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  useRed.setState({ enLinea: true });
  useAvisos.getState().cerrar();
  useDatos.getState().reiniciar();
});

describe('Caja', () => {
  it('sin caja abierta: abre con el monto inicial y muestra el esperado', async () => {
    const { remoto } = await montar();
    await renderizar(<CajaScreen {...props} />);

    expect(await screen.findByText('Aún no cerraste ninguna caja.')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('campo-monto-inicial'), '50');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-abrir-caja'));
    });

    await waitFor(() => expect(screen.getByTestId('caja-esperado')).toHaveTextContent('S/ 50.00'));
    expect([...remoto.cajas.values()][0]).toMatchObject({
      estado: 'abierta',
      apertura: { monto: 50 },
    });
    expect(useAvisos.getState().actual?.mensaje).toBe('Caja abierta');
  });

  it('esperado = inicial + ventas y pagos en efectivo + ingresos − egresos; cierre con faltante', async () => {
    const { ventas, remoto } = await montar();
    await remoto.confirmar({
      id: 'c1',
      tipo: 'abrir',
      cajaId: 'c1',
      monto: 50,
      creadaEn: haceMin(60).getTime(),
    });
    // Venta en efectivo sincronizada, una Yape (no entra al cajón) y una aún en el teléfono.
    const operacion = (
      ventaId: string,
      total: number,
      metodo: 'Efectivo' | 'Yape/Plin',
      min: number,
    ) => ({
      ventaId,
      cargoId: null,
      venta: { items: [], total, metodoDePago: metodo, clienteId: null },
      cargo: null,
      deltasStock: [],
      creadaEn: haceMin(min).getTime(),
    });
    await ventas.confirmar(operacion('v1', 10, 'Efectivo', 30));
    await ventas.confirmar(operacion('v2', 99, 'Yape/Plin', 30));
    const abono: MovimientoFiado = {
      id: 'a1',
      clienteId: 'rosa',
      monto: -5,
      descripcion: 'Pago',
      fecha: haceMin(20),
      pagado: false,
      metodoPago: 'Efectivo',
    };
    useDatos.setState({
      movimientos: { datos: [abono], cargando: false, error: null, desdeCache: false },
      pendientes: [{ operacion: operacion('p1', 2, 'Efectivo', 10), intentos: 0 }] as EntradaCola[],
    });

    await renderizar(<CajaScreen {...props} />);
    await waitFor(() => expect(screen.getByTestId('caja-esperado')).toHaveTextContent('S/ 67.00'));
    expect(screen.getByTestId('detalle-ventas')).toHaveTextContent('S/ 12.00');
    expect(screen.getByTestId('detalle-abonos')).toHaveTextContent('S/ 5.00');

    // Egreso con motivo.
    await fireEvent.press(screen.getByTestId('boton-egreso'));
    expect(screen.getByTestId('guardar-mov')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('campo-monto-mov'), '7');
    await fireEvent.changeText(screen.getByTestId('campo-motivo-mov'), 'Pago al panadero');
    await act(async () => {
      fireEvent.press(screen.getByTestId('guardar-mov'));
    });
    await waitFor(() => expect(screen.getByTestId('caja-esperado')).toHaveTextContent('S/ 60.00'));
    expect(screen.getByTestId('detalle-egresos')).toHaveTextContent('- S/ 7.00');
    expect(screen.getByText('Pago al panadero')).toBeTruthy();

    // Cierre: cuenta S/ 58 → faltante de S/ 2.
    await fireEvent.press(screen.getByTestId('boton-cerrar-caja'));
    expect(screen.getByTestId('arqueo-esperado')).toHaveTextContent('S/ 60.00');
    await fireEvent.changeText(screen.getByTestId('campo-contado'), '58');
    expect(screen.getByTestId('arqueo-diferencia')).toHaveTextContent('Faltante S/ 2.00');
    await act(async () => {
      fireEvent.press(screen.getByTestId('confirmar-cierre'));
    });

    await waitFor(() => expect(remoto.cajas.get('c1')?.estado).toBe('cerrada'));
    expect(remoto.cajas.get('c1')?.cierre).toMatchObject({
      contado: 58,
      esperado: 60,
      diferencia: -2,
    });
    expect(useAvisos.getState().actual?.mensaje).toBe('Caja cerrada · Faltante S/ 2.00');
    // Vuelve el formulario de apertura y el cierre aparece en el historial.
    expect(await screen.findByTestId('boton-abrir-caja')).toBeTruthy();
    expect(screen.getByTestId('cierre-c1')).toHaveTextContent(/Faltante S\/ 2\.00/);
    expect(screen.getByTestId('cierre-c1')).toHaveTextContent(
      /Esperado S\/ 60\.00 · Contado S\/ 58\.00/,
    );
  });

  it('no permite abrir con un monto inválido', async () => {
    const { remoto } = await montar();
    await renderizar(<CajaScreen {...props} />);
    await fireEvent.changeText(await screen.findByTestId('campo-monto-inicial'), 'abc');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-abrir-caja'));
    });
    expect(remoto.cajas.size).toBe(0);
    expect(useAvisos.getState().actual?.tipo).toBe('error');
  });
});
