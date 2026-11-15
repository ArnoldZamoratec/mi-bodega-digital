import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { useCallback, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTema } from '../hooks/useDerivados';
import { degradado } from '../theme/tema';
import { useVentana } from '../theme/ventana';
import { ambar, kraft } from '../theme/paleta';
import { espacio, NUMEROS, radio } from '../theme/tokens';
import { Presionable } from './Presionable';

interface Props {
  /** Línea pequeña sobre el título (fecha, contexto). */
  antetitulo?: string;
  titulo: string;
  /** Acciones a la derecha del título. */
  derecha?: ReactNode;
  /** Contenido extra dentro del degradado: métricas, buscador, filtros. */
  children?: ReactNode;
}

/** Colores de texto sobre el degradado (fijos: el fondo es oscuro en ambos temas). */
export const sobreHero = {
  texto: kraft[0],
  // Medidos (WCAG) sobre el punto más claro del degradado + panel translúcido:
  // tenue 4.99:1, blanco 6.39:1, acento 4.58:1. No aclarar el degradado sin re-medir.
  tenue: 'rgba(255, 255, 255, 0.85)',
  superficie: 'rgba(255, 255, 255, 0.12)',
  borde: 'rgba(255, 255, 255, 0.16)',
  acento: ambar[200],
} as const;

/**
 * Encabezado de pestaña con degradado de marca, círculos decorativos y esquinas inferiores
 * redondeadas. Pone la barra de estado en claro mientras la pantalla tiene el foco.
 */
export function EncabezadoHero({ antetitulo, titulo, derecha, children }: Props) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  // Pantalla corta u horizontal: el encabezado cede espacio a la lista (sin antetítulo,
  // título más chico, menos aire). Las métricas también se ocultan (FilaDatosHero).
  const { altoCompacto } = useVentana();

  // Sin limpieza al perder el foco: el blur de una pestaña llega después del focus de la
  // siguiente y la dejaría en oscuro. Las pantallas apiladas fijan su estilo (Navegacion).
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
    }, []),
  );

  return (
    <LinearGradient
      colors={tema.dark ? degradado.oscuro : degradado.claro}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        estilos.hero,
        {
          paddingTop: insets.top + (altoCompacto ? espacio.xxs : espacio.sm),
          paddingBottom: altoCompacto ? espacio.sm : espacio.lg,
          // Muescas y cámaras laterales en horizontal.
          paddingLeft: espacio.md + insets.left,
          paddingRight: espacio.md + insets.right,
        },
      ]}
    >
      {/* Profundidad: dos círculos translúcidos, puramente decorativos. */}
      <View pointerEvents="none" style={[estilos.circulo, estilos.circuloGrande]} />
      <View pointerEvents="none" style={[estilos.circulo, estilos.circuloChico]} />

      <View style={estilos.fila}>
        <View style={estilos.flex}>
          {antetitulo && !altoCompacto ? (
            <Text variant="labelMedium" style={{ color: sobreHero.tenue }} numberOfLines={1}>
              {antetitulo}
            </Text>
          ) : null}
          <Text
            variant={altoCompacto ? 'titleLarge' : 'headlineMedium'}
            style={{ color: sobreHero.texto }}
            numberOfLines={1}
            accessibilityRole="header"
          >
            {titulo}
          </Text>
        </View>
        {derecha}
      </View>
      {children ? (
        <View style={[estilos.contenido, altoCompacto && estilos.contenidoCompacto]}>
          {children}
        </View>
      ) : null}
    </LinearGradient>
  );
}

/** Métrica compacta para el encabezado. */
export function DatoHero({
  etiqueta,
  valor,
  acento = false,
  onPress,
  testID,
}: {
  etiqueta: string;
  valor: string;
  /** La cifra protagonista del encabezado, en Ámbar Mostrador (una por pantalla). */
  acento?: boolean;
  /** Si se pasa, el dato abre su detalle (lleva un chevrón para que se note). */
  onPress?: () => void;
  testID?: string;
}) {
  const contenido = (
    <>
      <View style={estilos.datoEtiqueta}>
        <Text variant="labelSmall" style={{ color: sobreHero.tenue }} numberOfLines={2}>
          {etiqueta}
        </Text>
        {onPress ? (
          <MaterialCommunityIcons name="chevron-right" size={14} color={sobreHero.tenue} />
        ) : null}
      </View>
      <Text
        variant="titleMedium"
        style={[NUMEROS, { color: acento ? sobreHero.acento : sobreHero.texto }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
      >
        {valor}
      </Text>
    </>
  );
  if (onPress) {
    return (
      <Presionable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${etiqueta}: ${valor}. Ver detalle`}
        testID={testID}
        contenedorStyle={estilos.dato}
        style={estilos.datoPresionable}
      >
        {contenido}
      </Presionable>
    );
  }
  return (
    // Achica el valor solo un poco: un monto ilegible por la letra grande no sirve.
    <View style={estilos.dato} accessible accessibilityLabel={`${etiqueta}: ${valor}`}>
      {contenido}
    </View>
  );
}

interface ChipProps {
  etiqueta: string;
  activo: boolean;
  onPress: () => void;
  icono?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  testID?: string;
  accessibilityLabel?: string;
}

/** Filtro tipo píldora sobre el degradado: translúcido inactivo, blanco sólido activo. */
export function ChipHero({
  etiqueta,
  activo,
  onPress,
  icono,
  testID,
  accessibilityLabel,
}: ChipProps) {
  const tema = useTema();
  const color = activo ? tema.colors.primary : sobreHero.texto;
  return (
    <Presionable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={accessibilityLabel ?? etiqueta}
      testID={testID}
      // 40dp visibles + 4dp arriba y abajo = 48dp táctiles.
      hitSlop={{ top: 4, bottom: 4 }}
      style={[
        estilos.chip,
        activo
          ? { backgroundColor: kraft[0], borderColor: kraft[0] }
          : { backgroundColor: sobreHero.superficie, borderColor: sobreHero.borde },
      ]}
    >
      {icono ? <MaterialCommunityIcons name={icono} size={16} color={color} /> : null}
      <Text variant="labelLarge" style={{ color }}>
        {etiqueta}
      </Text>
    </Presionable>
  );
}

/**
 * Fila de métricas. Con poco alto (horizontal) se oculta para darle espacio a la lista;
 * en teléfonos angostos o con letra grande pasa de 3 columnas a 2 + 1.
 */
export function FilaDatosHero({ children }: { children: ReactNode }) {
  const { altoCompacto } = useVentana();
  if (altoCompacto) return null;
  return <View style={estilos.filaDatos}>{children}</View>;
}

/** Fila de filtros que pasa a la línea siguiente si no entra (320dp, letra grande). */
export function FiltrosHero({ children }: { children: ReactNode }) {
  return <View style={estilos.filtros}>{children}</View>;
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  hero: {
    paddingHorizontal: espacio.md,
    paddingBottom: espacio.lg,
    borderBottomLeftRadius: radio.xl,
    borderBottomRightRadius: radio.xl,
    overflow: 'hidden',
  },
  circulo: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  circuloGrande: { width: 260, height: 260, top: -120, right: -80 },
  circuloChico: { width: 140, height: 140, bottom: -70, left: -40 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 48 },
  contenido: { marginTop: espacio.md, gap: espacio.sm },
  contenidoCompacto: { marginTop: espacio.xs, gap: espacio.xs },
  filaDatos: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: espacio.sm,
    columnGap: espacio.xs,
    padding: espacio.sm,
    borderRadius: radio.lg,
    backgroundColor: sobreHero.superficie,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: sobreHero.borde,
  },
  // flexBasis + minWidth: 3 columnas cuando entran; si no, se apilan 2 + 1.
  dato: { flexGrow: 1, flexBasis: '30%', minWidth: 96, gap: 2, paddingHorizontal: espacio.xxs },
  datoPresionable: { gap: 2, minHeight: 44, justifyContent: 'center' },
  datoEtiqueta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: espacio.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xxs,
    // minHeight + padding: crece con la letra del sistema en vez de cortarla.
    minHeight: 40,
    paddingVertical: espacio.xxs,
    paddingHorizontal: espacio.sm,
    borderRadius: radio.completo,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
});
