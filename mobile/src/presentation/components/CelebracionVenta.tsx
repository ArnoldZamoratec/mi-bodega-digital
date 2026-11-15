import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, View } from 'react-native';
import { Button, IconButton, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensajeDeError } from '@/data/firebase/errores';
import { tieneProductos } from '@/domain/rules/carrito';
import { formatearSoles } from '@/domain/rules/dinero';
import { deshacerVenta } from '@/domain/usecases/anularVenta';

import { useTema } from '../hooks/useDerivados';
import { useReducirMovimiento } from '../hooks/useReducirMovimiento';
import { useVentasHoy } from '../hooks/useVentasHoy';
import { haptica } from '../services/haptica';
import { avisar } from '../stores/avisosStore';
import { useCarrito } from '../stores/carritoStore';
import { useCelebracion, type VentaCelebrada } from '../stores/celebracionStore';
import { useSesion } from '../stores/sesionStore';
import { useReservaInferior } from '../stores/cromoInferiorStore';
import { espacio, movimiento, NUMEROS, radio, TACTIL_MIN } from '../theme/tokens';

/**
 * Tiempo en pantalla. Como no bloquea, puede quedarse lo suficiente para "Deshacer" un
 * cobro equivocado; con vuelto, más: es el número que se necesita mientras se cuentan monedas.
 */
const DURACION_MS = 4000;
const DURACION_CON_VUELTO_MS = 6000;

const ICONO_METODO = {
  Efectivo: 'cash',
  'Yape/Plin': 'cellphone',
  Fiado: 'notebook-outline',
} as const;

/** Chispas: ángulos fijos para que la animación sea igual en cada venta. */
const CHISPAS = [0, 60, 120, 180, 240, 300];

/**
 * Pico de la experiencia (regla pico-final): cerrar una venta. Tarjeta NO modal al pie,
 * encima de las pestañas: no oscurece ni bloquea; se puede seguir vendiendo debajo
 * (debate UX: un modal 100 veces al día frena la fila). Check que rebota con brillo ámbar,
 * monto, vuelto destacado y cómo va el día. Se cierra sola o con un toque.
 */
export function CelebracionVenta() {
  const actual = useCelebracion((s) => s.actual);
  const cerrar = useCelebracion((s) => s.cerrar);

  useEffect(() => {
    if (!actual) return;
    AccessibilityInfo.announceForAccessibility(
      `${actual.sincronizada ? 'Venta registrada' : 'Venta guardada en el teléfono'}, ${formatearSoles(actual.total)}${actual.vuelto ? `. Vuelto ${formatearSoles(actual.vuelto)}` : ''}`,
    );
    const t = setTimeout(cerrar, actual.vuelto ? DURACION_CON_VUELTO_MS : DURACION_MS);
    return () => clearTimeout(t);
  }, [actual, cerrar]);

  if (!actual) return null;
  return <Contenido key={actual.id} venta={actual} onCerrar={cerrar} />;
}

function Contenido({ venta, onCerrar }: { venta: VentaCelebrada; onCerrar: () => void }) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const reserva = useReservaInferior();
  const reducir = useReducirMovimiento();
  const hoy = useVentasHoy();
  const [entrada] = useState(() => new Animated.Value(reducir ? 1 : 0));
  const [chispas] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (reducir) return;
    Animated.parallel([
      Animated.spring(entrada, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.timing(chispas, {
        toValue: 1,
        duration: 650,
        delay: 120,
        easing: movimiento.curva,
        useNativeDriver: true,
      }),
    ]).start();
  }, [entrada, chispas, reducir]);

  const exito = venta.sincronizada;
  const colorCheck = exito ? tema.colors.primary : tema.extra.advertencia;

  /**
   * Deshacer un cobro equivocado (preferido a un diálogo de confirmación antes de cobrar):
   * anula la venta (o la quita del teléfono si no se sincronizó) y devuelve los productos
   * al carrito para corregir y volver a cobrar.
   */
  const deshacer = async () => {
    const op = venta.operacion;
    const c = useSesion.getState().contenedor;
    if (!op || !c) return;
    onCerrar();
    try {
      await deshacerVenta({ ventas: c.ventas, cola: c.cola }, op);
      useCarrito.setState({
        items: op.venta.items,
        metodoDePago: op.venta.metodoDePago,
        clienteId: op.venta.clienteId,
      });
      haptica.toque();
      avisar(
        tieneProductos(op.venta.items)
          ? 'Venta deshecha. Los productos volvieron al carrito para corregir.'
          : 'Venta deshecha. El monto volvió al carrito para corregir.',
        'info',
      );
    } catch (e) {
      haptica.error();
      avisar(mensajeDeError(e, 'No se pudo deshacer. Puedes anularla desde Ventas.'), 'error');
    }
  };

  return (
    <View
      pointerEvents="box-none"
      style={[
        estilos.capa,
        {
          bottom: (reserva > 0 ? reserva : insets.bottom) + espacio.xs,
          left: espacio.md + insets.left,
          right: espacio.md + insets.right,
        },
      ]}
    >
      <Animated.View
        style={{
          // Ancho explícito: la capa centra (alignItems), y sin él este contenedor se
          // encogía al contenido y la columna de texto colapsaba letra por letra.
          width: '100%',
          maxWidth: 520,
          opacity: entrada,
          transform: [
            { translateY: entrada.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
          ],
        }}
      >
        <Pressable
          onPress={onCerrar}
          accessibilityRole="button"
          accessibilityLabel="Cerrar confirmación de venta"
          style={[
            estilos.tarjeta,
            {
              backgroundColor: tema.colors.surface,
              borderColor: tema.extra.borde,
              boxShadow: tema.extra.sombra[3],
            },
          ]}
          testID="celebracion-venta"
        >
          <View style={estilos.fila}>
            <View style={estilos.centro}>
              <Animated.View
                style={[
                  estilos.brillo,
                  {
                    backgroundColor: tema.extra.acento,
                    opacity: entrada.interpolate({ inputRange: [0, 1], outputRange: [0, 0.25] }),
                    transform: [
                      {
                        scale: entrada.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1.2],
                        }),
                      },
                    ],
                  },
                ]}
              />
              {CHISPAS.map((grados, i) => {
                const rad = (grados * Math.PI) / 180;
                const distancia = 36;
                return (
                  <Animated.View
                    key={grados}
                    style={[
                      estilos.chispa,
                      {
                        backgroundColor: i % 2 === 0 ? tema.extra.acento : tema.colors.primary,
                        opacity: chispas.interpolate({
                          inputRange: [0, 0.3, 1],
                          outputRange: [0, 1, 0],
                        }),
                        transform: [
                          {
                            translateX: chispas.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, Math.cos(rad) * distancia],
                            }),
                          },
                          {
                            translateY: chispas.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, Math.sin(rad) * distancia],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                );
              })}
              <Animated.View
                style={[
                  estilos.check,
                  {
                    backgroundColor: colorCheck,
                    transform: [
                      {
                        scale: entrada.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.4, 1],
                        }),
                      },
                    ],
                  },
                ]}
              >
                <MaterialCommunityIcons
                  name={exito ? 'check-bold' : 'cloud-off-outline'}
                  size={26}
                  color={tema.colors.onPrimary}
                />
              </Animated.View>
            </View>

            <View style={estilos.flex}>
              <Text variant="titleMedium" accessibilityRole="header" numberOfLines={2}>
                {exito ? 'Venta registrada' : 'Venta guardada en el teléfono'}
              </Text>
              <View style={estilos.meta}>
                <Text variant="titleLarge" style={NUMEROS}>
                  {formatearSoles(venta.total)}
                </Text>
                <View
                  style={[estilos.pildora, { backgroundColor: tema.colors.secondaryContainer }]}
                >
                  <MaterialCommunityIcons
                    name={ICONO_METODO[venta.metodo]}
                    size={14}
                    color={tema.colors.onSecondaryContainer}
                  />
                  <Text variant="labelMedium" style={{ color: tema.colors.onSecondaryContainer }}>
                    {venta.metodo}
                  </Text>
                </View>
              </View>
              <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                {venta.unidades === 1 ? '1 producto' : `${venta.unidades} productos`}
              </Text>
            </View>

            <IconButton
              icon="close"
              size={20}
              onPress={onCerrar}
              style={estilos.cerrar}
              accessibilityLabel="Nueva venta"
              testID="celebracion-nueva-venta"
            />
          </View>

          {venta.vuelto !== undefined ? (
            <View
              style={[estilos.vuelto, { backgroundColor: tema.extra.fondoAcento }]}
              testID="celebracion-vuelto"
            >
              <MaterialCommunityIcons
                name="hand-coin-outline"
                size={22}
                color={tema.extra.advertencia}
              />
              <Text variant="titleMedium" style={[estilos.flex, { color: tema.colors.onSurface }]}>
                Entrega de vuelto
              </Text>
              <Text variant="headlineSmall" style={[NUMEROS, { color: tema.colors.onSurface }]}>
                {formatearSoles(venta.vuelto)}
              </Text>
            </View>
          ) : null}

          {/* El final: cómo va el día. Refuerza el progreso sin pedir nada. */}
          <View style={estilos.dia}>
            <MaterialCommunityIcons
              name={exito ? 'trending-up' : 'cloud-sync-outline'}
              size={16}
              color={tema.extra.advertencia}
            />
            <Text
              variant="bodySmall"
              style={[estilos.flex, { color: tema.colors.onSurfaceVariant }]}
            >
              {exito
                ? hoy
                  ? `Hoy llevas ${formatearSoles(hoy.total)} en ${hoy.cantidad} ${hoy.cantidad === 1 ? 'venta' : 'ventas'}`
                  : 'Sumando tu día…'
                : 'Se enviará sola cuando vuelva el internet.'}
            </Text>
            {venta.operacion ? (
              <Button
                compact
                icon="undo-variant"
                onPress={() => void deshacer()}
                textColor={tema.colors.primary}
                testID="celebracion-deshacer"
                accessibilityLabel="Deshacer esta venta y volver los productos al carrito"
              >
                Deshacer
              </Button>
            ) : null}
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  capa: { position: 'absolute', alignItems: 'center' },
  tarjeta: {
    width: '100%',
    maxWidth: 520,
    borderRadius: radio.xl,
    borderWidth: StyleSheet.hairlineWidth * 2,
    padding: espacio.md,
    gap: espacio.sm,
  },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  centro: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  brillo: { position: 'absolute', width: 64, height: 64, borderRadius: radio.completo },
  chispa: { position: 'absolute', width: 6, height: 6, borderRadius: radio.completo },
  check: {
    width: 48,
    height: 48,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: espacio.xs },
  pildora: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xxs,
    paddingHorizontal: espacio.xs,
    paddingVertical: 2,
    borderRadius: radio.completo,
  },
  cerrar: { margin: 0, width: TACTIL_MIN, height: TACTIL_MIN, alignSelf: 'flex-start' },
  vuelto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.sm,
    borderRadius: radio.lg,
  },
  dia: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
});
