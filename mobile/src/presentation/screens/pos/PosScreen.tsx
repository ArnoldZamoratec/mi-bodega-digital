import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Producto } from '@/domain/entities';
import { totalCarrito, unidadesEnCarrito } from '@/domain/rules/carrito';
import { formatearSoles } from '@/domain/rules/dinero';
import { esStockBajo, filtrarProductos, sinStock } from '@/domain/rules/productos';

import { Aparecer, EntradaLista } from '../../components/Aparecer';
import { BannerConexion } from '../../components/BannerConexion';
import { Buscador } from '../../components/Buscador';
import {
  DatoHero,
  EncabezadoHero,
  FilaDatosHero,
  sobreHero,
} from '../../components/EncabezadoHero';
import { EstadoVista } from '../../components/EstadoVista';
import { Presionable } from '../../components/Presionable';
import { SimboloBodegon } from '../../components/SimboloBodegon';
import { fechaLarga, iniciales, saludo } from '../../formato';
import { useProductosVisibles, useTema } from '../../hooks/useDerivados';
import {
  ANCHO_PANEL_TICKET,
  ANCHO_RIEL,
  columnasPorAncho,
  MULTIPLICADOR_MONTO,
  useDisposicion,
} from '../../hooks/useDisposicion';
import { useVentasHoy } from '../../hooks/useVentasHoy';
import type { PantallaTab } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useCarrito } from '../../stores/carritoStore';
import { useCromoInferior } from '../../stores/cromoInferiorStore';
import { useDatos } from '../../stores/datosStore';
import { colorAvatar } from '../../theme/tema';
import { BRILLO_INTERIOR, espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { ANCHO_CONTENIDO, useVentana } from '../../theme/ventana';
import { DialogoMontoLibre } from './DialogoMontoLibre';
import { PanelTicket } from './PanelTicket';

/**
 * Wireframe POS:
 *  [encabezado: fecha · nombre de la bodega · métricas · 🔍 buscar [S/+] [📷]]
 *  [banner offline/pendientes]
 *  [cuadrícula de productos (2 col.): avatar · nombre · stock · S/ precio · (+ / n)]  ← toque = +1
 *  [barra flotante: n · S/ total · Cobrar →]                      (compacta: teléfono)
 *  [catálogo (3–6 col.) | ticket persistente: ítems · total · Cobrar]  (media/expandida, D-30)
 * Estados: cargando · vacío (sin productos / sin resultados) · error · normal.
 */
export function PosScreen({ navigation }: PantallaTab<'Vender'>) {
  const tema = useTema();
  const [busqueda, setBusqueda] = useState('');
  const productos = useProductosVisibles();
  const { cargando, error } = useDatos((s) => s.productos);
  const nombreBodega = useDatos((s) => s.config.nombre);
  const hoy = useVentasHoy();
  const items = useCarrito((s) => s.items);
  const agregar = useCarrito((s) => s.agregar);
  const agregarLibre = useCarrito((s) => s.agregarLibre);
  const [montoLibre, setMontoLibre] = useState(false);

  const filtrados = useMemo(() => filtrarProductos(productos, busqueda), [productos, busqueda]);
  const enCarrito = useMemo(() => new Map(items.map((i) => [i.id, i.cantidad])), [items]);
  const disponibles = useMemo(() => productos.filter((p) => !sinStock(p)).length, [productos]);

  const alTocar = useCallback(
    (p: Producto) => {
      if (agregar(p)) {
        haptica.toque();
        return;
      }
      haptica.advertencia();
      avisar(
        sinStock(p)
          ? `${p.nombre} está agotado. Repón stock en Inventario.`
          : `Solo hay ${p.stock} de ${p.nombre} y ya están en el carrito.`,
        'error',
      );
    },
    [agregar],
  );

  // D-30: desde la disposición media el ticket queda fijo a la derecha; el catálogo usa el
  // resto. Las columnas salen del ancho REAL del catálogo (medido con onLayout; antes de
  // medir se estima restando riel y ticket) y de la escala de letra. Ancho fijo por
  // tarjeta: con un número impar de productos la última no se estira.
  const ventana = useVentana();
  const disposicion = useDisposicion();
  const insets = useSafeAreaInsets();
  const conTicket = disposicion.conPanelLateral;
  const anchoTicket =
    disposicion.disposicion === 'expandida'
      ? ANCHO_PANEL_TICKET.expandida
      : ANCHO_PANEL_TICKET.media;
  const [anchoMedido, setAnchoMedido] = useState<number | null>(null);
  const anchoCatalogo =
    anchoMedido ??
    ventana.ancho -
      (disposicion.dosPaneles ? ANCHO_RIEL : insets.left) -
      (conTicket ? anchoTicket : insets.right);
  const anchoUtil = Math.min(anchoCatalogo, ANCHO_CONTENIDO.cuadricula) - espacio.md * 2;
  const columnas = columnasPorAncho(anchoUtil, disposicion.escalaFuente, espacio.sm);
  const anchoTarjeta = Math.floor((anchoUtil - espacio.sm * (columnas - 1)) / columnas);
  // Teléfono angosto o letra grande: el botón de la barra muestra solo la flecha.
  const cobrarCompacto = ventana.angosta || ventana.fuenteGrande;
  const fijarFlotante = useCromoInferior((s) => s.fijarFlotante);
  const [altoBarra, setAltoBarra] = useState(0);

  const renderItem = useCallback(
    ({ item, index }: { item: Producto; index: number }) => (
      <EntradaLista indice={index}>
        <TarjetaProducto
          producto={item}
          cantidad={enCarrito.get(item.id) ?? 0}
          onPress={alTocar}
          ancho={anchoTarjeta}
        />
      </EntradaLista>
    ),
    [enCarrito, alTocar, anchoTarjeta],
  );

  const unidades = unidadesEnCarrito(items);
  const total = totalCarrito(items);
  // Con el ticket a la vista la barra flotante sobra.
  const hayBarra = unidades > 0 && !conTicket;

  // Los avisos flotan encima de la barra de Cobrar solo mientras esta pantalla la muestra.
  useFocusEffect(
    useCallback(() => {
      fijarFlotante(hayBarra ? altoBarra : 0);
      return () => fijarFlotante(0);
    }, [fijarFlotante, hayBarra, altoBarra]),
  );

  let contenido;
  if (cargando) contenido = <EstadoVista tipo="cargando" esqueleto />;
  else if (error && productos.length === 0)
    contenido = (
      <EstadoVista
        tipo="error"
        titulo="No se pudieron cargar los productos"
        mensaje={error}
        accion={{ etiqueta: 'Reintentar', onPress: () => useDatos.getState().reintentar() }}
      />
    );
  else if (productos.length === 0)
    contenido = (
      <EstadoVista
        tipo="vacio"
        icono="package-variant"
        titulo="Aún no tienes productos"
        mensaje="Agrégalos en Inventario para empezar a vender."
        accion={{ etiqueta: 'Ir a Inventario', onPress: () => navigation.navigate('Inventario') }}
      />
    );
  else
    contenido = (
      <FlatList
        // FlatList no admite cambiar numColumns en caliente: la key fuerza un montaje nuevo
        // al rotar o redimensionar.
        key={`cuadricula-${columnas}`}
        data={filtrados}
        keyExtractor={(p) => p.id}
        renderItem={renderItem}
        numColumns={columnas}
        columnWrapperStyle={columnas > 1 ? estilos.columnas : undefined}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          estilos.lista,
          {
            // El catálogo ya está dentro del área segura cuando lo mide onLayout.
            paddingLeft: espacio.md,
            paddingRight: espacio.md,
            // El último producto nunca queda debajo de la barra de Cobrar (alto medido).
            paddingBottom: hayBarra ? altoBarra + espacio.lg : espacio.xl,
          },
        ]}
        initialNumToRender={12}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <Text
            variant="labelLarge"
            style={[estilos.seccion, { color: tema.colors.onSurfaceVariant }]}
          >
            {busqueda
              ? `${filtrados.length} ${filtrados.length === 1 ? 'resultado' : 'resultados'}`
              : 'Toca un producto para agregarlo'}
          </Text>
        }
        ListEmptyComponent={
          <EstadoVista
            tipo="vacio"
            icono="magnify"
            titulo="Sin resultados"
            mensaje={`No hay productos con "${busqueda}"`}
          />
        }
        testID="lista-pos"
      />
    );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <EncabezadoHero
        antetitulo={`${saludo()} · ${fechaLarga()}`}
        titulo={nombreBodega}
        derecha={
          <View style={estilos.marca}>
            <SimboloBodegon tamano={30} variante="blanco" />
          </View>
        }
      >
        <FilaDatosHero>
          <DatoHero etiqueta="Vendido hoy" valor={hoy ? formatearSoles(hoy.total) : '…'} acento />
          <DatoHero
            etiqueta={hoy?.cantidad === 1 ? 'Venta' : 'Ventas'}
            valor={hoy ? String(hoy.cantidad) : '…'}
            onPress={() => navigation.navigate('HistorialVentas')}
            testID="ver-ventas"
          />
          <DatoHero etiqueta="Disponibles" valor={String(disponibles)} />
        </FilaDatosHero>
        <View style={estilos.buscador}>
          <Buscador
            placeholder="Buscar producto o código"
            value={busqueda}
            onChangeText={setBusqueda}
            style={estilos.flex}
            testID="buscar-pos"
            accessibilityLabel="Buscar producto"
          />
          <Presionable
            onPress={() => setMontoLibre(true)}
            accessibilityRole="button"
            accessibilityLabel="Monto libre: vender algo que no está en el inventario"
            testID="boton-monto-libre"
            style={[estilos.escanear, { backgroundColor: tema.colors.surface }]}
          >
            <MaterialCommunityIcons name="cash-plus" size={24} color={tema.colors.primary} />
          </Presionable>
          <Presionable
            onPress={() => navigation.navigate('Escaner', { modo: 'pos' })}
            accessibilityRole="button"
            accessibilityLabel="Escanear código de barras"
            testID="boton-escanear"
            style={[estilos.escanear, { backgroundColor: tema.colors.surface }]}
          >
            <MaterialCommunityIcons name="barcode-scan" size={24} color={tema.colors.primary} />
          </Presionable>
        </View>
      </EncabezadoHero>
      <BannerConexion onPress={() => navigation.navigate('VentasPendientes')} />
      <DialogoMontoLibre
        visible={montoLibre}
        onCerrar={() => setMontoLibre(false)}
        onAgregar={(monto, descripcion) => {
          agregarLibre(monto, descripcion);
          haptica.toque();
        }}
      />
      <View style={estilos.cuerpo}>
        <View
          style={[
            estilos.flex,
            // En compacta el catálogo va de borde a borde respetando muescas laterales.
            conTicket
              ? { paddingLeft: insets.left }
              : {
                  paddingLeft: insets.left,
                  paddingRight: insets.right,
                },
          ]}
          onLayout={(e) =>
            setAnchoMedido(
              e.nativeEvent.layout.width - insets.left - (conTicket ? 0 : insets.right),
            )
          }
          testID="catalogo-pos"
        >
          {contenido}
        </View>
        {conTicket ? (
          <PanelTicket ancho={anchoTicket} onCobrar={() => navigation.navigate('Cobro')} />
        ) : null}
      </View>
      {hayBarra ? (
        <Aparecer
          style={[
            estilos.barraContenedor,
            // Centrada y con tope de 560dp en tablets; en teléfonos, de borde a borde.
            {
              left: Math.max(espacio.md + insets.left, (ventana.ancho - 560) / 2),
              right: Math.max(espacio.md + insets.right, (ventana.ancho - 560) / 2),
            },
          ]}
          desplazamiento={espacio.xl}
        >
          <View onLayout={(e) => setAltoBarra(e.nativeEvent.layout.height + espacio.md)}>
            <Presionable
              onPress={() => navigation.navigate('Cobro')}
              accessibilityRole="button"
              accessibilityLabel={`Cobrar ${unidades} productos por ${formatearSoles(total)}`}
              testID="boton-cobrar"
              style={[
                estilos.barra,
                { backgroundColor: tema.colors.onSurface, boxShadow: tema.extra.sombra[3] },
              ]}
            >
              <View
                style={[
                  estilos.contador,
                  { backgroundColor: tema.colors.primary, boxShadow: BRILLO_INTERIOR },
                ]}
              >
                <MaterialCommunityIcons name="cart" size={18} color={tema.colors.onPrimary} />
                <Text variant="labelLarge" style={{ color: tema.colors.onPrimary }}>
                  {unidades}
                </Text>
              </View>
              <View style={estilos.flex}>
                <Text variant="labelSmall" style={{ color: tema.colors.surface, opacity: 0.7 }}>
                  Total a cobrar
                </Text>
                <Text
                  variant="titleLarge"
                  style={[NUMEROS, { color: tema.colors.surface }]}
                  maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
                  // El total nunca se parte en dos líneas: se ajusta un poco si no entra.
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  testID="total-pos"
                >
                  {formatearSoles(total)}
                </Text>
              </View>
              <View
                style={[
                  estilos.cobrar,
                  cobrarCompacto && estilos.cobrarCompacto,
                  { backgroundColor: tema.colors.primary, boxShadow: BRILLO_INTERIOR },
                ]}
              >
                {cobrarCompacto ? null : (
                  <Text variant="labelLarge" style={{ color: tema.colors.onPrimary }}>
                    Cobrar
                  </Text>
                )}
                <MaterialCommunityIcons
                  name="arrow-right"
                  size={20}
                  color={tema.colors.onPrimary}
                />
              </View>
            </Presionable>
          </View>
        </Aparecer>
      ) : null}
    </View>
  );
}

interface TarjetaProps {
  producto: Producto;
  cantidad: number;
  onPress: (p: Producto) => void;
  ancho: number;
}

/** Memoizada: en gama baja, re-renderizar solo la tarjeta que cambió. */
const TarjetaProducto = memo(function TarjetaProducto({
  producto,
  cantidad,
  onPress,
  ancho,
}: TarjetaProps) {
  const tema = useTema();
  const agotado = sinStock(producto);
  const bajo = !agotado && esStockBajo(producto);
  const avatar = colorAvatar(producto.nombre, tema.dark);
  const seleccionado = cantidad > 0;
  // Lo que aún se puede vender descontando lo que ya está en el carrito.
  const quedan = producto.stock === null ? null : Math.max(0, producto.stock - cantidad);
  const alTope = !agotado && quedan === 0;
  const bloqueado = agotado || alTope;
  const stockTexto =
    quedan === null
      ? 'Sin control'
      : agotado
        ? 'Agotado'
        : alTope
          ? 'Máximo en el carrito'
          : seleccionado
            ? `Quedan ${quedan}`
            : `${quedan} en stock`;

  return (
    <Presionable
      onPress={() => onPress(producto)}
      accessibilityRole="button"
      accessibilityLabel={`${producto.nombre}, ${formatearSoles(producto.precio)}, ${stockTexto}${seleccionado ? `, ${cantidad} en el carrito` : ''}${bloqueado ? '. No se puede agregar más' : '. Toca para agregar'}`}
      accessibilityState={{ disabled: bloqueado }}
      testID={`producto-${producto.nombre}`}
      style={[
        estilos.tarjeta,
        agotado && estilos.agotado,
        {
          width: ancho,
          backgroundColor: agotado ? tema.colors.surfaceVariant : tema.colors.surface,
          borderColor: seleccionado ? tema.colors.primary : tema.extra.borde,
          borderWidth: seleccionado ? 2 : StyleSheet.hairlineWidth * 2,
          boxShadow: seleccionado ? tema.extra.sombra[2] : tema.extra.sombra[1],
        },
      ]}
    >
      <View style={estilos.tarjetaArriba}>
        <View style={[estilos.avatar, { backgroundColor: avatar.fondo }]}>
          <Text variant="titleMedium" style={{ color: avatar.texto }}>
            {iniciales(producto.nombre)}
          </Text>
        </View>
        <View
          style={[
            estilos.accion,
            {
              backgroundColor: agotado
                ? tema.extra.fondoDeuda
                : seleccionado
                  ? tema.colors.primary
                  : tema.colors.secondaryContainer,
            },
          ]}
        >
          {agotado ? (
            <MaterialCommunityIcons name="cancel" size={18} color={tema.extra.deuda} />
          ) : seleccionado ? (
            <Text variant="labelLarge" style={{ color: tema.colors.onPrimary }}>
              {cantidad}
            </Text>
          ) : (
            <MaterialCommunityIcons name="plus" size={20} color={tema.colors.primary} />
          )}
        </View>
      </View>

      <Text variant="titleSmall" numberOfLines={2} style={estilos.nombre}>
        {producto.nombre}
      </Text>

      <View style={estilos.stock}>
        <View
          style={[
            estilos.punto,
            {
              backgroundColor: agotado
                ? tema.extra.deuda
                : bajo || alTope
                  ? tema.extra.advertencia
                  : tema.colors.primary,
            },
          ]}
        />
        <Text
          variant="labelSmall"
          style={{
            color: agotado
              ? tema.extra.deuda
              : bajo || alTope
                ? tema.extra.advertencia
                : tema.colors.onSurfaceVariant,
          }}
        >
          {stockTexto}
        </Text>
      </View>

      <Text
        variant="titleLarge"
        style={[NUMEROS, { color: tema.colors.onSurface }]}
        // A 200 % el precio no entra en la tarjeta: tope 1.6× y una sola línea.
        maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {formatearSoles(producto.precio)}
      </Text>
    </Presionable>
  );
});

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  cuerpo: { flex: 1, flexDirection: 'row' },
  buscador: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  marca: {
    width: 48,
    height: 48,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sobreHero.superficie,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: sobreHero.borde,
  },
  escanear: {
    width: TACTIL_MIN,
    height: TACTIL_MIN,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seccion: { marginBottom: espacio.xxs },
  lista: {
    paddingTop: espacio.md,
    gap: espacio.sm,
    // En tablets la cuadrícula se centra en vez de pegarse a la izquierda.
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.cuadricula,
    alignSelf: 'center',
  },
  columnas: { gap: espacio.sm },
  tarjeta: {
    borderRadius: radio.lg,
    padding: espacio.sm,
    gap: espacio.xxs,
    minHeight: 168,
  },
  tarjetaArriba: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: espacio.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radio.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accion: {
    minWidth: 32,
    height: 32,
    paddingHorizontal: espacio.xs,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agotado: { opacity: 0.7 },
  nombre: { minHeight: 40 },
  stock: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  punto: { width: 6, height: 6, borderRadius: 3 },
  barraContenedor: {
    position: 'absolute',
    bottom: espacio.md,
  },
  barra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    borderRadius: radio.xl,
    padding: espacio.xs,
    paddingLeft: espacio.xs,
    minHeight: 64,
  },
  contador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xxs,
    minHeight: 48,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.lg,
  },
  cobrar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xxs,
    minHeight: TACTIL_MIN,
    paddingHorizontal: espacio.md,
    borderRadius: radio.lg,
  },
  cobrarCompacto: { paddingHorizontal: espacio.sm },
});
