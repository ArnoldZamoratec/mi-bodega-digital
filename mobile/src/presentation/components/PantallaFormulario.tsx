import type { ReactNode } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../hooks/useDerivados';
import { espacio } from '../theme/tokens';
import { Aparecer } from './Aparecer';
import { IconoSuave, type NombreIcono } from './IconoSuave';
import { Tarjeta } from './Tarjeta';

interface Props {
  icono?: NombreIcono;
  /** Color del icono y su fondo (por defecto verde de marca). */
  tono?: { color: string; fondo: string };
  titulo?: string;
  descripcion?: string;
  children: ReactNode;
  /** Acción principal fija abajo (siempre visible sobre el teclado). */
  pie?: ReactNode;
}

/**
 * Layout común de formularios: encabezado con icono, secciones en tarjetas y botón principal
 * fijo al pie. Así todos los formularios se ven y se comportan igual.
 */
export function PantallaFormulario({ icono, tono, titulo, descripcion, children, pie }: Props) {
  const tema = useTema();
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={[estilos.flex, { backgroundColor: tema.colors.background }]}
      // Con edge-to-edge (Android 15+, SDK 58) la ventana ya no se achica sola con el
      // teclado: 'padding' en ambas plataformas mantiene a la vista el campo y el botón.
      behavior="padding"
    >
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {titulo ? (
          <Aparecer style={estilos.cabecera}>
            {icono ? (
              <IconoSuave nombre={icono} tamano={48} color={tono?.color} fondo={tono?.fondo} />
            ) : null}
            <View style={estilos.flex}>
              <Text variant="titleLarge" accessibilityRole="header">
                {titulo}
              </Text>
              {descripcion ? (
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  {descripcion}
                </Text>
              ) : null}
            </View>
          </Aparecer>
        ) : null}
        {children}
      </ScrollView>
      {pie ? (
        <View
          style={[
            estilos.pie,
            {
              paddingBottom: espacio.md + insets.bottom,
              backgroundColor: tema.colors.surface,
              borderTopColor: tema.extra.borde,
              boxShadow: tema.extra.sombraArriba,
            },
          ]}
        >
          {pie}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/** Grupo de campos con título en versalitas sobre una tarjeta. */
export function SeccionFormulario({ titulo, children }: { titulo?: string; children: ReactNode }) {
  const tema = useTema();
  return (
    <View style={estilos.seccion}>
      {titulo ? (
        <Text
          variant="labelMedium"
          style={[estilos.tituloSeccion, { color: tema.colors.onSurfaceVariant }]}
          accessibilityRole="header"
        >
          {titulo.toUpperCase()}
        </Text>
      ) : null}
      <Tarjeta style={estilos.tarjeta}>{children}</Tarjeta>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    flexGrow: 1,
    padding: espacio.md,
    gap: espacio.lg,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.md },
  seccion: { gap: espacio.xs },
  tituloSeccion: { letterSpacing: 0.6, paddingHorizontal: espacio.xxs },
  tarjeta: { padding: espacio.md, paddingBottom: espacio.xxs },
  pie: {
    paddingHorizontal: espacio.md,
    paddingTop: espacio.sm,
    gap: espacio.xs,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
