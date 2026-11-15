import type { ComponentProps } from 'react';
import { StyleSheet } from 'react-native';
import { Searchbar } from 'react-native-paper';

import { useTema } from '../hooks/useDerivados';
import { radio } from '../theme/tokens';

type Props = Omit<ComponentProps<typeof Searchbar>, 'elevation'>;

/** Searchbar con el mismo lenguaje que las tarjetas: fondo surface, borde sutil, sin tinte. */
export function Buscador({ style, inputStyle, ...resto }: Props) {
  const tema = useTema();
  return (
    <Searchbar
      elevation={0}
      style={[
        estilos.barra,
        {
          backgroundColor: tema.colors.surface,
          borderColor: tema.extra.borde,
          boxShadow: tema.extra.sombra[1],
        },
        style,
      ]}
      inputStyle={[estilos.input, inputStyle]}
      iconColor={tema.colors.onSurfaceVariant}
      placeholderTextColor={tema.colors.onSurfaceVariant}
      {...resto}
    />
  );
}

const estilos = StyleSheet.create({
  barra: { borderRadius: radio.md, borderWidth: StyleSheet.hairlineWidth * 2, minHeight: 48 },
  input: { minHeight: 0, fontSize: 15 },
});
