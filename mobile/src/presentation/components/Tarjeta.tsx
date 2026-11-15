import { StyleSheet, View, type ViewProps } from 'react-native';

import { useTema } from '../hooks/useDerivados';
import { radio, type NivelSombra } from '../theme/tokens';

type Props = ViewProps & {
  /** 0 = plana (solo borde). */
  nivel?: 0 | NivelSombra;
  /** Color de fondo; por defecto `surface`. */
  fondo?: string;
};

/** Superficie base: borde casi invisible + sombra multicapa. Reemplaza a `Surface`. */
export function Tarjeta({ nivel = 1, fondo, style, ...resto }: Props) {
  const tema = useTema();
  return (
    <View
      style={[
        estilos.base,
        {
          backgroundColor: fondo ?? tema.colors.surface,
          borderColor: tema.extra.borde,
          boxShadow: nivel === 0 ? undefined : tema.extra.sombra[nivel],
        },
        style,
      ]}
      {...resto}
    />
  );
}

const estilos = StyleSheet.create({
  base: { borderRadius: radio.lg, borderWidth: StyleSheet.hairlineWidth * 2 },
});
