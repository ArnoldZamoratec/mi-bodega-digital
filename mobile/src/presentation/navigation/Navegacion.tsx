import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNativeStackNavigator,
  type NativeStackNavigationOptions,
} from '@react-navigation/native-stack';
import { setStatusBarStyle } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useEffect, type ReactNode } from 'react';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIntencionUnirse } from '../app/controlSesion';
import { EstadoVista } from '../components/EstadoVista';
import { useTema } from '../hooks/useDerivados';
import { useDisposicion } from '../hooks/useDisposicion';
import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { AjustesScreen } from '../screens/ajustes/AjustesScreen';
import { DatosNegocioScreen } from '../screens/ajustes/DatosNegocioScreen';
import { CajaScreen } from '../screens/caja/CajaScreen';
import { EquipoScreen } from '../screens/equipo/EquipoScreen';
import { SinAccesoScreen } from '../screens/equipo/SinAccesoScreen';
import { UnirseEquipoScreen } from '../screens/equipo/UnirseEquipoScreen';
import { CobranzaScreen } from '../screens/fiado/CobranzaScreen';
import { HistorialVentasScreen } from '../screens/ventas/HistorialVentasScreen';
import { VentasPendientesScreen } from '../screens/ajustes/VentasPendientesScreen';
import { LoginScreen } from '../screens/auth/LoginScreen';
import { ClienteDetalleScreen } from '../screens/fiado/ClienteDetalleScreen';
import { ClienteFormScreen } from '../screens/fiado/ClienteFormScreen';
import { ClientesScreen } from '../screens/fiado/ClientesScreen';
import { MovimientoFormScreen } from '../screens/fiado/MovimientoFormScreen';
import { InventarioScreen } from '../screens/inventario/InventarioScreen';
import { ProductoFormScreen } from '../screens/inventario/ProductoFormScreen';
import { CobroScreen } from '../screens/pos/CobroScreen';
import { EscanerScreen } from '../screens/pos/EscanerScreen';
import { PosScreen } from '../screens/pos/PosScreen';
import { ReportesScreen } from '../screens/reportes/ReportesScreen';
import { useCarrito } from '../stores/carritoStore';
import { useCromoInferior } from '../stores/cromoInferiorStore';
import { usePuede, useSesion } from '../stores/sesionStore';
import { familia } from '../theme/tema';
import { BarraPestanas } from './BarraPestanas';
import { ICONOS_PESTANAS } from './iconosPestanas';
import type { RaizParams, TabsParams } from './tipos';

const Pila = createNativeStackNavigator<RaizParams>();
const Tabs = createBottomTabNavigator<TabsParams>();

type Animacion = NonNullable<NativeStackNavigationOptions['animation']>;

/**
 * Lenguaje de movimiento de la navegación: cada transición dice qué tipo de pantalla es.
 *  - profundizar: ver el detalle de algo (entra desde la derecha, como avanzar).
 *  - tarea: completar algo y volver (sube desde abajo, como una hoja).
 *  - camara: cambio de contexto total (fundido).
 */
const TRANSICION = {
  profundizar: 'slide_from_right',
  tarea: 'slide_from_bottom',
  camara: 'fade',
} as const satisfies Record<string, Animacion>;

/** Cabecera plana (pantallas apiladas), con la tipografía de la marca. */
function useCabecera() {
  const tema = useTema();
  return {
    headerStyle: { backgroundColor: tema.colors.background },
    headerShadowVisible: false,
    headerTintColor: tema.colors.onSurface,
    headerTitleStyle: { fontSize: 18, fontFamily: familia.negrita },
  };
}

/**
 * Con el riel a la izquierda, la muesca/cámara lateral ya la absorbe el riel: las pantallas
 * ven inset izquierdo 0 para no sumar ese margen dos veces.
 */
function SinInsetIzquierdo({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <SafeAreaInsetsContext.Provider value={{ ...insets, left: 0 }}>
      {children}
    </SafeAreaInsetsContext.Provider>
  );
}

function PestanasPrincipales() {
  const enCarrito = useCarrito((s) => s.items.reduce((n, i) => n + i.cantidad, 0));
  const reducirMovimiento = useReducirMovimiento();
  // D-30: barra inferior en compacta/media; riel lateral (tabBarPosition 'left', soportado
  // por @react-navigation/bottom-tabs v7) en expandida: tablets horizontales y POS.
  const riel = useDisposicion().dosPaneles;
  // D-33: el cajero no ve reportes ni ganancias (no es secreto en las reglas: solo se oculta).
  const verReportes = usePuede('verReportes');
  const navigation = useNavigation();
  const quiereUnirse = useIntencionUnirse((s) => s.pendiente);

  // "Tengo un código de invitación" tocado en el login: ya con sesión, se abre la pantalla.
  useEffect(() => {
    if (!quiereUnirse) return;
    useIntencionUnirse.getState().fijar(false);
    navigation.navigate('UnirseEquipo');
  }, [quiereUnirse, navigation]);

  return (
    <Tabs.Navigator
      tabBar={(props) => (
        <BarraPestanas
          {...props}
          iconos={ICONOS_PESTANAS}
          insignias={{ Vender: enCarrito > 0 ? enCarrito : undefined }}
          riel={riel}
        />
      )}
      screenLayout={
        riel ? ({ children }) => <SinInsetIzquierdo>{children}</SinInsetIzquierdo> : undefined
      }
      // Cada pestaña dibuja su propio encabezado con degradado. Al cambiar de pestaña el
      // contenido se desplaza levemente en la dirección del toque ("shift").
      screenOptions={{
        headerShown: false,
        lazy: true,
        animation: reducirMovimiento ? 'none' : 'shift',
        tabBarPosition: riel ? 'left' : 'bottom',
      }}
    >
      <Tabs.Screen name="Vender" component={PosScreen} options={{ tabBarLabel: 'Vender' }} />
      <Tabs.Screen name="Inventario" component={InventarioScreen} />
      <Tabs.Screen name="Fiado" component={ClientesScreen} />
      {verReportes ? <Tabs.Screen name="Reportes" component={ReportesScreen} /> : null}
      <Tabs.Screen name="Ajustes" component={AjustesScreen} />
    </Tabs.Navigator>
  );
}

export function Navegacion() {
  const tema = useTema();
  const cabecera = useCabecera();
  const reducirMovimiento = useReducirMovimiento();
  const estado = useSesion((s) => s.estado);
  const mover = (a: Animacion): Animacion => (reducirMovimiento ? 'none' : a);

  if (estado === 'cargando') return <EstadoVista tipo="cargando" mensaje="Iniciando…" />;

  return (
    <Pila.Navigator
      // Pantallas apiladas: fondo claro/oscuro según el tema. Las pestañas usan texto claro
      // sobre su degradado (EncabezadoHero) y el login lo fija él mismo.
      screenListeners={({ route }) => ({
        focus: () => {
          // Los avisos flotan sobre las pestañas solo cuando estas se ven.
          useCromoInferior.getState().fijarPestanasVisibles(route.name === 'Tabs');
          if (route.name !== 'Tabs' && route.name !== 'Login' && route.name !== 'Escaner')
            setStatusBarStyle(tema.dark ? 'light' : 'dark');
        },
      })}
      screenOptions={{
        ...cabecera,
        animation: mover(TRANSICION.profundizar),
        // Dentro del rango de la marca (150–250 ms): ágil, no apurado.
        animationDuration: 250,
        // Volver deslizando desde el borde, como en el resto del sistema.
        gestureEnabled: true,
        contentStyle: { backgroundColor: tema.colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      {estado === 'anonimo' ? (
        <Pila.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false, animation: mover('fade') }}
        />
      ) : estado === 'sin-acceso' ? (
        <Pila.Screen
          name="SinAcceso"
          component={SinAccesoScreen}
          options={{ headerShown: false, animation: mover('fade') }}
        />
      ) : (
        <>
          <Pila.Screen
            name="Tabs"
            component={PestanasPrincipales}
            options={{ headerShown: false, animation: mover('fade') }}
          />
          <Pila.Screen
            name="Cobro"
            component={CobroScreen}
            options={{ title: 'Cobrar', animation: mover(TRANSICION.tarea) }}
          />
          <Pila.Screen
            name="Escaner"
            component={EscanerScreen}
            options={{ title: 'Escanear', headerShown: true, animation: mover(TRANSICION.camara) }}
          />
          <Pila.Screen
            name="ProductoForm"
            component={ProductoFormScreen}
            options={{ title: 'Producto', animation: mover(TRANSICION.tarea) }}
          />
          <Pila.Screen name="ClienteDetalle" component={ClienteDetalleScreen} />
          <Pila.Screen
            name="ClienteForm"
            component={ClienteFormScreen}
            options={{ title: 'Cliente', animation: mover(TRANSICION.tarea) }}
          />
          <Pila.Screen
            name="MovimientoForm"
            component={MovimientoFormScreen}
            options={{ animation: mover(TRANSICION.tarea) }}
          />
          <Pila.Screen
            name="VentasPendientes"
            component={VentasPendientesScreen}
            options={{ title: 'Ventas pendientes' }}
          />
          <Pila.Screen
            name="HistorialVentas"
            component={HistorialVentasScreen}
            options={{ title: 'Ventas' }}
          />
          <Pila.Screen name="Cobranza" component={CobranzaScreen} options={{ title: 'Cobranza' }} />
          <Pila.Screen name="Caja" component={CajaScreen} options={{ title: 'Caja' }} />
          <Pila.Screen name="Equipo" component={EquipoScreen} options={{ title: 'Equipo' }} />
          <Pila.Screen
            name="UnirseEquipo"
            component={UnirseEquipoScreen}
            options={{ animation: mover(TRANSICION.tarea) }}
          />
          <Pila.Screen
            name="DatosNegocio"
            component={DatosNegocioScreen}
            options={{ title: '', animation: mover(TRANSICION.tarea) }}
          />
        </>
      )}
    </Pila.Navigator>
  );
}
