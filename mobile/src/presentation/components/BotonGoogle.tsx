import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import Svg, { Path } from 'react-native-svg';

import { useTema } from '../hooks/useDerivados';
import { espacio, radio } from '../theme/tokens';
import { Presionable } from './Presionable';

interface Props {
  onPress: () => void;
  cargando?: boolean;
  deshabilitado?: boolean;
}

/**
 * Botón "Continuar con Google" según las pautas de marca de Google: logo "G" oficial a
 * color sobre fondo neutro y texto "Continuar con Google". Única excepción a la paleta de
 * la marca (los colores del logo son de Google y no se pueden cambiar).
 */
export function BotonGoogle({ onPress, cargando = false, deshabilitado = false }: Props) {
  const tema = useTema();
  return (
    <Presionable
      onPress={onPress}
      disabled={deshabilitado || cargando}
      accessibilityRole="button"
      accessibilityLabel="Continuar con Google"
      accessibilityState={{ busy: cargando, disabled: deshabilitado || cargando }}
      testID="boton-google"
      style={[
        estilos.boton,
        {
          backgroundColor: tema.dark ? tema.colors.surfaceVariant : tema.colors.surface,
          borderColor: tema.colors.outline,
        },
      ]}
    >
      <View style={estilos.logo}>
        {cargando ? <ActivityIndicator size="small" color={tema.colors.primary} /> : <LogoG />}
      </View>
      <Text variant="labelLarge" style={{ color: tema.colors.onSurface }}>
        {cargando ? 'Conectando con Google…' : 'Continuar con Google'}
      </Text>
    </Presionable>
  );
}

/** Logo "G" oficial de Google (4 colores de su marca). */
function LogoG() {
  return (
    <Svg width={20} height={20} viewBox="0 0 48 48">
      <Path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <Path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <Path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <Path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </Svg>
  );
}

const estilos = StyleSheet.create({
  boton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espacio.sm,
    minHeight: 48,
    paddingHorizontal: espacio.md,
    borderRadius: radio.lg,
    borderWidth: 1,
  },
  logo: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
});
