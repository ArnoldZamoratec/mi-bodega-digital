import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useEffect, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useTema } from '../hooks/useDerivados';
import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { haptica } from '../services/haptica';
import { useCromoInferior } from '../stores/cromoInferiorStore';
import { espacio, movimiento, NUMEROS, radio } from '../theme/tokens';
import type { IconoPestana } from './iconosPestanas';

interface Props extends BottomTabBarProps {
  iconos: Record<string, IconoPestana>;
  insignias?: Record<string, number | undefined>;
}

/**
 * Barra de pestañas propia: indicador en "píldora" detrás del ícono activo, ícono duotono
 * de marca (contorno verde + relleno ámbar, como el toldo del logo) que rebota al activarse,
 * etiquetas siempre visibles y objetivo táctil de toda la columna.
 */
export function BarraPestanas({ state, descriptors, navigation, iconos, insignias }: Props) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const fijarAlto = useCromoInferior((s) => s.fijarAltoPestanas);

  return (
    <View
      onLayout={(e) => fijarAlto(e.nativeEvent.layout.height)}
      style={[
        estilos.barra,
        {
          paddingBottom: Math.max(insets.bottom, espacio.xs),
          paddingLeft: espacio.xxs + insets.left,
          paddingRight: espacio.xxs + insets.right,
          backgroundColor: tema.colors.surface,
          borderTopColor: tema.extra.borde,
          boxShadow: tema.extra.sombraArriba,
        },
      ]}
      accessibilityRole="tablist"
    >
      {state.routes.map((ruta, i) => {
        const activo = state.index === i;
        const opciones = descriptors[ruta.key]?.options;
        const etiqueta =
          typeof opciones?.tabBarLabel === 'string' ? opciones.tabBarLabel : ruta.name;
        const icono = iconos[ruta.name];
        const insignia = insignias?.[ruta.name];

        const alPresionar = () => {
          const evento = navigation.emit({
            type: 'tabPress',
            target: ruta.key,
            canPreventDefault: true,
          });
          if (!activo && !evento.defaultPrevented) {
            haptica.toque();
            navigation.navigate(ruta.name, ruta.params);
          }
        };

        return (
          <Pressable
            key={ruta.key}
            onPress={alPresionar}
            onLongPress={() => navigation.emit({ type: 'tabLongPress', target: ruta.key })}
            accessibilityRole="tab"
            accessibilityState={{ selected: activo }}
            accessibilityLabel={insignia ? `${etiqueta}, ${insignia} en el carrito` : etiqueta}
            testID={`tab-${ruta.name}`}
            style={estilos.item}
          >
            <Pildora activo={activo}>
              {icono ? <IconoAnimado icono={icono} activo={activo} /> : null}
              {insignia ? (
                <View
                  style={[
                    estilos.insignia,
                    // Marca, no error: el rojo se reserva para deuda/error (IDENTIDAD_VISUAL §3).
                    { backgroundColor: tema.colors.primary, borderColor: tema.colors.surface },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    maxFontSizeMultiplier={1.3}
                    style={[NUMEROS, { color: tema.colors.onPrimary }]}
                  >
                    {insignia > 99 ? '99+' : insignia}
                  </Text>
                </View>
              ) : null}
            </Pildora>
            <Text
              variant="labelSmall"
              numberOfLines={1}
              // Cromo de navegación: crece con la fuente del sistema hasta 1.3× para no
              // cortar "Inventario" en teléfonos angostos; el lector de pantalla lee la
              // etiqueta completa igual (accessibilityLabel).
              maxFontSizeMultiplier={1.3}
              // En 320dp con letra 1.3× "Inventario" no entra en ~62dp: se ajusta un poco en
              // vez de mostrar "Inventa…" (probado en Galaxy A24 a densidad de 320dp).
              adjustsFontSizeToFit
              minimumFontScale={0.75}
              style={{ color: activo ? tema.colors.onSurface : tema.colors.onSurfaceVariant }}
            >
              {etiqueta}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TAMANO_ICONO = 24;

/** Al activarse el ícono crece y vuelve (resorte), como una tecla que se presiona. */
function IconoAnimado({ icono, activo }: { icono: IconoPestana; activo: boolean }) {
  const tema = useTema();
  const reducir = useReducirMovimiento();
  const [escala] = useState(() => new Animated.Value(1));

  useEffect(() => {
    if (!activo || reducir) return;
    escala.setValue(0.82);
    Animated.spring(escala, {
      toValue: 1,
      friction: 4,
      tension: 180,
      useNativeDriver: true,
    }).start();
  }, [activo, escala, reducir]);

  return (
    <Animated.View style={{ transform: [{ scale: escala }] }}>
      <Svg width={TAMANO_ICONO} height={TAMANO_ICONO} viewBox="0 0 256 256">
        {activo ? (
          <>
            <Path d={icono.relleno} fill={tema.extra.acento} opacity={tema.dark ? 0.55 : 0.9} />
            <Path d={icono.trazo} fill={tema.colors.primary} />
          </>
        ) : (
          <Path d={icono.contorno} fill={tema.colors.onSurfaceVariant} />
        )}
      </Svg>
    </Animated.View>
  );
}

function Pildora({ activo, children }: { activo: boolean; children: ReactNode }) {
  const tema = useTema();
  const reducir = useReducirMovimiento();
  const [progreso] = useState(() => new Animated.Value(activo ? 1 : 0));

  useEffect(() => {
    if (reducir) {
      progreso.setValue(activo ? 1 : 0);
      return;
    }
    Animated.timing(progreso, {
      toValue: activo ? 1 : 0,
      duration: movimiento.lento,
      easing: movimiento.curva,
      useNativeDriver: true,
    }).start();
  }, [activo, progreso, reducir]);

  return (
    <View style={estilos.pildora}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: radio.completo,
            backgroundColor: tema.colors.secondaryContainer,
            opacity: progreso,
            transform: [
              { scaleX: progreso.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
            ],
          },
        ]}
      />
      {children}
    </View>
  );
}

const estilos = StyleSheet.create({
  barra: {
    flexDirection: 'row',
    paddingTop: espacio.xs,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  item: { flex: 1, alignItems: 'center', gap: espacio.xxs, minHeight: 56 },
  // En 320dp cada columna mide ~62dp: la píldora se adapta en vez de desbordar.
  pildora: {
    width: '100%',
    maxWidth: 64,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insignia: {
    position: 'absolute',
    top: -4,
    right: 8,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 4,
    borderRadius: radio.completo,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
