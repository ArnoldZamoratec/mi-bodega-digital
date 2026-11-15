import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, IconButton, SegmentedButtons, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensajeDeError } from '@/data/firebase/errores';
import { METODOS_PAGO_VENTA, type MetodoPagoVenta } from '@/domain/entities';
import {
  advertenciasDeStock,
  totalCarrito,
  unidadesEnCarrito,
  type ItemCarrito,
} from '@/domain/rules/carrito';
import { formatearSoles } from '@/domain/rules/dinero';
import { calcularVuelto } from '@/domain/rules/vuelto';
import { registrarVenta } from '@/domain/usecases/registrarVenta';

import { EstadoVista } from '../../components/EstadoVista';
import { PanelVuelto } from '../../components/PanelVuelto';
import { SelectorCliente } from '../../components/SelectorCliente';
import { useProductosVisibles, useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { celebrarVenta } from '../../stores/celebracionStore';
import { useCarrito } from '../../stores/carritoStore';
import { estaEnLinea } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';
import { familia } from '../../theme/tema';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { useVentana } from '../../theme/ventana';

const ICONOS: Record<MetodoPagoVenta, string> = {
  Efectivo: 'cash',
  'Yape/Plin': 'cellphone',
  Fiado: 'notebook-outline',
};

/**
 * Wireframe Cobro:
 *  [items: nombre · S/ precio x n · [-] n [+] · subtotal]
 *  [⚠ advertencias de stock]
 *  [método: Efectivo | Yape/Plin | Fiado]
 *  [cliente (solo Fiado)]
 *  [TOTAL S/ ...]  [Confirmar venta]
 * Estados: carrito vacío · enviando (botón bloqueado) · error (mensaje) · éxito (vuelve al POS).
 */
export function CobroScreen({ navigation }: PantallaRaiz<'Cobro'>) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const contenedor = useContenedor();
  const productos = useProductosVisibles();
  const { items, metodoDePago, clienteId, agregar, quitar, fijarMetodo, fijarCliente, vaciar } =
    useCarrito();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Efectivo entregado por el cliente (opcional) para calcular el vuelto. */
  const [recibido, setRecibido] = useState<number | null>(null);
  const ventana = useVentana();
  // En 320dp o con letra grande, "Yape/Plin" no entra con ícono: se muestra solo el texto.
  const metodosConIcono = !ventana.angosta && !ventana.fuenteGrande;

  const advertencias = useMemo(() => advertenciasDeStock(items, productos), [items, productos]);
  const stockDe = useMemo(() => new Map(productos.map((p) => [p.id, p.stock])), [productos]);
  const total = totalCarrito(items);
  const sinStockSuficiente = advertencias.length > 0;

  const sumarUno = (item: ItemCarrito) => {
    const stock = stockDe.get(item.id) ?? null;
    if (agregar({ ...item, stock })) return;
    haptica.advertencia();
    avisar(`Solo hay ${stock ?? 0} de ${item.nombre} en stock.`, 'error');
  };

  const confirmarVenta = async () => {
    // El stock pudo bajar mientras se armaba el carrito (otra venta, otro equipo): R-07.
    if (sinStockSuficiente) {
      haptica.error();
      setError('Hay productos sin stock suficiente. Ajusta las cantidades para continuar.');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const r = await registrarVenta(
        {
          ventas: contenedor.ventas,
          cola: contenedor.cola,
          sincronizador: contenedor.sincronizador,
          enLinea: estaEnLinea,
        },
        { carrito: items, metodoDePago, clienteId },
      );
      haptica.exito();
      // Pico de la experiencia: celebración con monto y avance del día (CelebracionVenta).
      celebrarVenta({
        total: r.operacion.venta.total,
        metodo: r.operacion.venta.metodoDePago,
        sincronizada: r.estado === 'sincronizada',
        unidades: unidadesEnCarrito(items),
        operacion: r.operacion,
        vuelto:
          metodoDePago === 'Efectivo' && recibido !== null
            ? (calcularVuelto(r.operacion.venta.total, recibido) ?? undefined)
            : undefined,
      });
      navigation.goBack();
      vaciar();
    } catch (e) {
      haptica.error();
      setError(mensajeDeError(e, 'Error al registrar la venta'));
    } finally {
      setEnviando(false);
    }
  };

  if (items.length === 0) {
    return (
      <EstadoVista
        tipo="vacio"
        icono="cart-outline"
        titulo="El carrito está vacío"
        accion={{ etiqueta: 'Volver a vender', onPress: () => navigation.goBack() }}
      />
    );
  }

  const renderItem = ({ item, index }: { item: ItemCarrito; index: number }) => {
    const stock = stockDe.get(item.id) ?? null;
    const alTope = stock !== null && item.cantidad >= stock;
    const excede = stock !== null && item.cantidad > stock;
    return (
      <View
        style={[
          estilos.item,
          { backgroundColor: tema.colors.surface, borderColor: tema.extra.borde },
          index === 0 && estilos.itemPrimero,
          index === items.length - 1 && estilos.itemUltimo,
          index > 0 && { borderTopColor: tema.colors.outlineVariant },
        ]}
      >
        <View style={estilos.flex}>
          <Text variant="titleMedium" numberOfLines={1}>
            {item.nombre}
          </Text>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {formatearSoles(item.precio)} c/u · {formatearSoles(item.precio * item.cantidad)}
          </Text>
          {stock !== null ? (
            <Text
              variant="labelSmall"
              style={{
                color: excede
                  ? tema.extra.deuda
                  : alTope
                    ? tema.extra.advertencia
                    : tema.colors.onSurfaceVariant,
              }}
            >
              {excede
                ? `Solo hay ${Math.max(0, stock)} en stock`
                : alTope
                  ? 'Máximo disponible'
                  : `${stock - item.cantidad} más disponibles`}
            </Text>
          ) : null}
        </View>
        <View style={[estilos.stepper, { backgroundColor: tema.colors.surfaceVariant }]}>
          <IconButton
            icon={item.cantidad === 1 ? 'trash-can-outline' : 'minus'}
            size={18}
            iconColor={item.cantidad === 1 ? tema.colors.error : tema.colors.onSurface}
            style={estilos.paso}
            onPress={() => quitar(item.id)}
            accessibilityLabel={`Quitar una unidad de ${item.nombre}`}
            testID={`menos-${item.nombre}`}
          />
          <Text
            variant="titleMedium"
            style={estilos.cantidad}
            accessibilityLabel={`${item.cantidad} unidades`}
          >
            {item.cantidad}
          </Text>
          <IconButton
            icon="plus"
            size={18}
            iconColor={tema.colors.primary}
            style={estilos.paso}
            onPress={() => sumarUno(item)}
            disabled={alTope}
            accessibilityLabel={
              alTope ? `No hay más ${item.nombre} en stock` : `Agregar una unidad de ${item.nombre}`
            }
            testID={`mas-${item.nombre}`}
          />
        </View>
      </View>
    );
  };

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <Text
            variant="labelLarge"
            style={[estilos.encabezado, { color: tema.colors.onSurfaceVariant }]}
          >
            {items.length === 1 ? '1 producto' : `${items.length} productos`}
          </Text>
        }
        ListFooterComponent={
          <Button
            icon="delete-sweep-outline"
            onPress={() => {
              // Sin diálogo de confirmación (frena la fila): se vacía y se ofrece deshacer.
              const previo = { items, metodoDePago, clienteId };
              navigation.goBack();
              vaciar();
              avisar('Carrito vaciado', 'info', {
                etiqueta: 'Deshacer',
                alPresionar: () => useCarrito.setState(previo),
              });
            }}
            textColor={tema.colors.error}
            style={estilos.vaciar}
          >
            Vaciar carrito
          </Button>
        }
      />

      <View
        style={[
          estilos.panel,
          {
            paddingBottom: espacio.md + insets.bottom,
            backgroundColor: tema.colors.surface,
            borderColor: tema.extra.borde,
            boxShadow: tema.extra.sombraArriba,
          },
        ]}
      >
        {/* Lo variable del panel se desplaza: con letra grande, horizontal o Fiado + cliente,
            "Confirmar venta" sigue siempre a la vista. */}
        <ScrollView
          style={{ maxHeight: ventana.alto * (ventana.altoCompacto ? 0.35 : 0.45) }}
          contentContainerStyle={estilos.panelDesplazable}
          keyboardShouldPersistTaps="handled"
        >
          {advertencias.map((a) => (
            <View
              key={a.id}
              style={[estilos.aviso, { backgroundColor: tema.extra.fondoDeuda }]}
              accessibilityRole="alert"
            >
              <MaterialCommunityIcons
                name="alert-octagon-outline"
                size={18}
                color={tema.extra.deuda}
              />
              <Text variant="bodySmall" style={[estilos.flex, { color: tema.extra.deuda }]}>
                {a.nombre}: pides {a.solicitado} y hay {Math.max(0, a.disponible)} en stock. Quita{' '}
                {a.solicitado - Math.max(0, a.disponible)} para poder cobrar.
              </Text>
            </View>
          ))}

          <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
            Método de pago
          </Text>
          <SegmentedButtons
            value={metodoDePago}
            onValueChange={(v) => fijarMetodo(v as MetodoPagoVenta)}
            buttons={METODOS_PAGO_VENTA.map((m) => ({
              value: m,
              label: m,
              icon: metodosConIcono ? ICONOS[m] : undefined,
              testID: `metodo-${m}`,
              style: estilos.segmento,
            }))}
          />

          {metodoDePago === 'Efectivo' ? (
            <PanelVuelto total={total} recibido={recibido} onCambiar={setRecibido} />
          ) : null}

          {metodoDePago === 'Yape/Plin' ? (
            // Pagos falsos con capturas o apps clonadas son una pérdida documentada en
            // bodegas; desde 2025 Yape incluye un código de seguridad de 3 dígitos.
            <View
              style={[estilos.aviso, { backgroundColor: tema.extra.fondoInfo }]}
              accessibilityRole="alert"
              testID="verificar-yape"
            >
              <MaterialCommunityIcons
                name="shield-check-outline"
                size={20}
                color={tema.extra.info}
              />
              <Text variant="bodySmall" style={[estilos.flex, { color: tema.colors.onSurface }]}>
                Antes de confirmar, revisa en <Text style={estilos.negrita}>tu</Text> celular que
                llegó la notificación con el monto y el{' '}
                <Text style={estilos.negrita}>código de 3 dígitos</Text>. No te guíes por la
                pantalla del cliente.
              </Text>
            </View>
          ) : null}

          {metodoDePago === 'Fiado' ? (
            <SelectorCliente
              clienteId={clienteId}
              onSeleccionar={fijarCliente}
              onNuevoCliente={() => navigation.navigate('ClienteForm')}
            />
          ) : null}

          {error ? (
            <HelperText type="error" visible testID="error-cobro">
              {error}
            </HelperText>
          ) : null}
        </ScrollView>

        <View style={estilos.totalFila}>
          <Text variant="titleMedium" style={{ color: tema.colors.onSurfaceVariant }}>
            Total
          </Text>
          <Text
            variant="headlineMedium"
            style={[NUMEROS, { color: tema.colors.onSurface }]}
            testID="total-cobro"
          >
            {formatearSoles(total)}
          </Text>
        </View>
        <Button
          mode="contained"
          icon="check-circle"
          onPress={confirmarVenta}
          loading={enviando}
          disabled={enviando || sinStockSuficiente || (metodoDePago === 'Fiado' && !clienteId)}
          contentStyle={estilos.botonGrande}
          labelStyle={estilos.botonTexto}
          testID="boton-confirmar-venta"
        >
          {sinStockSuficiente
            ? 'Stock insuficiente'
            : metodoDePago === 'Fiado' && !clienteId
              ? 'Elige un cliente'
              : 'Confirmar venta'}
        </Button>
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  lista: { padding: espacio.md },
  encabezado: { marginBottom: espacio.xs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingVertical: espacio.sm,
    paddingLeft: espacio.md,
    paddingRight: espacio.xs,
    borderLeftWidth: StyleSheet.hairlineWidth * 2,
    borderRightWidth: StyleSheet.hairlineWidth * 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  itemPrimero: {
    borderTopLeftRadius: radio.lg,
    borderTopRightRadius: radio.lg,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  itemUltimo: {
    borderBottomLeftRadius: radio.lg,
    borderBottomRightRadius: radio.lg,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: radio.completo },
  paso: { margin: 0, width: TACTIL_MIN, height: TACTIL_MIN },
  cantidad: { minWidth: 24, textAlign: 'center' },
  vaciar: { alignSelf: 'center', marginTop: espacio.sm },
  aviso: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    padding: espacio.sm,
    borderRadius: radio.md,
  },
  panelDesplazable: { gap: espacio.xs },
  segmento: { minHeight: TACTIL_MIN, justifyContent: 'center' },
  negrita: { fontFamily: familia.negrita },
  panel: {
    padding: espacio.md,
    gap: espacio.xs,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  totalFila: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: espacio.xxs,
  },
  // minHeight: con letra grande el botón crece en vez de cortar "Confirmar venta".
  botonGrande: { minHeight: 56 },
  botonTexto: { fontSize: 17, fontFamily: familia.negrita, letterSpacing: -0.1 },
});
