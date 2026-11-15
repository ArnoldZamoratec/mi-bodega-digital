import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from 'react-native-paper';

import { useTema } from '../hooks/useDerivados';
import { useDatos } from '../stores/datosStore';
import { useRed } from '../stores/redStore';
import { espacio, radio } from '../theme/tokens';

interface Props {
  onPress?: () => void;
}

/** Aviso persistente de modo offline y de ventas pendientes de sincronizar. */
export function BannerConexion({ onPress }: Props) {
  const tema = useTema();
  const enLinea = useRed((s) => s.enLinea);
  const pendientes = useDatos((s) => s.pendientes.length);

  if (enLinea && pendientes === 0) return null;

  const texto = !enLinea
    ? pendientes > 0
      ? `Sin conexión · ${pendientes} venta(s) guardada(s) en el teléfono`
      : 'Sin conexión · puedes seguir vendiendo'
    : `Sincronizando ${pendientes} venta(s) pendiente(s)…`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={texto}
      testID="banner-conexion"
      style={({ pressed }) => [
        estilos.banner,
        {
          backgroundColor: tema.extra.fondoAdvertencia,
          borderColor: tema.extra.borde,
          opacity: pressed ? 0.8 : 1,
        },
      ]}
    >
      <MaterialCommunityIcons
        name={enLinea ? 'cloud-sync-outline' : 'cloud-off-outline'}
        size={18}
        color={tema.extra.advertencia}
      />
      <Text variant="labelLarge" style={{ color: tema.extra.advertencia, flex: 1 }}>
        {texto}
      </Text>
      {onPress ? (
        <MaterialCommunityIcons name="chevron-right" size={18} color={tema.extra.advertencia} />
      ) : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    marginHorizontal: espacio.md,
    marginTop: espacio.sm,
    paddingHorizontal: espacio.sm,
    paddingVertical: espacio.xs,
    minHeight: 40,
    borderRadius: radio.md,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
