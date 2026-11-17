import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { EquipoMovil } from '@/data/firebase/equipoFirestore';
import type { ServicioAuth } from '@/domain/ports';
import { ProveedorServicios } from '@/presentation/servicios';
import { temaClaro } from '@/presentation/theme/tema';

export const metricas = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

export function authFalso(parcial: Partial<ServicioAuth> = {}): jest.Mocked<ServicioAuth> {
  return {
    observar: jest.fn(() => () => undefined),
    ingresar: jest.fn(async () => undefined),
    registrar: jest.fn(async () => undefined),
    recuperarContrasena: jest.fn(async () => undefined),
    salir: jest.fn(async () => undefined),
    googleDisponible: false,
    ingresarConGoogle: jest.fn(async () => 'ok' as const),
    ...parcial,
  } as jest.Mocked<ServicioAuth>;
}

export async function renderizar(
  ui: ReactElement,
  auth: ServicioAuth = authFalso(),
  /** D-33: equipo en memoria para las pantallas de cajeros. */
  equipo?: EquipoMovil,
) {
  return await render(
    <SafeAreaProvider initialMetrics={metricas}>
      <PaperProvider theme={temaClaro}>
        <ProveedorServicios valor={{ auth, equipo }}>{ui}</ProveedorServicios>
      </PaperProvider>
    </SafeAreaProvider>,
  );
}
