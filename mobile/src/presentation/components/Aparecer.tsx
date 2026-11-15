import { useEffect, useState, type ReactNode } from 'react';
import { Animated, type StyleProp, type ViewStyle } from 'react-native';

import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { espacio, movimiento } from '../theme/tokens';

interface Props {
  children: ReactNode;
  /** Retraso en ms para escalonar varios bloques. */
  retraso?: number;
  /** Cuánto sube al entrar (px). 8 por defecto; más para elementos que "llegan" (barras). */
  desplazamiento?: number;
  style?: StyleProp<ViewStyle>;
}

/** Retraso escalonado para listas: solo los primeros elementos, para no demorar el resto. */
export const retrasoEscalonado = (indice: number): number | null =>
  indice < 8 ? indice * 40 : null;

/**
 * Fila de lista con entrada escalonada (40 ms entre filas, solo las 8 primeras): la lista
 * "se arma" en lugar de aparecer de golpe, sin frenar listas largas en gama baja.
 */
export function EntradaLista({ indice, children }: { indice: number; children: ReactNode }) {
  const retraso = retrasoEscalonado(indice);
  if (retraso === null) return <>{children}</>;
  return <Aparecer retraso={retraso}>{children}</Aparecer>;
}

/** Entrada suave (opacidad + desplazamiento hacia arriba). */
export function Aparecer({ children, retraso = 0, desplazamiento = espacio.xs, style }: Props) {
  const reducir = useReducirMovimiento();
  const [progreso] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducir) {
      progreso.setValue(1);
      return;
    }
    const anim = Animated.timing(progreso, {
      toValue: 1,
      duration: movimiento.lento,
      delay: retraso,
      easing: movimiento.curva,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progreso, reducir, retraso]);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: progreso,
          transform: [
            {
              translateY: progreso.interpolate({
                inputRange: [0, 1],
                outputRange: [desplazamiento, 0],
              }),
            },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
