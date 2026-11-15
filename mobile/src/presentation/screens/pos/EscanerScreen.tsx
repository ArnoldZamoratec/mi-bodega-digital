import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useIsFocused } from '@react-navigation/native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { totalCarrito, unidadesEnCarrito } from '@/domain/rules/carrito';
import { formatearSoles } from '@/domain/rules/dinero';
import { buscarPorCodigo } from '@/domain/rules/productos';

import { confirmar } from '../../components/Confirmar';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave } from '../../components/IconoSuave';
import { useProductosVisibles, useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { useCarrito } from '../../stores/carritoStore';
import { useCodigoEscaneado } from '../../stores/escanerStore';
import { ambar } from '../../theme/paleta';
import { espacio, radio } from '../../theme/tokens';

/** EAN/UPC (productos de bodega), Code128 y QR. */
const FORMATOS = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

/** Evita leer el mismo código varias veces por segundo mientras sigue en cámara. */
const PAUSA_MS = 1500;

/**
 * Escáner (D-09, expo-camera).
 *  modo "pos": escaneo continuo; cada lectura suma 1 al carrito con vibración.
 *    Si el código no existe, ofrece crear el producto.
 *  modo "codigo": devuelve el código leído al formulario de producto.
 * Estados: pidiendo permiso · permiso denegado · cámara activa.
 */
export function EscanerScreen({ navigation, route }: PantallaRaiz<'Escaner'>) {
  const { modo } = route.params;
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const enfocada = useIsFocused();
  const [permiso, pedirPermiso] = useCameraPermissions();
  const productos = useProductosVisibles();
  const items = useCarrito((s) => s.items);
  const agregar = useCarrito((s) => s.agregar);
  const fijarCodigo = useCodigoEscaneado((s) => s.fijar);
  const [ultimo, setUltimo] = useState<string | null>(null);
  const bloqueo = useRef<{ codigo: string; hasta: number } | null>(null);
  const [pausado, setPausado] = useState(false);

  if (!permiso) return <EstadoVista tipo="cargando" />;

  if (!permiso.granted) {
    return (
      <EstadoVista
        tipo="vacio"
        icono="camera-outline"
        titulo="Necesitamos la cámara"
        mensaje="Para escanear códigos de barras, permite el acceso a la cámara."
        accion={
          permiso.canAskAgain
            ? { etiqueta: 'Permitir cámara', onPress: () => void pedirPermiso() }
            : { etiqueta: 'Volver', onPress: () => navigation.goBack() }
        }
      />
    );
  }

  const alLeer = async ({ data }: BarcodeScanningResult) => {
    const codigo = data.trim();
    const ahora = Date.now();
    if (
      pausado ||
      (bloqueo.current && bloqueo.current.codigo === codigo && bloqueo.current.hasta > ahora)
    )
      return;
    bloqueo.current = { codigo, hasta: ahora + PAUSA_MS };

    if (modo === 'codigo') {
      haptica.exito();
      fijarCodigo(codigo);
      navigation.goBack();
      return;
    }

    const producto = buscarPorCodigo(productos, codigo);
    if (producto) {
      if (agregar(producto)) {
        haptica.exito();
        setUltimo(`+1 ${producto.nombre}`);
      } else {
        haptica.advertencia();
        setUltimo(
          (producto.stock ?? 0) <= 0
            ? `${producto.nombre}: agotado`
            : `${producto.nombre}: no hay más en stock`,
        );
      }
      return;
    }

    haptica.advertencia();
    setPausado(true);
    const crear = await confirmar({
      titulo: 'Código no registrado',
      mensaje: `No hay ningún producto con el código ${codigo}. ¿Quieres crearlo?`,
      confirmar: 'Crear producto',
    });
    setPausado(false);
    if (crear) navigation.navigate('ProductoForm', { codigoBarras: codigo });
  };

  return (
    <View style={estilos.flex}>
      {enfocada ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: [...FORMATOS] }}
          onBarcodeScanned={pausado ? undefined : alLeer}
          testID="camara"
        />
      ) : null}
      <View style={estilos.marco} pointerEvents="none" accessibilityElementsHidden>
        {/* La sombra con "spread" enorme oscurece todo menos la ventana de lectura. */}
        <View style={estilos.ventana}>
          <View style={[estilos.esquina, estilos.supIzq]} />
          <View style={[estilos.esquina, estilos.supDer]} />
          <View style={[estilos.esquina, estilos.infIzq]} />
          <View style={[estilos.esquina, estilos.infDer]} />
        </View>
        <View style={estilos.guia}>
          <MaterialCommunityIcons name="barcode-scan" size={16} color="#FFFFFF" />
          <Text variant="labelLarge" style={estilos.guiaTexto}>
            {modo === 'pos' ? 'Apunta al código del producto' : 'Apunta al código de barras'}
          </Text>
        </View>
      </View>
      {modo === 'pos' ? (
        <View
          style={[
            estilos.panel,
            {
              paddingBottom: espacio.md + insets.bottom,
              backgroundColor: tema.colors.surface,
              boxShadow: tema.extra.sombra[3],
            },
          ]}
        >
          <View style={estilos.panelFila}>
            <IconoSuave
              nombre={ultimo ? 'check' : 'cart-outline'}
              tamano={44}
              color={tema.colors.primary}
              fondo={tema.colors.secondaryContainer}
            />
            <View style={estilos.panelTextos}>
              <Text variant="titleMedium" numberOfLines={1} accessibilityLiveRegion="polite">
                {ultimo ?? 'Escanea productos para agregarlos'}
              </Text>
              <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                {unidadesEnCarrito(items) === 1
                  ? '1 unidad'
                  : `${unidadesEnCarrito(items)} unidades`}{' '}
                · {formatearSoles(totalCarrito(items))}
              </Text>
            </View>
          </View>
          <Button
            mode="contained"
            icon="check"
            onPress={() => navigation.goBack()}
            contentStyle={estilos.boton}
            testID="boton-listo-escaner"
          >
            Listo
          </Button>
        </View>
      ) : null}
    </View>
  );
}

/** Esquinas en Ámbar Mostrador: máximo contraste sobre la cámara y acento de marca. */
const COLOR_ESQUINA = ambar[400];
const LARGO_ESQUINA = 28;
const GROSOR = 4;

const estilos = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  marco: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ventana: {
    width: '78%',
    height: 168,
    borderRadius: radio.lg,
    boxShadow: '0px 0px 0px 2000px rgba(0, 0, 0, 0.55)',
  },
  esquina: {
    position: 'absolute',
    width: LARGO_ESQUINA,
    height: LARGO_ESQUINA,
    borderColor: COLOR_ESQUINA,
  },
  supIzq: {
    top: 0,
    left: 0,
    borderTopWidth: GROSOR,
    borderLeftWidth: GROSOR,
    borderTopLeftRadius: radio.lg,
  },
  supDer: {
    top: 0,
    right: 0,
    borderTopWidth: GROSOR,
    borderRightWidth: GROSOR,
    borderTopRightRadius: radio.lg,
  },
  infIzq: {
    bottom: 0,
    left: 0,
    borderBottomWidth: GROSOR,
    borderLeftWidth: GROSOR,
    borderBottomLeftRadius: radio.lg,
  },
  infDer: {
    bottom: 0,
    right: 0,
    borderBottomWidth: GROSOR,
    borderRightWidth: GROSOR,
    borderBottomRightRadius: radio.lg,
  },
  guia: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xs,
    marginTop: espacio.lg,
    paddingHorizontal: espacio.md,
    paddingVertical: espacio.xs,
    borderRadius: radio.completo,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  guiaTexto: { color: '#FFFFFF' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: espacio.md,
    gap: espacio.md,
    borderTopLeftRadius: radio.xl,
    borderTopRightRadius: radio.xl,
  },
  panelFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  panelTextos: { flex: 1 },
  boton: { minHeight: 52 },
});
