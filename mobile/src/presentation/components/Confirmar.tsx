import { StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, Text } from 'react-native-paper';
import { create } from 'zustand';

import { useTema } from '../hooks/useDerivados';
import { espacio, radio, TACTIL_MIN } from '../theme/tokens';
import { IconoSuave } from './IconoSuave';

interface Solicitud {
  titulo: string;
  mensaje: string;
  confirmar: string;
  destructivo: boolean;
  resolver: (ok: boolean) => void;
}

const useConfirmacion = create<{ solicitud: Solicitud | null }>(() => ({ solicitud: null }));

/**
 * Reemplaza `confirm()` de la web con un diálogo Material.
 * Uso: `if (await confirmar({ titulo, mensaje })) { ... }`
 */
export function confirmar(opciones: {
  titulo: string;
  mensaje: string;
  confirmar?: string;
  destructivo?: boolean;
}): Promise<boolean> {
  return new Promise((resolver) =>
    useConfirmacion.setState({
      solicitud: {
        titulo: opciones.titulo,
        mensaje: opciones.mensaje,
        confirmar: opciones.confirmar ?? 'Aceptar',
        destructivo: opciones.destructivo ?? false,
        resolver,
      },
    }),
  );
}

export function DialogoConfirmacion() {
  const tema = useTema();
  const solicitud = useConfirmacion((s) => s.solicitud);
  const destructivo = solicitud?.destructivo ?? false;

  const responder = (ok: boolean) => {
    solicitud?.resolver(ok);
    useConfirmacion.setState({ solicitud: null });
  };

  return (
    <Portal>
      <Dialog
        visible={solicitud !== null}
        onDismiss={() => responder(false)}
        style={[estilos.dialogo, { backgroundColor: tema.colors.surface }]}
        testID="dialogo-confirmar"
      >
        <View style={estilos.icono}>
          <IconoSuave
            nombre={destructivo ? 'alert-octagon-outline' : 'help-circle-outline'}
            tamano={48}
            color={destructivo ? tema.extra.deuda : tema.colors.primary}
            fondo={destructivo ? tema.extra.fondoDeuda : tema.colors.secondaryContainer}
          />
        </View>
        <Dialog.Title style={estilos.centrado}>{solicitud?.titulo}</Dialog.Title>
        <Dialog.Content>
          <Text
            variant="bodyMedium"
            style={[estilos.centrado, { color: tema.colors.onSurfaceVariant }]}
          >
            {solicitud?.mensaje}
          </Text>
        </Dialog.Content>
        <Dialog.Actions style={estilos.acciones}>
          <Button
            mode="outlined"
            onPress={() => responder(false)}
            style={estilos.flex}
            contentStyle={estilos.boton}
          >
            Cancelar
          </Button>
          <Button
            onPress={() => responder(true)}
            mode="contained"
            buttonColor={destructivo ? tema.extra.deuda : undefined}
            textColor={destructivo ? tema.colors.onError : undefined}
            style={estilos.flex}
            contentStyle={estilos.boton}
            testID="dialogo-confirmar-ok"
          >
            {solicitud?.confirmar}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  dialogo: { borderRadius: radio.xl },
  icono: { alignItems: 'center', marginTop: espacio.lg },
  centrado: { textAlign: 'center' },
  acciones: { gap: espacio.xs, paddingHorizontal: espacio.lg, paddingBottom: espacio.lg },
  boton: { height: TACTIL_MIN },
});
