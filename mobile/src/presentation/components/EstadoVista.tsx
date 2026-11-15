import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Text } from 'react-native-paper';

import { useTema } from '../hooks/useDerivados';
import { espacio } from '../theme/tokens';
import { Aparecer } from './Aparecer';
import { Esqueleto } from './Esqueleto';
import { IconoSuave, type NombreIcono } from './IconoSuave';

interface Props {
  tipo: 'cargando' | 'vacio' | 'error';
  titulo?: string;
  mensaje?: string;
  icono?: NombreIcono;
  accion?: { etiqueta: string; onPress: () => void };
  /** Solo para `cargando`: muestra filas fantasma con la forma de la lista. */
  esqueleto?: boolean;
  testID?: string;
}

/** Estados loading / empty / error homogéneos en toda la app. */
export function EstadoVista({ tipo, titulo, mensaje, icono, accion, esqueleto, testID }: Props) {
  const tema = useTema();

  if (tipo === 'cargando') {
    if (esqueleto) return <Esqueleto testID={testID} />;
    return (
      <View
        style={estilos.contenedor}
        testID={testID ?? 'estado-cargando'}
        accessibilityLabel="Cargando"
      >
        <ActivityIndicator size="large" />
        {mensaje ? (
          <Text style={[estilos.mensaje, { color: tema.colors.onSurfaceVariant }]}>{mensaje}</Text>
        ) : null}
      </View>
    );
  }

  const esError = tipo === 'error';
  return (
    <Aparecer style={estilos.contenedor}>
      <View
        style={estilos.interior}
        testID={testID ?? `estado-${tipo}`}
        accessibilityRole={esError ? 'alert' : 'summary'}
      >
        <IconoSuave
          nombre={icono ?? (esError ? 'alert-circle-outline' : 'tray-remove')}
          tamano={72}
          color={esError ? tema.colors.error : tema.colors.primary}
          fondo={esError ? tema.extra.fondoDeuda : tema.colors.secondaryContainer}
        />
        {titulo ? (
          <Text variant="titleLarge" style={[estilos.titulo, { color: tema.colors.onSurface }]}>
            {titulo}
          </Text>
        ) : null}
        {mensaje ? (
          <Text
            variant="bodyMedium"
            style={[estilos.mensaje, { color: tema.colors.onSurfaceVariant }]}
          >
            {mensaje}
          </Text>
        ) : null}
        {accion ? (
          <Button
            mode="contained"
            onPress={accion.onPress}
            style={estilos.boton}
            contentStyle={estilos.botonContenido}
          >
            {accion.etiqueta}
          </Button>
        ) : null}
      </View>
    </Aparecer>
  );
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espacio.xl },
  interior: { alignItems: 'center', gap: espacio.xs, maxWidth: 320 },
  titulo: { textAlign: 'center', marginTop: espacio.sm },
  mensaje: { textAlign: 'center', lineHeight: 20 },
  boton: { marginTop: espacio.md },
  botonContenido: { minHeight: 48, paddingHorizontal: espacio.xs },
});
