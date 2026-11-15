import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { ComponentProps } from 'react';
import { View } from 'react-native';

import { useTema } from '../hooks/useDerivados';
import { radio } from '../theme/tokens';

export type NombreIcono = ComponentProps<typeof MaterialCommunityIcons>['name'];

interface Props {
  nombre: NombreIcono;
  color?: string;
  fondo?: string;
  tamano?: number;
}

/** Icono sobre un cuadrado redondeado tintado (estilo Linear/Stripe). Decorativo. */
export function IconoSuave({ nombre, color, fondo, tamano = 40 }: Props) {
  const tema = useTema();
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{
        width: tamano,
        height: tamano,
        borderRadius: tamano >= 56 ? radio.xl : radio.md,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: fondo ?? tema.colors.secondaryContainer,
      }}
    >
      <MaterialCommunityIcons
        name={nombre}
        size={Math.round(tamano * 0.5)}
        color={color ?? tema.colors.primary}
      />
    </View>
  );
}
