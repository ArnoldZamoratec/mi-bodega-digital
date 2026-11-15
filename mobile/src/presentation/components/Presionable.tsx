import { useState, type ReactNode } from 'react';
import {
  Animated,
  Pressable,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTema } from '../hooks/useDerivados';
import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { ESCALA_PRESION, movimiento } from '../theme/tokens';

type Props = Omit<PressableProps, 'style' | 'children'> & {
  style?: StyleProp<ViewStyle>;
  /** Estilo del área táctil exterior (p. ej. `flex: 1` dentro de una fila). */
  contenedorStyle?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * Elemento táctil con microinteracción: se hunde levemente al presionar (escala + curva
 * expo-out), ripple en Android y estado deshabilitado atenuado. Sin animación si el usuario
 * pidió reducir movimiento.
 */
export function Presionable({
  style,
  contenedorStyle,
  children,
  disabled,
  onPressIn,
  onPressOut,
  ...resto
}: Props) {
  const tema = useTema();
  const reducir = useReducirMovimiento();
  const [escala] = useState(() => new Animated.Value(1));

  const animar = (a: number, duracion: number) => {
    if (reducir) return;
    Animated.timing(escala, {
      toValue: a,
      duration: duracion,
      easing: movimiento.curva,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable
      disabled={disabled}
      onPressIn={(e) => {
        animar(ESCALA_PRESION, movimiento.rapido);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        animar(1, movimiento.lento);
        onPressOut?.(e);
      }}
      android_ripple={{ color: tema.colors.primaryContainer, foreground: true }}
      accessibilityState={{ disabled: !!disabled }}
      style={contenedorStyle}
      {...resto}
    >
      <Animated.View
        style={[style, { transform: [{ scale: escala }] }, disabled && { opacity: 0.5 }]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
