import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { NavigationContainer } from '@react-navigation/native';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo } from 'react';
import { ScrollView, StyleSheet, useColorScheme } from 'react-native';
import { PaperProvider, Text } from 'react-native-paper';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { crearContenedor, crearServiciosEquipo } from '@/data/contenedor';
import { AuthFirebase } from '@/data/firebase/auth';
import { obtenerFirebase, reiniciarFirestore } from '@/data/firebase/client';
import { crearProveedorGoogle } from '@/data/google/proveedorGoogle';
import { googleWebClientId, variablesFaltantes } from '@/shared/env';

import { Avisos } from '../components/Avisos';
import { CelebracionVenta } from '../components/CelebracionVenta';
import { DialogoConfirmacion } from '../components/Confirmar';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { prepararMovimiento } from '../hooks/useReducirMovimiento';
import { Navegacion } from '../navigation/Navegacion';
import { ProveedorServicios } from '../servicios';
import { useTemaStore } from '../stores/temaStore';
import { temaClaro, temaNavegacion, temaOscuro } from '../theme/tema';
import { useArranque } from './useArranque';

// La splash sigue visible hasta que cargan las fuentes (evita el salto de tipografía).
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function App() {
  const sistema = useColorScheme();
  const preferencia = useTemaStore((s) => s.preferencia);
  const cargarTema = useTemaStore((s) => s.cargar);
  const oscuro = preferencia === 'oscuro' || (preferencia === 'sistema' && sistema === 'dark');
  const tema = oscuro ? temaOscuro : temaClaro;
  const faltantes = useMemo(() => variablesFaltantes(), []);

  const [fuentesListas, errorFuentes] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  // Si las fuentes fallan se sigue con las del sistema: nunca bloquear la caja.
  const listo = fuentesListas || !!errorFuentes;

  useEffect(() => {
    void cargarTema();
    // Mientras la splash sigue visible: así ninguna animación arranca antes de saber
    // si el usuario pidió quitar animaciones.
    void prepararMovimiento();
  }, [cargarTema]);

  useEffect(() => {
    if (listo) void SplashScreen.hideAsync();
  }, [listo]);

  if (!listo) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={tema}>
        <StatusBar style={oscuro ? 'light' : 'dark'} />
        <ErrorBoundary>
          {faltantes.length > 0 ? (
            <ConfiguracionFaltante variables={faltantes} />
          ) : (
            <AppConFirebase oscuro={oscuro} />
          )}
        </ErrorBoundary>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

function AppConFirebase({ oscuro }: { oscuro: boolean }) {
  const tema = oscuro ? temaOscuro : temaClaro;
  const servicios = useMemo(() => {
    const idCliente = googleWebClientId();
    const { equipo, cacheSesion } = crearServiciosEquipo();
    return {
      auth: new AuthFirebase(
        obtenerFirebase().auth,
        idCliente ? crearProveedorGoogle(idCliente) : undefined,
      ),
      equipo,
      sesion: {
        equipo,
        cacheSesion,
        nombreUsuario: () => obtenerFirebase().auth.currentUser?.displayName ?? '',
      },
    };
  }, []);
  useArranque(servicios.auth, crearContenedor, reiniciarFirestore, servicios.sesion);

  return (
    <ProveedorServicios valor={servicios}>
      <NavigationContainer theme={temaNavegacion(tema, oscuro)}>
        <Navegacion />
      </NavigationContainer>
      <DialogoConfirmacion />
      <Avisos />
      <CelebracionVenta />
    </ProveedorServicios>
  );
}

/** En lugar de un crash, explica cómo configurar `.env` (README §Configuración). */
function ConfiguracionFaltante({ variables }: { variables: string[] }) {
  return (
    <SafeAreaView style={estilos.flex}>
      <ScrollView contentContainerStyle={estilos.contenido}>
        <Text variant="headlineSmall">Falta configurar Firebase</Text>
        <Text>
          Copia mobile/.env.example como mobile/.env, completa estas variables y reinicia con `npx
          expo start -c`:
        </Text>
        {variables.map((v) => (
          <Text key={v} style={estilos.mono}>
            • {v}
          </Text>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: { padding: 24, gap: 12 },
  mono: { fontFamily: 'monospace' },
});
