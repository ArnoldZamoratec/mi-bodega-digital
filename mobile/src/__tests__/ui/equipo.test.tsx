import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Linking } from 'react-native';

import type { Contenedor } from '@/data/contenedor';
import { EquipoMemoria } from '@/data/memoria/equipoMemoria';
import { BaseDatosMemoria, VentasMemoria } from '@/data/memoria/repositoriosMemoria';
import type { ResultadoSesion } from '@/data/sesion';
import { sesionDueno, type Miembro, type Sesion } from '@/domain/rules/roles';
import type { VentaNueva } from '@/domain/rules/venta';
import { registrarControlSesion, useIntencionUnirse } from '@/presentation/app/controlSesion';
import { DialogoConfirmacion } from '@/presentation/components/Confirmar';
import type { PantallaRaiz } from '@/presentation/navigation/tipos';
import { LoginScreen } from '@/presentation/screens/auth/LoginScreen';
import { formatearEntradaCodigo, textoVencimiento } from '@/presentation/screens/equipo/codigo';
import { EquipoScreen } from '@/presentation/screens/equipo/EquipoScreen';
import { SinAccesoScreen } from '@/presentation/screens/equipo/SinAccesoScreen';
import { UnirseEquipoScreen } from '@/presentation/screens/equipo/UnirseEquipoScreen';
import { useAvisos } from '@/presentation/stores/avisosStore';
import { useDatos } from '@/presentation/stores/datosStore';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { authFalso, renderizar } from '@/test-utils/renderizar';

/** D-33: Equipo (dueño), "Tengo un código de invitación" y cajero sin acceso. */

const lucho = sesionDueno('d1', 'Lucho');
const abrirUrl = jest.spyOn(Linking, 'openURL');

const props = <T,>(name: string) =>
  ({
    navigation: { navigate: jest.fn(), goBack: jest.fn(), setOptions: jest.fn(), reset: jest.fn() },
    route: { key: name, name },
  }) as unknown as T;

const cajero = (uid: string, nombre: string, activo = true): Miembro => ({
  uid,
  rol: 'cajero',
  nombre,
  email: `${uid}@x.pe`,
  activo,
  desde: new Date(),
  invitacion: 'ABCDEFGH',
});

async function entrarComo(sesion: Sesion, uid = sesion.uid) {
  const db = new BaseDatosMemoria();
  db.reloj = () => new Date();
  const ventas = new VentasMemoria(db);
  await ventas.confirmar({
    ventaId: 'v1',
    cargoId: null,
    venta: {
      items: [{ id: 'x', nombre: 'Arroz', precio: 4.2, cantidad: 2 }],
      total: 8.4,
      metodoDePago: 'Efectivo',
      clienteId: null,
      vendidoPor: 'c1',
      vendidoPorNombre: 'Rosa',
    } as VentaNueva,
    cargo: null,
    deltasStock: [],
    creadaEn: Date.now(),
  });
  const contenedor = { uid, sesion, ventas } as unknown as Contenedor;
  useSesion.getState().autenticar({ uid, email: `${uid}@x.pe`, rol: 'dueno' }, contenedor);
}

/** Simula `useArranque`: registra quién aplica la sesión nueva. */
function controlFalso() {
  const aplicadas: ResultadoSesion[] = [];
  const revalidar = jest.fn(async () => undefined);
  const cancelar = registrarControlSesion({
    aplicar: async (r) => {
      aplicadas.push(r);
    },
    revalidar,
  });
  return { aplicadas, revalidar, cancelar };
}

beforeEach(async () => {
  await AsyncStorage.clear();
  abrirUrl.mockReset();
  abrirUrl.mockResolvedValue(undefined);
  useRed.setState({ enLinea: true });
  useAvisos.getState().cerrar();
  useDatos.getState().reiniciar();
  useIntencionUnirse.getState().fijar(false);
});

describe('formato del código', () => {
  it('mayúsculas, sin símbolos, guion a la mitad y máximo 8', () => {
    expect(formatearEntradaCodigo('abcd')).toBe('ABCD');
    expect(formatearEntradaCodigo('abcde')).toBe('ABCD-E');
    expect(formatearEntradaCodigo('ab cd-ef gh zz')).toBe('ABCD-EFGH');
  });

  it('vencimiento en palabras', () => {
    const ahora = new Date(2026, 10, 16, 12);
    const en = (h: number) => new Date(ahora.getTime() + h * 3_600_000);
    expect(textoVencimiento(en(-1), ahora)).toBe('Venció');
    expect(textoVencimiento(en(5), ahora)).toBe('Vence hoy');
    expect(textoVencimiento(en(30), ahora)).toBe('Vence en 1 día');
    expect(textoVencimiento(en(24 * 6 + 2), ahora)).toBe('Vence en 6 días');
  });
});

describe('Equipo (dueño)', () => {
  it('invita: crea el código, abre WhatsApp con el mensaje y lo lista como pendiente', async () => {
    await entrarComo(lucho);
    const equipo = new EquipoMemoria();
    await renderizar(
      <EquipoScreen {...props<PantallaRaiz<'Equipo'>>('Equipo')} />,
      authFalso(),
      equipo,
    );

    expect(await screen.findByText(/Aún no tienes cajeros/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-invitar-cajero'));
    });
    await waitFor(() => expect(equipo.invitaciones.size).toBe(1));
    const [codigo] = [...equipo.invitaciones.keys()];
    const url = decodeURIComponent(String(abrirUrl.mock.calls[0]?.[0]));
    expect(url).toContain('https://wa.me/?text=');
    expect(url).toContain(`${codigo!.slice(0, 4)}-${codigo!.slice(4)}`);
    expect(await screen.findByTestId(`invitacion-${codigo}`)).toBeTruthy();
  });

  it('lista cajeros con lo que vendieron hoy; con 3 activos no deja invitar ni activar otro', async () => {
    await entrarComo(lucho);
    const equipo = new EquipoMemoria();
    equipo.miembros.set('d1/c1', cajero('c1', 'Rosa'));
    equipo.miembros.set('d1/c2', cajero('c2', 'Beto'));
    equipo.miembros.set('d1/c3', cajero('c3', 'Carla'));
    equipo.miembros.set('d1/c4', cajero('c4', 'Dani', false));
    await renderizar(
      <>
        <EquipoScreen {...props<PantallaRaiz<'Equipo'>>('Equipo')} />
        <DialogoConfirmacion />
      </>,
      authFalso(),
      equipo,
    );

    expect(await screen.findByText('Hoy vendió S/ 8.40')).toBeTruthy();
    expect(screen.getByTestId('boton-invitar-cajero')).toBeDisabled();
    expect(screen.getByTestId('equipo-cupos')).toHaveTextContent(/Ya tienes 3 cajeros activos/);

    await act(async () => {
      fireEvent(screen.getByTestId('activo-c4'), 'valueChange', true);
    });
    expect(equipo.miembros.get('d1/c4')?.activo).toBe(false);
    expect(useAvisos.getState().actual?.mensaje).toMatch(/3 cajeros activos/);

    // Pausar a uno libera el cupo.
    await act(async () => {
      fireEvent(screen.getByTestId('activo-c2'), 'valueChange', false);
    });
    await waitFor(() => expect(screen.getByTestId('boton-invitar-cajero')).toBeEnabled());

    // Quitar pide confirmación.
    await act(async () => {
      fireEvent.press(screen.getByTestId('quitar-c3'));
    });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('dialogo-confirmar-ok'));
    });
    await waitFor(() => expect(equipo.miembros.has('d1/c3')).toBe(false));
  });

  it('sin internet no invita (y lo explica)', async () => {
    await entrarComo(lucho);
    const equipo = new EquipoMemoria();
    await renderizar(
      <EquipoScreen {...props<PantallaRaiz<'Equipo'>>('Equipo')} />,
      authFalso(),
      equipo,
    );
    await screen.findByText(/Aún no tienes cajeros/);
    await act(async () => useRed.setState({ enLinea: false }));
    expect(screen.getByText(/Sin internet/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-invitar-cajero'));
    });
    expect(equipo.invitaciones.size).toBe(0);
  });
});

describe('Tengo un código de invitación', () => {
  async function preparar() {
    const equipo = new EquipoMemoria();
    equipo.invitaciones.set('ABCDEFGH', {
      codigo: 'ABCDEFGH',
      dueno: 'd1',
      rol: 'cajero',
      creada: new Date(),
      expira: new Date(Date.now() + 86_400_000),
      usadaPor: null,
      nombreBodega: 'Bodega Lucho',
    });
    // Rosa entra como dueña de su propia cuenta (aún no es cajera).
    await entrarComo(sesionDueno('c1', ''), 'c1');
    const p = props<PantallaRaiz<'UnirseEquipo'>>('UnirseEquipo');
    await renderizar(
      <>
        <UnirseEquipoScreen {...p} />
        <DialogoConfirmacion />
      </>,
      authFalso(),
      equipo,
    );
    return { equipo, p };
  }

  it('formatea el código, confirma la bodega y aplica la sesión de cajero', async () => {
    const { equipo, p } = await preparar();
    const control = controlFalso();
    await fireEvent.changeText(screen.getByTestId('campo-codigo'), 'abcdefgh');
    expect(screen.getByTestId('campo-codigo')).toHaveProp('value', 'ABCD-EFGH');
    await fireEvent.changeText(screen.getByTestId('campo-nombre-cajero'), 'Rosa');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-unirme'));
    });
    expect(await screen.findByText('¿Unirte a Bodega Lucho?')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('dialogo-confirmar-ok'));
    });
    await waitFor(() => expect(control.aplicadas).toHaveLength(1));
    expect(control.aplicadas[0]).toEqual({
      tipo: 'activa',
      sesion: { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' },
    });
    expect(equipo.cuentas.get('c1')?.bodega).toBe('d1');
    expect(equipo.miembros.get('d1/c1')).toMatchObject({ nombre: 'Rosa', activo: true });
    expect(p.navigation.reset).toHaveBeenCalled();
    control.cancelar();
  });

  it('sin internet lo dice claro y no escribe nada', async () => {
    const { equipo } = await preparar();
    await act(async () => useRed.setState({ enLinea: false }));
    expect(screen.getByTestId('unirse-sin-red')).toHaveTextContent(/necesitas internet/);
    await fireEvent.changeText(screen.getByTestId('campo-codigo'), 'ABCDEFGH');
    await fireEvent.changeText(screen.getByTestId('campo-nombre-cajero'), 'Rosa');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-unirme'));
    });
    expect(screen.getByTestId('unirse-error')).toHaveTextContent(/necesitas internet/);
    expect(equipo.invitaciones.get('ABCDEFGH')?.usadaPor).toBeNull();
  });

  it('código mal escrito o usado: mensaje del core', async () => {
    const { equipo } = await preparar();
    await fireEvent.changeText(screen.getByTestId('campo-nombre-cajero'), 'Rosa');
    await fireEvent.changeText(screen.getByTestId('campo-codigo'), 'ABC');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-unirme'));
    });
    expect(screen.getByTestId('unirse-error')).toHaveTextContent(/8 letras y números/);

    equipo.invitaciones.set('ABCDEFGH', {
      ...equipo.invitaciones.get('ABCDEFGH')!,
      usadaPor: 'otro',
    });
    await fireEvent.changeText(screen.getByTestId('campo-codigo'), 'ABCDEFGH');
    await act(async () => {
      fireEvent.press(screen.getByTestId('boton-unirme'));
    });
    expect(screen.getByTestId('unirse-error')).toHaveTextContent(/ya fue usado/);
  });

  it('en el login: "Tengo un código" deja la intención para después de entrar', async () => {
    await renderizar(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-tengo-codigo'));
    expect(useIntencionUnirse.getState().pendiente).toBe(true);
    expect(screen.getByTestId('login-aviso-codigo')).toBeTruthy();
  });
});

describe('Cajero sin acceso', () => {
  function sinAcceso(motivo: 'desactivado' | 'quitado') {
    useSesion.getState().sinAccesoA({ uid: 'c1', email: 'rosa@x.pe', rol: 'dueno' }, 'd1', motivo);
  }

  it('pausado: lo explica y "Revisar de nuevo" vuelve a consultar', async () => {
    sinAcceso('desactivado');
    const control = controlFalso();
    await renderizar(
      <SinAccesoScreen {...props<PantallaRaiz<'SinAcceso'>>('SinAcceso')} />,
      authFalso(),
      new EquipoMemoria(),
    );
    expect(screen.getByText('Tu acceso está pausado')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('sin-acceso-revisar'));
    });
    expect(control.revalidar).toHaveBeenCalled();
    control.cancelar();
  });

  it('quitado: "Usar mi propia bodega" borra la cuenta y vuelve a ser dueño', async () => {
    sinAcceso('quitado');
    const equipo = new EquipoMemoria();
    equipo.cuentas.set('c1', { uid: 'c1', bodega: 'd1', rol: 'cajero' });
    const control = controlFalso();
    await renderizar(
      <>
        <SinAccesoScreen {...props<PantallaRaiz<'SinAcceso'>>('SinAcceso')} />
        <DialogoConfirmacion />
      </>,
      authFalso(),
      equipo,
    );
    expect(screen.getByText('Ya no eres parte de esa bodega')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('sin-acceso-mi-bodega'));
    });
    await act(async () => {
      fireEvent.press(await screen.findByTestId('dialogo-confirmar-ok'));
    });
    await waitFor(() => expect(control.aplicadas).toHaveLength(1));
    expect(equipo.cuentas.has('c1')).toBe(false);
    expect(control.aplicadas[0]).toMatchObject({ sesion: { rol: 'dueno', bodega: 'c1' } });
    control.cancelar();
  });

  it('cerrar sesión siempre está disponible', async () => {
    sinAcceso('quitado');
    const auth = authFalso();
    await renderizar(
      <SinAccesoScreen {...props<PantallaRaiz<'SinAcceso'>>('SinAcceso')} />,
      auth,
      new EquipoMemoria(),
    );
    await act(async () => {
      fireEvent.press(screen.getByTestId('sin-acceso-salir'));
    });
    expect(auth.salir).toHaveBeenCalled();
  });
});
