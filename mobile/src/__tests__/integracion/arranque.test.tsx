import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import type { Contenedor } from '@/data/contenedor';
import { EquipoMemoria } from '@/data/memoria/equipoMemoria';
import { CacheSesion } from '@/data/sesion';
import type { Usuario } from '@/domain/entities';
import type { Sesion } from '@/domain/rules/roles';
import { useArranque } from '@/presentation/app/useArranque';
import { aplicarSesion } from '@/presentation/app/controlSesion';
import { useRed } from '@/presentation/stores/redStore';
import { useSesion } from '@/presentation/stores/sesionStore';

import { authFalso } from '@/test-utils/renderizar';

jest.mock('@/presentation/services/notificaciones', () => ({
  prepararNotificaciones: jest.fn(async () => true),
  alertarStockBajo: jest.fn(async () => undefined),
  programarRecordatorioFiado: jest.fn(async () => undefined),
}));
jest.mock('@react-native-community/netinfo', () => ({ addEventListener: () => () => undefined }));

/**
 * D-33: el rol se resuelve al iniciar sesión, con caché para abrir sin red. El cajero
 * escribe en `users/{bodega}`; el dueño sigue igual que antes.
 */

const vacio = () => () => undefined;
const sincronizaciones: string[] = [];

function contenedorFalso(sesion: Sesion): Contenedor {
  const sincronizador = {
    sincronizar: jest.fn(async () => {
      sincronizaciones.push(sesion.bodega);
      return { sincronizadas: 0, pendientes: 0, interrumpida: false, instanciaRota: false };
    }),
  };
  return {
    uid: sesion.uid,
    sesion,
    productos: { observar: vacio },
    clientes: { observar: vacio },
    fiado: { observarTodos: vacio },
    config: { observar: vacio },
    cola: { suscribir: vacio },
    cache: { leer: async () => null, guardar: async () => undefined },
    sincronizador,
    sincronizadorFiado: sincronizador,
    sincronizadorCaja: sincronizador,
  } as unknown as Contenedor;
}

const rosa: Usuario = { uid: 'c1', email: 'rosa@x.pe', rol: 'dueno' };

async function montar({ conServicios = true } = {}) {
  let emitir: (u: Usuario | null) => void = () => undefined;
  const auth = authFalso({
    observar: jest.fn((cb: (u: Usuario | null) => void) => {
      emitir = cb;
      return () => undefined;
    }),
  });
  const equipo = new EquipoMemoria();
  const cacheSesion = new CacheSesion(AsyncStorage);
  const crear = jest.fn(contenedorFalso);
  const servicios = conServicios ? { equipo, cacheSesion, nombreUsuario: () => '' } : undefined;
  await renderHook(() => useArranque(auth, crear, undefined, servicios));
  return { emitir: (u: Usuario | null) => emitir(u), equipo, cacheSesion, crear };
}

const hacerCajero = (equipo: EquipoMemoria, activo = true) => {
  equipo.cuentas.set('c1', { uid: 'c1', bodega: 'd1', rol: 'cajero' });
  equipo.miembros.set('d1/c1', {
    uid: 'c1',
    rol: 'cajero',
    nombre: 'Rosa',
    email: '',
    activo,
    desde: null,
    invitacion: 'ABCDEFGH',
  });
};

beforeEach(async () => {
  await AsyncStorage.clear();
  sincronizaciones.length = 0;
  useRed.setState({ enLinea: true });
  useSesion.getState().cerrar();
});

describe('useArranque · rol al iniciar sesión (D-33)', () => {
  it('sin servicios de equipo: dueño al instante, como antes', async () => {
    const { emitir, crear } = await montar({ conServicios: false });
    await act(async () => emitir(rosa));
    expect(crear).toHaveBeenCalledWith(
      expect.objectContaining({ uid: 'c1', bodega: 'c1', rol: 'dueno' }),
      expect.any(Function),
    );
    expect(useSesion.getState().estado).toBe('autenticado');
  });

  it('con red: el cajero trabaja en la bodega del dueño y se guarda para abrir sin red', async () => {
    const { emitir, equipo, cacheSesion } = await montar();
    hacerCajero(equipo);
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().sesion?.rol).toBe('cajero'));
    expect(useSesion.getState().contenedor?.sesion).toMatchObject({ uid: 'c1', bodega: 'd1' });
    await expect(cacheSesion.leer('c1')).resolves.toMatchObject({ sesion: { bodega: 'd1' } });
    await waitFor(() => expect(sincronizaciones).toContain('d1'));
  });

  it('sin red y con caché: el cajero abre en su bodega sin consultar al servidor', async () => {
    const { emitir, equipo, cacheSesion } = await montar();
    await cacheSesion.guardar('c1', {
      tipo: 'activa',
      sesion: { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' },
    });
    hacerCajero(equipo); // el listener del miembro (sin red, en Firestore no emitiría)
    const leerCuenta = jest.spyOn(equipo, 'leerCuenta');
    useRed.setState({ enLinea: false });
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().sesion?.bodega).toBe('d1'));
    expect(useSesion.getState().provisional).toBe(false);
    expect(leerCuenta).not.toHaveBeenCalled();
    expect(sincronizaciones).toHaveLength(0); // sin red no se abren transacciones (D-31)
  });

  it('sin red y sin caché: dueño provisional, sin sincronizar hasta confirmar el rol', async () => {
    const { emitir, crear } = await montar();
    useRed.setState({ enLinea: false });
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().estado).toBe('autenticado'));
    expect(useSesion.getState().provisional).toBe(true);
    expect(useSesion.getState().sesion).toMatchObject({ rol: 'dueno', bodega: 'c1' });
    expect(sincronizaciones).toHaveLength(0);

    // Vuelve la red: se confirma que es dueño, se conserva el contenedor y se sincroniza.
    await act(async () => useRed.setState({ enLinea: true }));
    await waitFor(() => expect(useSesion.getState().provisional).toBe(false));
    expect(crear).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sincronizaciones).toContain('c1'));
  });

  it('sin red y sin caché, pero era cajero: al volver la red pasa a su bodega', async () => {
    const { emitir, equipo } = await montar();
    hacerCajero(equipo);
    useRed.setState({ enLinea: false });
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().provisional).toBe(true));
    await act(async () => useRed.setState({ enLinea: true }));
    await waitFor(() => expect(useSesion.getState().sesion?.bodega).toBe('d1'));
    expect(sincronizaciones).not.toContain('c1'); // nada se mandó a su propia ruta
  });

  it('el dueño desactiva al cajero: pasa a "sin acceso" al instante', async () => {
    const { emitir, equipo } = await montar();
    hacerCajero(equipo);
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().sesion?.rol).toBe('cajero'));
    await act(async () => equipo.actualizarMiembro('d1', 'c1', { activo: false }));
    await waitFor(() => expect(useSesion.getState().estado).toBe('sin-acceso'));
    expect(useSesion.getState().sinAcceso).toEqual({ bodega: 'd1', motivo: 'desactivado' });
    expect(useSesion.getState().contenedor).toBeNull();
  });

  it('cajero desactivado al abrir: sin acceso', async () => {
    const { emitir, equipo } = await montar();
    hacerCajero(equipo, false);
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().estado).toBe('sin-acceso'));
  });

  it('aceptar una invitación cambia la sesión sin cerrar la de Firebase', async () => {
    const { emitir, cacheSesion, equipo } = await montar();
    await act(async () => emitir(rosa));
    await waitFor(() => expect(useSesion.getState().sesion?.rol).toBe('dueno'));
    hacerCajero(equipo); // lo que deja escrito la transacción de aceptar
    await act(async () =>
      aplicarSesion({
        tipo: 'activa',
        sesion: { uid: 'c1', bodega: 'd1', rol: 'cajero', nombre: 'Rosa' },
      }),
    );
    expect(useSesion.getState().sesion).toMatchObject({ rol: 'cajero', bodega: 'd1' });
    await expect(cacheSesion.leer('c1')).resolves.toMatchObject({ sesion: { rol: 'cajero' } });
  });
});
