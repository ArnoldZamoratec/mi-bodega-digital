import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useTema } from '../hooks/useDerivados';
import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { espacio, radio } from '../theme/tokens';

interface Props {
  filas?: number;
  testID?: string;
}

/** Carga con la forma del contenido (filas de lista) en lugar de un spinner suelto. */
export function Esqueleto({ filas = 6, testID }: Props) {
  const tema = useTema();
  const reducir = useReducirMovimiento();
  const [pulso] = useState(() => new Animated.Value(0.55));

  useEffect(() => {
    if (reducir) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulso, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulso, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [pulso, reducir]);

  const bloque = { backgroundColor: tema.colors.surfaceVariant };

  return (
    <View
      style={estilos.contenedor}
      testID={testID ?? 'estado-cargando'}
      accessible
      accessibilityLabel="Cargando"
      accessibilityRole="progressbar"
    >
      {Array.from({ length: filas }, (_, i) => (
        <Animated.View
          key={i}
          style={[
            estilos.fila,
            { backgroundColor: tema.colors.surface, borderColor: tema.extra.borde, opacity: pulso },
          ]}
        >
          <View style={[estilos.circulo, bloque]} />
          <View style={estilos.textos}>
            <View style={[estilos.linea, bloque, { width: `${70 - (i % 3) * 12}%` }]} />
            <View style={[estilos.linea, estilos.corta, bloque]} />
          </View>
          <View style={[estilos.monto, bloque]} />
        </Animated.View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: espacio.md, gap: espacio.xs },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    padding: espacio.md,
    borderRadius: radio.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  circulo: { width: 40, height: 40, borderRadius: radio.md },
  textos: { flex: 1, gap: espacio.xs },
  linea: { height: 12, borderRadius: radio.sm },
  corta: { width: '35%' },
  monto: { width: 56, height: 16, borderRadius: radio.sm },
});
