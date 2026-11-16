import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import type { Producto } from '@/domain/entities';
import { formatearSoles } from '@/domain/rules/dinero';
import { esStockBajo, sinStock, UMBRAL_STOCK_BAJO } from '@/domain/rules/productos';

import { Tarjeta } from '../../components/Tarjeta';
import { iniciales } from '../../formato';
import { useTema } from '../../hooks/useDerivados';
import { MULTIPLICADOR_MONTO } from '../../hooks/useDisposicion';
import { colorAvatar } from '../../theme/tema';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

/**
 * Ficha de solo lectura del producto elegido, en el panel derecho de Inventario cuando la
 * disposición es expandida (D-30). Editar abre el formulario de siempre (hoja apilada).
 */
export function FichaProducto({
  producto,
  onEditar,
}: {
  producto: Producto;
  onEditar: () => void;
}) {
  const tema = useTema();
  const avatar = colorAvatar(producto.nombre, tema.dark);
  const agotado = sinStock(producto);
  const bajo = esStockBajo(producto);
  const tenue = { color: tema.colors.onSurfaceVariant };
  const estado =
    producto.stock === null
      ? 'Sin control de stock'
      : agotado
        ? 'Agotado'
        : bajo
          ? `Stock bajo (≤ ${UMBRAL_STOCK_BAJO})`
          : 'Stock suficiente';
  const colorEstado = agotado
    ? tema.extra.deuda
    : bajo
      ? tema.extra.advertencia
      : tema.colors.primary;
  const valorEnStock =
    producto.stock !== null && producto.stock > 0 ? producto.precio * producto.stock : 0;

  return (
    <ScrollView contentContainerStyle={estilos.contenido} testID="ficha-producto">
      <Tarjeta nivel={2} style={estilos.bloque}>
        <View style={estilos.cabecera}>
          <View style={[estilos.avatar, { backgroundColor: avatar.fondo }]}>
            <Text variant="titleLarge" style={{ color: avatar.texto }}>
              {iniciales(producto.nombre)}
            </Text>
          </View>
          <Text variant="headlineSmall" style={estilos.flex} accessibilityRole="header">
            {producto.nombre}
          </Text>
        </View>
        <Text
          variant="displaySmall"
          style={[NUMEROS, { color: tema.colors.onSurface }]}
          maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
          testID="ficha-precio"
        >
          {formatearSoles(producto.precio)}
        </Text>
        <View style={estilos.fila}>
          <MaterialCommunityIcons name="circle" size={10} color={colorEstado} />
          <Text variant="titleSmall" style={{ color: colorEstado }}>
            {estado}
          </Text>
        </View>
        <Dato etiqueta="Unidades" valor={producto.stock === null ? '—' : String(producto.stock)} />
        <Dato etiqueta="Valor en stock" valor={formatearSoles(valorEnStock)} />
        <Dato etiqueta="Código de barras" valor={producto.codigoBarras || 'Sin código'} />
        <Button
          mode="contained"
          icon="pencil"
          onPress={onEditar}
          contentStyle={estilos.boton}
          testID="ficha-editar"
        >
          Editar producto
        </Button>
        <Text variant="bodySmall" style={tenue}>
          Para eliminarlo, ábrelo con Editar producto.
        </Text>
      </Tarjeta>
    </ScrollView>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  const tema = useTema();
  return (
    <View style={estilos.dato}>
      <Text
        variant="bodyMedium"
        style={[estilos.etiqueta, { color: tema.colors.onSurfaceVariant }]}
      >
        {etiqueta}
      </Text>
      <Text variant="bodyLarge" style={[NUMEROS, estilos.valor]}>
        {valor}
      </Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espacio.lg,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lectura,
    alignSelf: 'center',
  },
  bloque: { padding: espacio.lg, gap: espacio.sm },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  // flexWrap: a 200 % etiqueta y valor pasan a dos líneas en vez de salirse.
  dato: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: espacio.xs,
  },
  etiqueta: { flexShrink: 1 },
  valor: { flexShrink: 1, textAlign: 'right' },
  boton: { minHeight: TACTIL_MIN + 4 },
});
