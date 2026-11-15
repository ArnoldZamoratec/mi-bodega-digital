import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { FAB, Text } from 'react-native-paper';

import type { Producto } from '@/domain/entities';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';
import {
  esStockBajo,
  filtrarProductos,
  sinStock,
  UMBRAL_STOCK_BAJO,
} from '@/domain/rules/productos';

import { EntradaLista } from '../../components/Aparecer';
import { BannerConexion } from '../../components/BannerConexion';
import { Buscador } from '../../components/Buscador';
import {
  ChipHero,
  DatoHero,
  EncabezadoHero,
  FilaDatosHero,
  FiltrosHero,
} from '../../components/EncabezadoHero';
import { EstadoVista } from '../../components/EstadoVista';
import { Presionable } from '../../components/Presionable';
import { iniciales } from '../../formato';
import { useProductosVisibles, useTema } from '../../hooks/useDerivados';
import type { PantallaTab } from '../../navigation/tipos';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { useRed } from '../../stores/redStore';
import { colorAvatar } from '../../theme/tema';
import { BRILLO_INTERIOR, espacio, radio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

/**
 * Wireframe Inventario:
 *  [🔍 buscar] [chips: Todos · Stock bajo (n)]
 *  [fila: avatar · nombre · S/ precio · estado de stock · ›]  ← toque = editar (y eliminar)
 *  [FAB +]
 * Estados: cargando · vacío · sin resultados · error · normal.
 */
export function InventarioScreen({ navigation }: PantallaTab<'Inventario'>) {
  const tema = useTema();
  const enLinea = useRed((s) => s.enLinea);
  const productos = useProductosVisibles();
  const { cargando, error } = useDatos((s) => s.productos);
  const [busqueda, setBusqueda] = useState('');
  const [soloBajo, setSoloBajo] = useState(false);

  const bajos = useMemo(() => productos.filter((p) => esStockBajo(p)).length, [productos]);
  /** Valor de venta de lo que hay en estante (solo productos con stock controlado y > 0). */
  const valorStock = useMemo(
    () => sumarSoles(productos.map((p) => (p.stock && p.stock > 0 ? p.precio * p.stock : 0))),
    [productos],
  );
  const visibles = useMemo(() => {
    const filtrados = filtrarProductos(productos, busqueda);
    return soloBajo ? filtrados.filter((p) => esStockBajo(p)) : filtrados;
  }, [productos, busqueda, soloBajo]);

  const editar = useCallback(
    (p: Producto) => navigation.navigate('ProductoForm', { productoId: p.id }),
    [navigation],
  );

  let contenido;
  if (cargando) contenido = <EstadoVista tipo="cargando" esqueleto />;
  else if (error && productos.length === 0)
    contenido = (
      <EstadoVista
        tipo="error"
        titulo="Error al cargar productos"
        mensaje={error}
        accion={{ etiqueta: 'Reintentar', onPress: () => useDatos.getState().reintentar() }}
      />
    );
  else if (productos.length === 0)
    contenido = (
      <EstadoVista
        tipo="vacio"
        icono="package-variant-plus"
        titulo="No hay productos registrados"
        mensaje="Agrega lo que vendes con su precio y stock. Puedes escanear el código de barras."
        accion={{
          etiqueta: 'Agregar mi primer producto',
          onPress: () => navigation.navigate('ProductoForm'),
        }}
      />
    );
  else
    contenido = (
      <FlatList
        data={visibles}
        keyExtractor={(p) => p.id}
        renderItem={({ item, index }) => (
          <EntradaLista indice={index}>
            <TarjetaProducto producto={item} onEditar={editar} />
          </EntradaLista>
        )}
        contentContainerStyle={estilos.lista}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListEmptyComponent={<EstadoVista tipo="vacio" icono="magnify" titulo="Sin resultados" />}
        testID="lista-inventario"
      />
    );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <EncabezadoHero antetitulo="Tu catálogo" titulo="Inventario">
        <FilaDatosHero>
          <DatoHero etiqueta="Productos" valor={String(productos.length)} />
          <DatoHero etiqueta="Stock bajo" valor={String(bajos)} />
          <DatoHero etiqueta="Valor en stock" valor={formatearSoles(valorStock)} />
        </FilaDatosHero>
        <Buscador
          placeholder="Buscar producto o código"
          value={busqueda}
          onChangeText={setBusqueda}
          testID="buscar-inventario"
          accessibilityLabel="Buscar producto"
        />
        <FiltrosHero>
          <ChipHero
            etiqueta="Todos"
            activo={!soloBajo}
            onPress={() => setSoloBajo(false)}
            icono="view-grid-outline"
          />
          <ChipHero
            etiqueta={`Stock bajo · ${bajos}`}
            activo={soloBajo}
            onPress={() => setSoloBajo(!soloBajo)}
            icono="alert-outline"
            testID="chip-stock-bajo"
            accessibilityLabel={`Mostrar solo stock bajo, ${bajos} productos`}
          />
        </FiltrosHero>
      </EncabezadoHero>
      <BannerConexion onPress={() => navigation.navigate('VentasPendientes')} />
      {contenido}
      <FAB
        icon="plus"
        label="Producto"
        color={tema.colors.onPrimary}
        style={[
          estilos.fab,
          {
            backgroundColor: tema.colors.primary,
            boxShadow: `${BRILLO_INTERIOR}, ${tema.extra.sombra[3]}`,
          },
        ]}
        // Antes se deshabilitaba sin explicar por qué. Ahora se explica al tocarlo.
        onPress={() =>
          enLinea
            ? navigation.navigate('ProductoForm')
            : avisar(
                'Para agregar productos necesitas internet. Puedes seguir vendiendo sin conexión.',
                'info',
              )
        }
        accessibilityLabel="Nuevo producto"
        testID="fab-nuevo-producto"
      />
    </View>
  );
}

interface TarjetaProps {
  producto: Producto;
  onEditar: (p: Producto) => void;
}

/**
 * Toda la fila abre el producto (objetivo táctil grande). Eliminar vive dentro de la
 * ficha del producto: así no queda una papelera a un dedo del lápiz en cada fila.
 */
const TarjetaProducto = memo(function TarjetaProducto({ producto, onEditar }: TarjetaProps) {
  const tema = useTema();
  const bajo = esStockBajo(producto);
  const agotado = sinStock(producto);
  const stock = producto.stock === null ? 'Sin control' : `${producto.stock} Uds.`;
  const estado = agotado
    ? { texto: 'Agotado', color: tema.extra.deuda, fondo: tema.extra.fondoDeuda }
    : bajo
      ? {
          texto: `Bajo · ≤ ${UMBRAL_STOCK_BAJO}`,
          color: tema.extra.advertencia,
          fondo: tema.extra.fondoAdvertencia,
        }
      : null;

  const avatar = colorAvatar(producto.nombre, tema.dark);

  return (
    <Presionable
      onPress={() => onEditar(producto)}
      accessibilityRole="button"
      accessibilityLabel={`${producto.nombre}, ${formatearSoles(producto.precio)}, ${estado ? `${estado.texto}, ` : ''}${stock}. Toca para editar`}
      testID={`inventario-${producto.nombre}`}
      style={[
        estilos.tarjeta,
        {
          backgroundColor: tema.colors.surface,
          borderColor: estado ? estado.color : tema.extra.borde,
          boxShadow: tema.extra.sombra[1],
        },
      ]}
    >
      <View style={[estilos.avatar, { backgroundColor: avatar.fondo }]}>
        <Text variant="titleMedium" style={{ color: avatar.texto }}>
          {iniciales(producto.nombre)}
        </Text>
      </View>
      <View style={estilos.flex}>
        <Text variant="titleMedium" numberOfLines={1}>
          {producto.nombre}
        </Text>
        <View style={estilos.meta}>
          <Text variant="titleSmall" style={{ color: tema.colors.onSurface }}>
            {formatearSoles(producto.precio)}
          </Text>
          <View
            style={[
              estilos.pildora,
              { backgroundColor: estado ? estado.fondo : tema.colors.secondaryContainer },
            ]}
          >
            <Text
              variant="labelSmall"
              style={{ color: estado ? estado.color : tema.colors.onSecondaryContainer }}
            >
              {estado ? `${estado.texto} · ${stock}` : stock}
            </Text>
          </View>
        </View>
        {producto.codigoBarras ? (
          <View style={estilos.meta}>
            <MaterialCommunityIcons name="barcode" size={14} color={tema.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {producto.codigoBarras}
            </Text>
          </View>
        ) : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={22} color={tema.colors.outline} />
    </Presionable>
  );
});

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  lista: {
    padding: espacio.md,
    gap: espacio.xs,
    paddingBottom: 96,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  tarjeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingVertical: espacio.sm,
    paddingLeft: espacio.sm,
    paddingRight: espacio.xs,
    minHeight: 72,
    borderRadius: radio.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // flexWrap: en 320dp "Bajo · ≤ 5 · 12 Uds." pasa a la línea siguiente en vez de salirse.
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espacio.xs,
    marginTop: 2,
  },
  pildora: { paddingHorizontal: espacio.xs, paddingVertical: 2, borderRadius: radio.completo },
  fab: { position: 'absolute', right: espacio.md, bottom: espacio.md, borderRadius: radio.lg },
});
