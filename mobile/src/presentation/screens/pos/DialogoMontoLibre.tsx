import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { MONTO_LIBRE_MAXIMO } from '@/domain/rules/carrito';
import { aCentimos, formatearSoles, parsearSoles } from '@/domain/rules/dinero';

import { Presionable } from '../../components/Presionable';
import { useAlturaTeclado } from '../../hooks/useAlturaTeclado';
import { useTema } from '../../hooks/useDerivados';
import { useEstiloDialogo } from '../../hooks/useDisposicion';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';

/** Montos típicos de bodega: pan, caramelos, una gaseosa chica. */
const RAPIDOS = [0.5, 1, 2, 5, 10];

interface Props {
  visible: boolean;
  onCerrar: () => void;
  onAgregar: (monto: number, descripcion: string) => void;
}

/**
 * Monto libre (D-25): vender algo que no está en el inventario sin tener que crearlo.
 *  [Monto S/ ____ ]  [0.50] [1] [2] [5] [10]
 *  [Descripción (opcional)]
 *  [Cancelar] [Agregar S/ x]
 */
export function DialogoMontoLibre({ visible, onCerrar, onAgregar }: Props) {
  const tema = useTema();
  const estiloDialogo = useEstiloDialogo();
  const teclado = useAlturaTeclado();
  const [texto, setTexto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const monto = parsearSoles(texto);
  const valido = Number.isFinite(monto) && monto > 0 && monto <= MONTO_LIBRE_MAXIMO;
  const error =
    texto.trim() === ''
      ? null
      : !Number.isFinite(monto) || monto <= 0
        ? 'Escribe un monto válido, por ejemplo 2.50'
        : monto > MONTO_LIBRE_MAXIMO
          ? `El máximo por item es ${formatearSoles(MONTO_LIBRE_MAXIMO)}`
          : null;

  const cerrar = () => {
    setTexto('');
    setDescripcion('');
    onCerrar();
  };

  const agregar = () => {
    if (!valido) return;
    onAgregar(monto, descripcion);
    cerrar();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={cerrar}
        style={[
          estilos.dialogo,
          estiloDialogo,
          // Con edge-to-edge el teclado tapaba la descripción y los botones: el margen
          // inferior hace que el diálogo se centre en el espacio que queda libre.
          { backgroundColor: tema.colors.surface, marginBottom: teclado },
        ]}
        testID="dialogo-monto-libre"
      >
        <Dialog.Title>Monto libre</Dialog.Title>
        <Dialog.Content style={estilos.cuerpo}>
          <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            Para lo que no está en tu inventario.
          </Text>
          <TextInput
            mode="outlined"
            label="Monto (S/)"
            value={texto}
            onChangeText={setTexto}
            keyboardType="decimal-pad"
            autoFocus
            left={<TextInput.Affix text="S/" />}
            style={[estilos.monto, NUMEROS]}
            error={!!error}
            returnKeyType="done"
            onSubmitEditing={agregar}
            testID="campo-monto-libre"
          />
          {error ? (
            <HelperText type="error" visible testID="error-monto-libre">
              {error}
            </HelperText>
          ) : null}
          <View style={estilos.rapidos}>
            {RAPIDOS.map((v) => {
              const activo = valido && aCentimos(monto) === aCentimos(v);
              return (
                <Presionable
                  key={v}
                  onPress={() => setTexto(v.toFixed(2))}
                  accessibilityRole="button"
                  accessibilityLabel={`Monto ${formatearSoles(v)}`}
                  accessibilityState={{ selected: activo }}
                  testID={`monto-rapido-${v}`}
                  style={[
                    estilos.rapido,
                    {
                      backgroundColor: activo
                        ? tema.colors.primary
                        : tema.colors.secondaryContainer,
                    },
                  ]}
                >
                  <Text
                    variant="labelLarge"
                    style={[
                      NUMEROS,
                      {
                        color: activo ? tema.colors.onPrimary : tema.colors.onSecondaryContainer,
                      },
                    ]}
                  >
                    {v < 1 ? v.toFixed(2) : v}
                  </Text>
                </Presionable>
              );
            })}
          </View>
          <TextInput
            mode="outlined"
            label="Descripción (opcional)"
            placeholder="Ej. pan suelto"
            value={descripcion}
            onChangeText={setDescripcion}
            maxLength={40}
            returnKeyType="done"
            onSubmitEditing={agregar}
            testID="campo-desc-libre"
          />
        </Dialog.Content>
        <Dialog.Actions style={estilos.acciones}>
          <Button onPress={cerrar} style={estilos.boton}>
            Cancelar
          </Button>
          <Button
            mode="contained"
            onPress={agregar}
            disabled={!valido}
            style={estilos.boton}
            testID="agregar-monto-libre"
          >
            {valido ? `Agregar ${formatearSoles(monto)}` : 'Agregar'}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const estilos = StyleSheet.create({
  dialogo: { borderRadius: radio.xl },
  cuerpo: { gap: espacio.sm },
  monto: { fontSize: 24 },
  rapidos: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs },
  rapido: {
    minWidth: TACTIL_MIN,
    minHeight: TACTIL_MIN,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acciones: { flexWrap: 'wrap', rowGap: espacio.xs },
  boton: { minHeight: TACTIL_MIN, justifyContent: 'center' },
});
