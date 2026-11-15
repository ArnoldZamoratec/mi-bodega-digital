import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { Contenedor } from '@/data/contenedor';
import { RecordatoriosMemoria } from '@/data/memoria/cajaMemoria';
import type { Cliente, MovimientoFiado } from '@/domain/entities';
import type { PantallaRaiz } from '@/presentation/navigation/tipos';
import { CobranzaScreen } from '@/presentation/screens/fiado/CobranzaScreen';
import { useDatos } from '@/presentation/stores/datosStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { renderizar } from '@/test-utils/renderizar';

/** Mediodía de hace `n` días (hora local), para que "hace N días" sea estable. */
const haceDias = (n: number) => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12);
};

let sec = 0;
const mov = (clienteId: string, monto: number, fecha: Date, extra: Partial<MovimientoFiado> = {}) =>
  ({
    id: `m${++sec}`,
    clienteId,
    monto,
    descripcion: 'x',
    fecha,
    pagado: false,
    ...extra,
  }) satisfies MovimientoFiado;

const coleccion = <T,>(datos: T[]) => ({ datos, cargando: false, error: null, desdeCache: false });

function montar(clientes: Cliente[], movimientos: MovimientoFiado[]) {
  const recordatorios = new RecordatoriosMemoria();
  const contenedor = { uid: 'u', recordatorios } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid: 'u', email: 'a@b.pe', rol: 'dueno' }, contenedor);
  useDatos.setState({ clientes: coleccion(clientes), movimientos: coleccion(movimientos) });
  const navigate = jest.fn();
  const props = {
    navigation: { navigate, goBack: jest.fn() },
    route: { key: 'c', name: 'Cobranza' },
  } as unknown as PantallaRaiz<'Cobranza'>;
  return { recordatorios, navigate, props };
}

const abrirUrl = jest.spyOn(Linking, 'openURL');

beforeEach(() => {
  abrirUrl.mockReset();
  abrirUrl.mockResolvedValue(undefined);
  useDatos.getState().reiniciar();
});

describe('Cobranza', () => {
  it('ordena por deuda más antigua y muestra totales, antigüedad y último recordatorio', async () => {
    const { props, navigate } = montar(
      [
        { id: 'a', nombre: 'Ana', telefono: '987654321' },
        { id: 'b', nombre: 'Beto', telefono: '', ultimoRecordatorio: haceDias(5) },
        { id: 'c', nombre: 'Carla', telefono: '912345678' },
      ],
      [
        mov('a', 10, haceDias(2)),
        mov('b', 7.5, haceDias(9)),
        mov('c', 4, haceDias(20)),
        mov('c', -4, haceDias(0), { metodoPago: 'Efectivo' }), // Carla pagó todo hoy
        mov('c', -3, haceDias(40), { metodoPago: 'Efectivo' }), // otro mes: no suma
      ],
    );
    await renderizar(<CobranzaScreen {...props} />);

    expect(screen.getByTestId('cobranza-por-cobrar')).toHaveTextContent('S/ 17.50');
    expect(screen.getByTestId('cobranza-recuperado')).toHaveTextContent('S/ 4.00');
    // Carla está al día: no aparece. Beto debe desde hace más tiempo: va primero.
    expect(screen.queryByText('Carla')).toBeNull();
    const nombres = screen.getAllByText(/^(Ana|Beto)$/).map((n) => n.props.children);
    expect(nombres).toEqual(['Beto', 'Ana']);
    expect(screen.getByTestId('antiguedad-Beto')).toHaveTextContent('Debe desde hace 9 días');
    expect(screen.getByTestId('recordatorio-Beto')).toHaveTextContent(
      'Último recordatorio hace 5 días',
    );
    expect(screen.getByTestId('recordatorio-Ana')).toHaveTextContent('Aún sin recordatorio');
    // Sin celular no se ofrece WhatsApp.
    expect(screen.queryByTestId('recordar-Beto')).toBeNull();
    expect(screen.getByText('Sin celular registrado')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('cobro-Ana'));
    expect(navigate).toHaveBeenCalledWith('ClienteDetalle', { clienteId: 'a' });
  });

  it('"Recordar por WhatsApp" abre wa.me con un mensaje respetuoso y anota la hora', async () => {
    const { props, recordatorios } = montar(
      [{ id: 'a', nombre: 'Ana Torres', telefono: '987 654 321' }],
      [mov('a', 12.5, haceDias(3))],
    );
    await renderizar(<CobranzaScreen {...props} />);

    await act(async () => {
      fireEvent.press(screen.getByTestId('recordar-Ana Torres'));
    });

    await waitFor(() => expect(abrirUrl).toHaveBeenCalledTimes(1));
    const url = String(abrirUrl.mock.calls[0]?.[0]);
    expect(url.startsWith('https://wa.me/51987654321?text=')).toBe(true);
    expect(decodeURIComponent(url.split('text=')[1] ?? '')).toBe(
      'Hola Ana, te saluda tu bodega. Tu saldo pendiente es S/ 12.50. ¡Gracias!',
    );
    expect(recordatorios.registrados.map((r) => r.clienteId)).toEqual(['a']);

    // Llega el snapshot con el campo nuevo: la fila pasa a un estado discreto.
    await act(async () => {
      useDatos.setState({
        clientes: coleccion([
          {
            id: 'a',
            nombre: 'Ana Torres',
            telefono: '987 654 321',
            ultimoRecordatorio: recordatorios.registrados[0]?.fecha,
          },
        ]),
      });
    });
    expect(screen.getByTestId('recordatorio-Ana Torres')).toHaveTextContent(
      'Último recordatorio hoy',
    );
    expect(screen.queryByText('Recordar por WhatsApp')).toBeNull();
    expect(screen.getByTestId('recordar-Ana Torres')).toHaveTextContent(
      /Recordado hoy · volver a escribir$/,
    );
  });

  it('recordado hace poco: no bloquea, se puede volver a escribir', async () => {
    const { props, recordatorios } = montar(
      [{ id: 'a', nombre: 'Ana', telefono: '987654321', ultimoRecordatorio: haceDias(1) }],
      [mov('a', 5, haceDias(10))],
    );
    await renderizar(<CobranzaScreen {...props} />);

    expect(screen.getByTestId('recordar-Ana')).toHaveTextContent(
      /Recordado ayer · volver a escribir/,
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('recordar-Ana'));
    });
    await waitFor(() => expect(abrirUrl).toHaveBeenCalledTimes(1));
    expect(recordatorios.registrados).toHaveLength(1);
  });

  it('sin deudas muestra un estado vacío amable', async () => {
    const { props } = montar([{ id: 'a', nombre: 'Ana', telefono: '' }], []);
    await renderizar(<CobranzaScreen {...props} />);
    expect(screen.getByText('Nadie te debe')).toBeTruthy();
    expect(screen.getByTestId('cobranza-por-cobrar')).toHaveTextContent('S/ 0.00');
  });
});
