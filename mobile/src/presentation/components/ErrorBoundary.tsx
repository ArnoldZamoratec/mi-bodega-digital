import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

interface Props {
  children: ReactNode;
}

interface Estado {
  error: Error | null;
}

/** Manejo global de errores de render: evita la pantalla en blanco y permite reintentar. */
export class ErrorBoundary extends Component<Props, Estado> {
  override state: Estado = { error: null };

  static getDerivedStateFromError(error: Error): Estado {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Error no controlado en la interfaz:', error, info.componentStack);
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={estilos.contenedor} accessibilityRole="alert">
        <Text variant="headlineSmall" style={estilos.titulo}>
          Algo salió mal
        </Text>
        <Text variant="bodyMedium" style={estilos.texto}>
          La aplicación encontró un error inesperado. Tus ventas guardadas no se pierden.
        </Text>
        {__DEV__ ? (
          <ScrollView style={estilos.detalle}>
            <Text selectable variant="bodySmall">
              {this.state.error.message}
            </Text>
          </ScrollView>
        ) : null}
        <Button mode="contained" onPress={() => this.setState({ error: null })}>
          Reintentar
        </Button>
      </View>
    );
  }
}

const estilos = StyleSheet.create({
  contenedor: { flex: 1, justifyContent: 'center', padding: 24, gap: 16 },
  titulo: { textAlign: 'center' },
  texto: { textAlign: 'center' },
  detalle: { maxHeight: 160 },
});
