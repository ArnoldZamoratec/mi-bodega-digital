import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text, TextInput } from 'react-native-paper';

import { formatearSoles, parsearSoles } from '@/domain/rules/dinero';
import { calcularVuelto, faltante, montosSugeridos } from '@/domain/rules/vuelto';

import { useTema } from '../hooks/useDerivados';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../theme/tokens';
import { Presionable } from './Presionable';

interface Props {
  total: number;
  /** Monto entregado por el cliente; null = aún no se indicó (es opcional). */
  recibido: number | null;
  onCambiar: (recibido: number | null) => void;
}

/**
 * Pago en efectivo: botones con los montos más probables (como Loyverse/Square) y el
 * vuelto en grande. Contar el cambio con la fila esperando es donde más se equivoca.
 * Es opcional: si no se indica nada, la venta se registra igual.
 */
export function PanelVuelto({ total, recibido, onCambiar }: Props) {
  const tema = useTema();
  const [otro, setOtro] = useState('');
  const sugeridos = montosSugeridos(total);
  const vuelto = recibido === null ? null : calcularVuelto(total, recibido);
  const falta = recibido === null ? 0 : faltante(total, recibido);

  const elegir = (monto: number) => {
    setOtro('');
    onCambiar(recibido === monto ? null : monto);
  };

  const opcion = (monto: number, etiqueta: string) => {
    const activo = recibido === monto && otro === '';
    return (
      <Presionable
        key={etiqueta}
        onPress={() => elegir(monto)}
        accessibilityRole="button"
        accessibilityState={{ selected: activo }}
        accessibilityLabel={`Paga con ${etiqueta}`}
        testID={`recibido-${etiqueta}`}
        style={[
          estilos.opcion,
          {
            backgroundColor: activo ? tema.colors.primary : tema.colors.surface,
            borderColor: activo ? tema.colors.primary : tema.colors.outlineVariant,
          },
        ]}
      >
        <Text
          variant="labelLarge"
          style={[NUMEROS, { color: activo ? tema.colors.onPrimary : tema.colors.onSurface }]}
        >
          {etiqueta}
        </Text>
      </Presionable>
    );
  };

  return (
    <View style={estilos.contenedor}>
      <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
        ¿Con cuánto paga?
      </Text>
      <View style={estilos.opciones}>
        {opcion(total, 'Exacto')}
        {sugeridos.map((m) => opcion(m, `S/ ${m % 1 === 0 ? m : m.toFixed(2)}`))}
      </View>
      <TextInput
        mode="outlined"
        dense
        label="Otro monto (S/)"
        value={otro}
        keyboardType="decimal-pad"
        onChangeText={(t) => {
          setOtro(t);
          const n = parsearSoles(t);
          onCambiar(Number.isFinite(n) && n > 0 ? n : null);
        }}
        outlineColor={tema.colors.outlineVariant}
        outlineStyle={{ borderRadius: radio.md }}
        style={{ backgroundColor: tema.colors.surface }}
        testID="recibido-otro"
        accessibilityLabel="Otro monto recibido en soles"
      />

      {recibido !== null ? (
        <View
          style={[
            estilos.resultado,
            {
              backgroundColor:
                vuelto !== null ? tema.colors.secondaryContainer : tema.extra.fondoAdvertencia,
            },
          ]}
          accessibilityLiveRegion="polite"
          testID="vuelto"
        >
          <MaterialCommunityIcons
            name={vuelto !== null ? 'hand-coin-outline' : 'alert-outline'}
            size={24}
            color={vuelto !== null ? tema.colors.primary : tema.extra.advertencia}
          />
          <Text variant="titleMedium" style={[estilos.flex, { color: tema.colors.onSurface }]}>
            {vuelto !== null ? 'Vuelto' : 'Falta'}
          </Text>
          <Text
            variant="headlineMedium"
            style={[
              NUMEROS,
              { color: vuelto !== null ? tema.colors.primary : tema.extra.advertencia },
            ]}
          >
            {formatearSoles(vuelto ?? falta)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenedor: { gap: espacio.xs },
  opciones: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs },
  opcion: {
    minHeight: TACTIL_MIN,
    minWidth: 64,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
    borderRadius: radio.lg,
  },
});
