import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTema } from '../hooks/useDerivados';
import { ANCHO_PANEL_LISTA } from '../hooks/useDisposicion';

/** Tope del conjunto lista + detalle: en monitores o tablets de 13" no se estira de más. */
const ANCHO_MAXIMO = 1440;

/**
 * Lista–detalle (M3 "list-detail"), solo en disposición expandida: la lista queda a la
 * izquierda con ancho fijo y el detalle ocupa el resto, separados por una línea.
 */
export function DosPaneles({
  lista,
  detalle,
  testID,
}: {
  lista: ReactNode;
  detalle: ReactNode;
  testID?: string;
}) {
  const tema = useTema();
  return (
    <View style={estilos.fila} testID={testID}>
      <View style={[estilos.lista, { borderRightColor: tema.extra.borde }]}>{lista}</View>
      <View style={estilos.detalle} testID={testID ? `${testID}-detalle` : undefined}>
        {detalle}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  fila: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    maxWidth: ANCHO_MAXIMO,
    alignSelf: 'center',
  },
  lista: { width: ANCHO_PANEL_LISTA, borderRightWidth: StyleSheet.hairlineWidth * 2 },
  detalle: { flex: 1 },
});
