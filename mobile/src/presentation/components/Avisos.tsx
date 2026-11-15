import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { StyleSheet, View } from 'react-native';
import { Snackbar, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../hooks/useDerivados';
import { useAvisos, type TipoAviso } from '../stores/avisosStore';
import { useReservaInferior } from '../stores/cromoInferiorStore';
import { ambar, ladrillo, noche, verde } from '../theme/paleta';
import type { TemaApp } from '../theme/tema';
import { espacio, radio } from '../theme/tokens';

/**
 * Aviso flotante en Tinta (superficie inversa) con ícono de color por tipo: el color
 * acompaña, no grita. El estado nunca depende solo del color (ícono + texto).
 */
export function Avisos() {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const reserva = useReservaInferior();
  const actual = useAvisos((s) => s.actual);
  const cerrar = useAvisos((s) => s.cerrar);
  const estilo = estiloAviso(tema, actual?.tipo ?? 'info');
  const accion = actual?.accion;

  return (
    <Snackbar
      key={actual?.id}
      visible={actual !== null}
      onDismiss={cerrar}
      // Con "Deshacer" se da más tiempo para reaccionar.
      duration={accion ? 6000 : actual?.tipo === 'error' ? 5000 : 2800}
      // Encima de la barra de pestañas y de la barra de Cobrar, nunca tapándolas.
      wrapperStyle={{
        bottom: reserva > 0 ? reserva : insets.bottom,
        left: insets.left,
        right: insets.right,
      }}
      style={[
        estilos.aviso,
        { backgroundColor: tema.colors.inverseSurface, boxShadow: tema.extra.sombra[3] },
      ]}
      action={{
        label: accion?.etiqueta ?? 'OK',
        onPress: () => {
          accion?.alPresionar();
          cerrar();
        },
        textColor: tema.colors.inversePrimary,
      }}
      accessibilityLiveRegion="polite"
      testID="aviso"
    >
      <View style={estilos.fila}>
        <View style={[estilos.icono, { backgroundColor: estilo.fondo }]}>
          <MaterialCommunityIcons name={estilo.icono} size={16} color={estilo.color} />
        </View>
        <Text variant="bodyMedium" style={[estilos.texto, { color: tema.colors.inverseOnSurface }]}>
          {actual?.mensaje ?? ''}
        </Text>
      </View>
    </Snackbar>
  );
}

function estiloAviso(tema: TemaApp, tipo: TipoAviso) {
  // Sobre la superficie inversa los colores "del otro modo" son los legibles.
  const claroSobreOscuro = !tema.dark;
  switch (tipo) {
    case 'exito':
      return {
        icono: 'check-circle' as const,
        color: claroSobreOscuro ? verde[300] : verde[600],
        fondo: claroSobreOscuro ? noche[800] : verde[50],
      };
    case 'error':
      return {
        icono: 'alert-circle' as const,
        color: claroSobreOscuro ? ladrillo[300] : ladrillo[600],
        fondo: claroSobreOscuro ? noche[800] : ladrillo[50],
      };
    default:
      return {
        icono: 'information' as const,
        color: claroSobreOscuro ? ambar[300] : ambar[700],
        fondo: claroSobreOscuro ? noche[800] : ambar[50],
      };
  }
}

const estilos = StyleSheet.create({
  aviso: { borderRadius: radio.lg, marginHorizontal: espacio.md, marginBottom: espacio.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  icono: {
    width: 28,
    height: 28,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  texto: { flex: 1 },
});
