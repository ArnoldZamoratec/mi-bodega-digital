import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { totalCarrito, unidadesEnCarrito, type ItemCarrito } from '@/domain/rules/carrito';
import { formatearSoles } from '@/domain/rules/dinero';

import { useProductosVisibles, useTema } from '../../hooks/useDerivados';
import { MULTIPLICADOR_MONTO } from '../../hooks/useDisposicion';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useCarrito } from '../../stores/carritoStore';
import { familia } from '../../theme/tema';
import { BRILLO_INTERIOR, espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';

/**
 * Ticket persistente del POS en tablets, plegables abiertos y terminales de mostrador
 * (disposición media/expandida, D-30): el carrito queda siempre a la vista junto al
 * catálogo, como en una caja registradora. Método de pago y confirmación siguen en Cobro.
 */
export function PanelTicket({ ancho, onCobrar }: { ancho: number; onCobrar: () => void }) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const productos = useProductosVisibles();
  const items = useCarrito((s) => s.items);
  const agregar = useCarrito((s) => s.agregar);
  const quitar = useCarrito((s) => s.quitar);
  const vaciar = useCarrito((s) => s.vaciar);
  const stockDe = useMemo(() => new Map(productos.map((p) => [p.id, p.stock])), [productos]);

  const unidades = unidadesEnCarrito(items);
  const total = totalCarrito(items);

  const sumarUno = (item: ItemCarrito) => {
    const stock = stockDe.get(item.id) ?? null;
    if (agregar({ ...item, stock })) {
      haptica.toque();
      return;
    }
    haptica.advertencia();
    avisar(`Solo hay ${stock ?? 0} de ${item.nombre} en stock.`, 'error');
  };

  const vaciarConDeshacer = () => {
    const previo = useCarrito.getState();
    const copia = {
      items: previo.items,
      metodoDePago: previo.metodoDePago,
      clienteId: previo.clienteId,
    };
    vaciar();
    avisar('Carrito vaciado', 'info', {
      etiqueta: 'Deshacer',
      alPresionar: () => useCarrito.setState(copia),
    });
  };

  return (
    <View
      style={[
        estilos.panel,
        {
          width: ancho,
          paddingRight: insets.right,
          backgroundColor: tema.colors.surface,
          borderLeftColor: tema.extra.borde,
        },
      ]}
      testID="panel-ticket"
      accessibilityLabel="Ticket de la venta"
    >
      <View style={estilos.cabecera}>
        <Text variant="titleMedium" style={estilos.flex} accessibilityRole="header">
          Ticket
        </Text>
        {items.length > 0 ? (
          <Button
            compact
            icon="delete-sweep-outline"
            textColor={tema.colors.error}
            onPress={vaciarConDeshacer}
            contentStyle={estilos.tactil}
            testID="ticket-vaciar"
          >
            Vaciar
          </Button>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        style={estilos.flex}
        contentContainerStyle={items.length === 0 ? estilos.vacio : estilos.lista}
        ListEmptyComponent={
          <View style={estilos.vacioInterior}>
            <MaterialCommunityIcons
              name="cart-outline"
              size={40}
              color={tema.colors.onSurfaceVariant}
            />
            <Text
              variant="bodyMedium"
              style={[estilos.centrado, { color: tema.colors.onSurfaceVariant }]}
            >
              Toca un producto del catálogo para agregarlo al ticket.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const stock = stockDe.get(item.id) ?? null;
          const alTope = stock !== null && item.cantidad >= stock;
          return (
            <View
              style={[estilos.item, { borderBottomColor: tema.colors.outlineVariant }]}
              testID={`ticket-item-${item.nombre}`}
            >
              <View style={estilos.flex}>
                <Text variant="bodyLarge" numberOfLines={2}>
                  {item.nombre}
                </Text>
                <Text
                  variant="bodySmall"
                  style={[NUMEROS, { color: tema.colors.onSurfaceVariant }]}
                >
                  {item.cantidad} × {formatearSoles(item.precio)}
                </Text>
              </View>
              <View style={[estilos.stepper, { backgroundColor: tema.colors.surfaceVariant }]}>
                <IconButton
                  icon={item.cantidad === 1 ? 'trash-can-outline' : 'minus'}
                  size={18}
                  iconColor={item.cantidad === 1 ? tema.colors.error : tema.colors.onSurface}
                  style={estilos.paso}
                  onPress={() => quitar(item.id)}
                  accessibilityLabel={`Quitar una unidad de ${item.nombre}`}
                  testID={`ticket-menos-${item.nombre}`}
                />
                <Text variant="titleSmall" style={[NUMEROS, estilos.cantidad]}>
                  {item.cantidad}
                </Text>
                <IconButton
                  icon="plus"
                  size={18}
                  iconColor={tema.colors.primary}
                  style={estilos.paso}
                  disabled={alTope}
                  onPress={() => sumarUno(item)}
                  accessibilityLabel={
                    alTope
                      ? `No hay más ${item.nombre} en stock`
                      : `Agregar una unidad de ${item.nombre}`
                  }
                  testID={`ticket-mas-${item.nombre}`}
                />
              </View>
            </View>
          );
        }}
      />

      <View
        style={[
          estilos.pie,
          { paddingBottom: espacio.md + insets.bottom, borderTopColor: tema.extra.borde },
        ]}
      >
        <View style={estilos.totalFila}>
          <Text variant="titleMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            Total
          </Text>
          <Text
            variant="headlineSmall"
            style={[NUMEROS, estilos.total, { color: tema.colors.onSurface }]}
            maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            testID="ticket-total"
          >
            {formatearSoles(total)}
          </Text>
        </View>
        <Button
          mode="contained"
          icon="arrow-right"
          onPress={onCobrar}
          disabled={items.length === 0}
          contentStyle={estilos.botonGrande}
          labelStyle={estilos.botonTexto}
          style={{ boxShadow: items.length ? BRILLO_INTERIOR : undefined }}
          accessibilityLabel={`Cobrar ${unidades} productos por ${formatearSoles(total)}`}
          testID="ticket-cobrar"
        >
          Cobrar
        </Button>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  panel: { borderLeftWidth: StyleSheet.hairlineWidth * 2 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espacio.md,
    paddingTop: espacio.sm,
    minHeight: TACTIL_MIN + espacio.sm,
  },
  tactil: { minHeight: TACTIL_MIN },
  lista: { paddingHorizontal: espacio.md },
  vacio: { flexGrow: 1, justifyContent: 'center', padding: espacio.lg },
  vacioInterior: { alignItems: 'center', gap: espacio.sm },
  centrado: { textAlign: 'center' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radio.completo },
  paso: { margin: 0, width: TACTIL_MIN, height: TACTIL_MIN },
  cantidad: { minWidth: 20, textAlign: 'center' },
  pie: {
    padding: espacio.md,
    gap: espacio.sm,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  totalFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.sm,
  },
  total: { flexShrink: 1, textAlign: 'right' },
  botonGrande: { minHeight: 56, flexDirection: 'row-reverse' },
  botonTexto: { fontSize: 17, fontFamily: familia.negrita },
});
