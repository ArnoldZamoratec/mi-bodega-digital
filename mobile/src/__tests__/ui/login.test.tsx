import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { LoginScreen } from '@/presentation/screens/auth/LoginScreen';

import { authFalso, renderizar } from '@/test-utils/renderizar';

describe('LoginScreen', () => {
  it('valida campos vacíos sin llamar a Firebase', async () => {
    const auth = authFalso();
    await renderizar(<LoginScreen />, auth);

    await fireEvent.press(screen.getByTestId('boton-ingresar'));

    expect(await screen.findByText('Ingresa tu correo')).toBeTruthy();
    expect(screen.getByText('Ingresa tu contraseña')).toBeTruthy();
    expect(auth.ingresar).not.toHaveBeenCalled();
  });

  it('ingresa con correo y contraseña', async () => {
    const auth = authFalso();
    await renderizar(<LoginScreen />, auth);

    await fireEvent.changeText(screen.getByTestId('campo-email'), 'dueno@bodega.pe');
    await fireEvent.changeText(screen.getByTestId('campo-password'), 'secreto1');
    await fireEvent.press(screen.getByTestId('boton-ingresar'));

    await waitFor(() => expect(auth.ingresar).toHaveBeenCalledWith('dueno@bodega.pe', 'secreto1'));
  });

  it('muestra el error de Firebase traducido', async () => {
    const auth = authFalso({
      ingresar: jest.fn(async () => {
        throw Object.assign(new Error('x'), { code: 'auth/invalid-credential' });
      }),
    });
    await renderizar(<LoginScreen />, auth);

    await fireEvent.changeText(screen.getByTestId('campo-email'), 'dueno@bodega.pe');
    await fireEvent.changeText(screen.getByTestId('campo-password'), 'malaclave');
    await fireEvent.press(screen.getByTestId('boton-ingresar'));

    expect(await screen.findByText(/Credenciales inválidas/)).toBeTruthy();
  });

  it('registro: exige 6 caracteres y confirmación igual (RN-11)', async () => {
    const auth = authFalso();
    await renderizar(<LoginScreen />, auth);
    await fireEvent.press(screen.getByTestId('alternar-modo'));

    await fireEvent.changeText(screen.getByTestId('campo-email'), 'nuevo@bodega.pe');
    await fireEvent.changeText(screen.getByTestId('campo-password'), '123');
    await fireEvent.changeText(screen.getByTestId('campo-confirmacion'), '456');
    await fireEvent.press(screen.getByTestId('boton-registrar'));

    expect(await screen.findByText('La contraseña debe tener al menos 6 caracteres')).toBeTruthy();
    expect(screen.getByText('Las contraseñas no coinciden')).toBeTruthy();
    expect(auth.registrar).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByTestId('campo-password'), '123456');
    await fireEvent.changeText(screen.getByTestId('campo-confirmacion'), '123456');
    await fireEvent.press(screen.getByTestId('boton-registrar'));
    await waitFor(() => expect(auth.registrar).toHaveBeenCalledWith('nuevo@bodega.pe', '123456'));
  });
});

describe('LoginScreen · Google', () => {
  it('sin Google configurado no muestra el botón', async () => {
    await renderizar(<LoginScreen />, authFalso({ googleDisponible: false }));
    expect(screen.queryByTestId('boton-google')).toBeNull();
  });

  it('con Google configurado lo muestra y al tocar inicia sesión', async () => {
    const auth = authFalso({ googleDisponible: true });
    await renderizar(<LoginScreen />, auth);

    await fireEvent.press(screen.getByTestId('boton-google'));
    await waitFor(() => expect(auth.ingresarConGoogle).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('error-google')).toBeNull();
  });

  it('cerrar el selector de cuentas no es un error', async () => {
    const auth = authFalso({
      googleDisponible: true,
      ingresarConGoogle: jest.fn(async () => 'cancelado' as const),
    });
    await renderizar(<LoginScreen />, auth);

    await fireEvent.press(screen.getByTestId('boton-google'));
    await waitFor(() => expect(auth.ingresarConGoogle).toHaveBeenCalled());
    expect(screen.queryByTestId('error-google')).toBeNull();
  });

  it('un error de configuración se explica en español', async () => {
    const auth = authFalso({
      googleDisponible: true,
      ingresarConGoogle: jest.fn(async () => {
        throw Object.assign(new Error('x'), { code: 'DEVELOPER_ERROR' });
      }),
    });
    await renderizar(<LoginScreen />, auth);

    await fireEvent.press(screen.getByTestId('boton-google'));
    expect(await screen.findByText(/huella SHA-1/)).toBeTruthy();
  });
});
