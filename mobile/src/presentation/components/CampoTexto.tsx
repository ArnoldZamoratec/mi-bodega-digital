import type { ComponentProps } from 'react';
import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { HelperText, TextInput } from 'react-native-paper';

import { useTema } from '../hooks/useDerivados';
import { radio } from '../theme/tokens';

type Props<T extends FieldValues> = {
  control: Control<T>;
  nombre: Path<T>;
  etiqueta: string;
  /** Texto de ayuda bajo el campo; el error lo reemplaza cuando existe. */
  ayuda?: string;
  /** Icono a la izquierda (MaterialCommunityIcons). */
  icono?: string;
} & Omit<ComponentProps<typeof TextInput>, 'value' | 'onChangeText' | 'label' | 'error'>;

/** TextInput de Paper conectado a React Hook Form, con mensaje de error accesible. */
export function CampoTexto<T extends FieldValues>({
  control,
  nombre,
  etiqueta,
  ayuda,
  icono,
  ...resto
}: Props<T>) {
  const tema = useTema();
  return (
    <Controller
      control={control}
      name={nombre}
      render={({ field: { value, onChange, onBlur, ref }, fieldState: { error } }) => (
        <View>
          <TextInput
            // Permite `setFocus('campo')` de React Hook Form: "Siguiente" en el teclado.
            ref={ref}
            mode="outlined"
            label={etiqueta}
            value={typeof value === 'string' ? value : ''}
            onChangeText={onChange}
            onBlur={onBlur}
            error={!!error}
            accessibilityLabel={etiqueta}
            testID={`campo-${nombre}`}
            outlineColor={tema.colors.outlineVariant}
            activeOutlineColor={tema.colors.primary}
            outlineStyle={estilos.contorno}
            style={{ backgroundColor: tema.colors.surface }}
            left={
              icono ? (
                <TextInput.Icon icon={icono} color={tema.colors.onSurfaceVariant} />
              ) : undefined
            }
            {...resto}
          />
          <HelperText
            type={error ? 'error' : 'info'}
            visible={!!error || !!ayuda}
            accessibilityLiveRegion="polite"
            style={!error ? { color: tema.colors.onSurfaceVariant } : undefined}
          >
            {error?.message ?? ayuda ?? ''}
          </HelperText>
        </View>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  contorno: { borderRadius: radio.md },
});
