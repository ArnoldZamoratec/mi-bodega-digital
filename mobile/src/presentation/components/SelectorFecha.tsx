import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform } from 'react-native';
import { Button, Dialog, Portal } from 'react-native-paper';

interface Props {
  etiqueta: string;
  valor: Date;
  maximo?: Date;
  onCambiar: (d: Date) => void;
}

const formato = (d: Date) =>
  d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** Selector de fecha nativo: diálogo del sistema en Android, calendario en línea en iOS. */
export function SelectorFecha({ etiqueta, valor, maximo, onCambiar }: Props) {
  const [abiertoIos, setAbiertoIos] = useState(false);
  const [temporal, setTemporal] = useState(valor);

  const abrir = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: valor,
        mode: 'date',
        ...(maximo ? { maximumDate: maximo } : {}),
        onChange: (evento, fecha) => {
          if (evento.type === 'set' && fecha) onCambiar(fecha);
        },
      });
    } else {
      setTemporal(valor);
      setAbiertoIos(true);
    }
  };

  return (
    <>
      <Button
        mode="outlined"
        icon="calendar"
        onPress={abrir}
        accessibilityLabel={`${etiqueta}: ${formato(valor)}`}
      >
        {formato(valor)}
      </Button>
      {Platform.OS === 'ios' ? (
        <Portal>
          <Dialog visible={abiertoIos} onDismiss={() => setAbiertoIos(false)}>
            <Dialog.Title>{etiqueta}</Dialog.Title>
            <Dialog.Content>
              <DateTimePicker
                value={temporal}
                mode="date"
                display="inline"
                locale="es-PE"
                {...(maximo ? { maximumDate: maximo } : {})}
                onChange={(_, f) => f && setTemporal(f)}
              />
            </Dialog.Content>
            <Dialog.Actions>
              <Button onPress={() => setAbiertoIos(false)}>Cancelar</Button>
              <Button
                onPress={() => {
                  onCambiar(temporal);
                  setAbiertoIos(false);
                }}
              >
                Aceptar
              </Button>
            </Dialog.Actions>
          </Dialog>
        </Portal>
      ) : null}
    </>
  );
}
