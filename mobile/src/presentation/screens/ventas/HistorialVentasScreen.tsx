import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, Portal, RadioButton, SegmentedButtons, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { MetodoPagoVenta, Venta } from '@/domain/entities';
import {
  idsAnulados,
  MOTIVOS_ANULACION,
  ventasVigentes,
  type MotivoAnulacion,
} from '@/domain/rules/anulacion';
import { tieneProductos } from '@/domain/rules/carrito';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';
import { fechaEfectiva, rangoPredefinido, type RangoFechas } from '@/domain/rules/reportes';
import { anularVenta } from '@/domain/usecases/anularVenta';

import { textoAutoria } from '../../autoria';
import { EntradaLista } from '../../components/Aparecer';
import { BannerConexion } from '../../components/BannerConexion';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave, type NombreIcono } from '../../components/IconoSuave';
import { Presionable } from '../../components/Presionable';
import { useTema } from '../../hooks/useDerivados';
import { useEstiloDialogo } from '../../hooks/useDisposicion';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { requiereConexion } from '../../stores/redStore';
import { useContenedor, usePuede } from '../../stores/sesionStore';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

type Periodo = 'hoy' | 'ayer' | 'semana';

const ICONO_METODO: Record<MetodoPagoVenta, NombreIcono> = {
  Efectivo: 'cash',
  'Yape/Plin': 'cellphone',
  Fiado: 'notebook-outline',
};

const hora = (f: Date | null) =>
  f ? f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : 'Ahora';

const fechaCorta = (f: Date | null) =>
  f ? f.toLocaleDateString('es-PE', { weekday: 'short', day: 'numeric' }) : '';

/** "Arroz ×2, Pan ×5 y 3 más" */
function resumenItems(v: Venta): string {
  const partes = v.items.slice(0, 2).map((i) => `${i.nombre} ×${Math.abs(i.cantidad)}`);
  const resto = v.items.length - partes.length;
  return resto > 0 ? `${partes.join(', ')} y ${resto} más` : partes.join(', ');
}

/**
 * Historial de ventas con anulación (roadmap #1).
 * Wireframe:
 *  [Hoy | Ayer | 7 días]
 *  [n ventas · S/ total]
 *  [fila: ícono de pago · S/ total · hora · productos · (Anulada)]  ← toque = detalle
 *  [detalle: ítems, total, cliente → Anular venta (motivo) → contraasiento]
 * Las anulaciones no aparecen como filas propias: la venta original se marca "Anulada".
 */
export function HistorialVentasScreen({ navigation }: PantallaRaiz<'HistorialVentas'>) {
  const tema = useTema();
  const contenedor = useContenedor();
  const clientes = useDatos((s) => s.clientes.datos);
  const pendientes = useDatos((s) => s.pendientes);
  const [periodo, setPeriodo] = useState<Periodo>('hoy');
  const rango = useMemo<RangoFechas>(() => rangoPredefinido(periodo, new Date()), [periodo]);
  const [ventas, setVentas] = useState<{ rango: RangoFechas; datos: Venta[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [detalle, setDetalle] = useState<Venta | null>(null);
  const puedeAnular = usePuede('anularVenta');

  useEffect(
    () =>
      contenedor.ventas.observarRango(
        rango,
        (datos) => {
          setError(null);
          setVentas({ rango, datos });
        },
        (e) => setError(mensajeDeError(e, 'No se pudieron cargar las ventas')),
      ),
    [contenedor, rango, intento],
  );

  const datos = ventas?.rango === rango ? ventas.datos : null;
  const anuladas = useMemo(() => idsAnulados(datos ?? []), [datos]);
  const vigentes = useMemo(() => ventasVigentes(datos ?? []), [datos]);
  // Se listan las ventas (no los contraasientos), de la más reciente a la más antigua.
  const filas = useMemo(
    () =>
      (datos ?? [])
        .filter((v) => !v.anulaA)
        .sort(
          (a, b) =>
            (fechaEfectiva(b)?.getTime() ?? Infinity) - (fechaEfectiva(a)?.getTime() ?? Infinity),
        ),
    [datos],
  );
  const pendientesDelRango = pendientes.filter(
    (p) =>
      p.operacion.creadaEn >= rango.inicio.getTime() && p.operacion.creadaEn <= rango.fin.getTime(),
  );
  const nombreCliente = (id: string | null) => clientes.find((c) => c.id === id)?.nombre;

  let contenido;
  if (error)
    contenido = (
      <EstadoVista
        tipo="error"
        titulo="No se pudieron cargar las ventas"
        mensaje={error}
        accion={{ etiqueta: 'Reintentar', onPress: () => setIntento((n) => n + 1) }}
      />
    );
  else if (!datos) contenido = <EstadoVista tipo="cargando" esqueleto />;
  else if (filas.length === 0 && pendientesDelRango.length === 0)
    contenido = (
      <EstadoVista
        tipo="vacio"
        icono="receipt-text-outline"
        titulo="Sin ventas en este periodo"
        mensaje={
          puedeAnular
            ? 'Las ventas que cobres aparecerán aquí y podrás anularlas si te equivocas.'
            : 'Las ventas que cobres aparecerán aquí.'
        }
      />
    );
  else
    contenido = (
      <FlatList
        data={filas}
        keyExtractor={(v) => v.id}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View style={estilos.cabeceraLista}>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              {vigentes.length === 1 ? '1 venta' : `${vigentes.length} ventas`} ·{' '}
              <Text style={[NUMEROS, { color: tema.colors.onSurface }]}>
                {formatearSoles(sumarSoles((datos ?? []).map((v) => v.total)))}
              </Text>
            </Text>
            {pendientesDelRango.length > 0 ? (
              <Presionable
                onPress={() => navigation.navigate('VentasPendientes')}
                accessibilityRole="button"
                style={[estilos.pendientes, { backgroundColor: tema.extra.fondoAdvertencia }]}
              >
                <MaterialCommunityIcons
                  name="cloud-upload-outline"
                  size={20}
                  color={tema.extra.advertencia}
                />
                <Text variant="bodyMedium" style={[estilos.flex, { color: tema.colors.onSurface }]}>
                  {pendientesDelRango.length === 1
                    ? '1 venta guardada en el teléfono'
                    : `${pendientesDelRango.length} ventas guardadas en el teléfono`}
                  {puedeAnular ? ' · aún no se pueden anular aquí' : ''}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={20}
                  color={tema.colors.outline}
                />
              </Presionable>
            ) : null}
          </View>
        }
        renderItem={({ item, index }) => {
          const anulada = anuladas.has(item.id);
          return (
            <EntradaLista indice={index}>
              <Presionable
                onPress={() => setDetalle(item)}
                accessibilityRole="button"
                accessibilityLabel={`Venta de ${formatearSoles(item.total)}, ${item.metodoDePago}, ${hora(fechaEfectiva(item))}${anulada ? ', anulada' : ''}. Toca para ver el detalle`}
                testID={`venta-${item.id}`}
                style={[
                  estilos.fila,
                  {
                    backgroundColor: tema.colors.surface,
                    borderColor: tema.extra.borde,
                    boxShadow: anulada ? undefined : tema.extra.sombra[1],
                  },
                  anulada && estilos.apagada,
                ]}
              >
                <IconoSuave
                  nombre={ICONO_METODO[item.metodoDePago]}
                  tamano={40}
                  color={item.metodoDePago === 'Fiado' ? tema.extra.deuda : tema.colors.primary}
                  fondo={
                    item.metodoDePago === 'Fiado'
                      ? tema.extra.fondoDeuda
                      : tema.colors.secondaryContainer
                  }
                />
                <View style={estilos.flex}>
                  <View style={estilos.meta}>
                    <Text variant="titleMedium" style={[NUMEROS, anulada && estilos.tachado]}>
                      {formatearSoles(item.total)}
                    </Text>
                    {anulada ? (
                      <View style={[estilos.pildora, { backgroundColor: tema.extra.fondoDeuda }]}>
                        <Text variant="labelSmall" style={{ color: tema.extra.deuda }}>
                          Anulada
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text
                    variant="bodySmall"
                    numberOfLines={1}
                    style={{ color: tema.colors.onSurfaceVariant }}
                  >
                    {resumenItems(item)}
                  </Text>
                  {textoAutoria('venta', item, 'Vendió') ? (
                    <Text
                      variant="labelSmall"
                      numberOfLines={1}
                      style={{ color: tema.colors.onSurfaceVariant }}
                      testID={`autor-${item.id}`}
                    >
                      {textoAutoria('venta', item, 'Vendió')}
                    </Text>
                  ) : null}
                </View>
                <View style={estilos.derecha}>
                  <Text variant="labelLarge" style={NUMEROS}>
                    {hora(fechaEfectiva(item))}
                  </Text>
                  {periodo === 'semana' ? (
                    <Text variant="labelSmall" style={{ color: tema.colors.onSurfaceVariant }}>
                      {fechaCorta(fechaEfectiva(item))}
                    </Text>
                  ) : null}
                </View>
              </Presionable>
            </EntradaLista>
          );
        }}
        testID="lista-historial"
      />
    );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <BannerConexion onPress={() => navigation.navigate('VentasPendientes')} />
      <View style={estilos.periodos}>
        <SegmentedButtons
          value={periodo}
          onValueChange={(v) => setPeriodo(v as Periodo)}
          buttons={[
            { value: 'hoy', label: 'Hoy', testID: 'historial-hoy' },
            { value: 'ayer', label: 'Ayer', testID: 'historial-ayer' },
            { value: 'semana', label: '7 días', testID: 'historial-semana' },
          ]}
        />
      </View>
      {contenido}
      <DetalleVenta
        venta={detalle}
        anulada={detalle ? anuladas.has(detalle.id) : false}
        motivoAnulacion={
          detalle ? datos?.find((v) => v.anulaA === detalle.id)?.motivoAnulacion : undefined
        }
        cliente={detalle ? nombreCliente(detalle.clienteId) : undefined}
        onCerrar={() => setDetalle(null)}
        onAnular={async (venta, motivo) => {
          if (!requiereConexion()) return false;
          try {
            await anularVenta({ ventas: contenedor.ventas }, venta, motivo);
            haptica.exito();
            avisar(
              tieneProductos(venta.items)
                ? 'Venta anulada. El stock volvió al inventario.'
                : 'Venta anulada. Ya no suma en tus reportes.',
              'exito',
            );
            return true;
          } catch (e) {
            haptica.error();
            avisar(mensajeDeError(e, 'No se pudo anular la venta'), 'error');
            return false;
          }
        }}
      />
    </View>
  );
}

interface DetalleProps {
  venta: Venta | null;
  anulada: boolean;
  motivoAnulacion?: string;
  cliente?: string;
  onCerrar: () => void;
  onAnular: (venta: Venta, motivo: MotivoAnulacion) => Promise<boolean>;
}

/**
 * Detalle en diálogo. Anular está detrás de un segundo paso (elegir motivo) porque es
 * destructivo para la caja; el motivo queda guardado en el contraasiento.
 */
function DetalleVenta({
  venta,
  anulada,
  motivoAnulacion,
  cliente,
  onCerrar,
  onAnular,
}: DetalleProps) {
  const tema = useTema();
  const estiloDialogo = useEstiloDialogo();
  const [anulando, setAnulando] = useState(false);
  const [motivo, setMotivo] = useState<MotivoAnulacion | null>(null);
  const [enviando, setEnviando] = useState(false);
  // D-33: anular es solo del dueño (las reglas lo exigen; la interfaz lo refleja).
  const puedeAnular = usePuede('anularVenta');
  const autor = textoAutoria('venta', venta, 'Vendió');

  const cerrar = () => {
    setAnulando(false);
    setMotivo(null);
    onCerrar();
  };

  return (
    <Portal>
      <Dialog
        visible={venta !== null}
        onDismiss={cerrar}
        style={[estilos.dialogo, estiloDialogo, { backgroundColor: tema.colors.surface }]}
        testID="detalle-venta"
      >
        {venta ? (
          <>
            <Dialog.Title>{anulando ? 'Anular venta' : 'Detalle de la venta'}</Dialog.Title>
            <Dialog.ScrollArea style={estilos.area}>
              <ScrollView contentContainerStyle={estilos.cuerpo}>
                {!anulando ? (
                  <>
                    <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                      {fechaCorta(fechaEfectiva(venta))} · {hora(fechaEfectiva(venta))} ·{' '}
                      {venta.metodoDePago}
                      {cliente ? ` · ${cliente}` : ''}
                    </Text>
                    {autor ? (
                      <Text
                        variant="bodyMedium"
                        style={{ color: tema.colors.onSurfaceVariant }}
                        testID="detalle-autor"
                      >
                        {autor}
                      </Text>
                    ) : null}
                    {venta.items.map((i, k) => (
                      <View key={`${i.id}-${k}`} style={estilos.item}>
                        <Text variant="bodyLarge" style={estilos.flex} numberOfLines={2}>
                          {i.nombre} ×{i.cantidad}
                        </Text>
                        <Text variant="bodyLarge" style={NUMEROS}>
                          {formatearSoles(i.precio * i.cantidad)}
                        </Text>
                      </View>
                    ))}
                    <View style={[estilos.item, estilos.total]}>
                      <Text variant="titleMedium" style={estilos.flex}>
                        Total
                      </Text>
                      <Text variant="titleLarge" style={NUMEROS}>
                        {formatearSoles(venta.total)}
                      </Text>
                    </View>
                    {anulada ? (
                      <View style={[estilos.aviso, { backgroundColor: tema.extra.fondoDeuda }]}>
                        <MaterialCommunityIcons name="cancel" size={18} color={tema.extra.deuda} />
                        <Text
                          variant="bodySmall"
                          style={[estilos.flex, { color: tema.colors.onSurface }]}
                        >
                          Anulada{motivoAnulacion ? ` · ${motivoAnulacion}` : ''}. Ya no suma en tus
                          reportes
                          {tieneProductos(venta.items) ? ' y el stock volvió al inventario' : ''}.
                        </Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                      ¿Por qué anulas esta venta de {formatearSoles(venta.total)}?
                    </Text>
                    <RadioButton.Group
                      value={motivo ?? ''}
                      onValueChange={(v) => setMotivo(v as MotivoAnulacion)}
                    >
                      {MOTIVOS_ANULACION.map((m) => (
                        <RadioButton.Item
                          key={m}
                          label={m}
                          value={m}
                          style={estilos.radio}
                          testID={`motivo-${m}`}
                        />
                      ))}
                    </RadioButton.Group>
                    <View style={[estilos.aviso, { backgroundColor: tema.extra.fondoAdvertencia }]}>
                      <MaterialCommunityIcons
                        name="information-outline"
                        size={18}
                        color={tema.extra.advertencia}
                      />
                      <Text
                        variant="bodySmall"
                        style={[estilos.flex, { color: tema.colors.onSurface }]}
                      >
                        {tieneProductos(venta.items)
                          ? 'Los productos vuelven al inventario y la venta deja de sumar en tus reportes.'
                          : 'La venta deja de sumar en tus reportes.'}
                        {venta.metodoDePago === 'Fiado'
                          ? ` También se borra la deuda${cliente ? ` de ${cliente}` : ''}; si ya pagó una parte, quedará como saldo a favor.`
                          : ''}
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
            </Dialog.ScrollArea>
            <Dialog.Actions style={estilos.acciones}>
              {!anulando ? (
                <>
                  {!anulada && puedeAnular ? (
                    <Button
                      textColor={tema.extra.deuda}
                      onPress={() => setAnulando(true)}
                      testID="boton-anular-venta"
                    >
                      Anular venta
                    </Button>
                  ) : null}
                  <Button mode="contained" onPress={cerrar} contentStyle={estilos.boton}>
                    Listo
                  </Button>
                </>
              ) : (
                <>
                  <Button onPress={() => setAnulando(false)} disabled={enviando}>
                    Volver
                  </Button>
                  <Button
                    mode="contained"
                    buttonColor={tema.extra.deuda}
                    textColor={tema.colors.onError}
                    disabled={!motivo || enviando}
                    loading={enviando}
                    contentStyle={estilos.boton}
                    onPress={async () => {
                      if (!motivo) return;
                      setEnviando(true);
                      const ok = await onAnular(venta, motivo);
                      setEnviando(false);
                      if (ok) cerrar();
                    }}
                    testID="confirmar-anulacion"
                  >
                    Anular venta
                  </Button>
                </>
              )}
            </Dialog.Actions>
          </>
        ) : null}
      </Dialog>
    </Portal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  periodos: {
    paddingHorizontal: espacio.md,
    paddingTop: espacio.sm,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  lista: {
    padding: espacio.md,
    gap: espacio.xs,
    paddingBottom: espacio.xl,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  cabeceraLista: { gap: espacio.sm, marginBottom: espacio.xxs },
  pendientes: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    padding: espacio.sm,
    borderRadius: radio.md,
    minHeight: TACTIL_MIN,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    padding: espacio.sm,
    borderRadius: radio.lg,
    borderWidth: StyleSheet.hairlineWidth * 2,
    minHeight: 64,
  },
  apagada: { opacity: 0.6 },
  meta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: espacio.xs },
  tachado: { textDecorationLine: 'line-through' },
  pildora: { paddingHorizontal: espacio.xs, paddingVertical: 2, borderRadius: radio.completo },
  derecha: { alignItems: 'flex-end' },
  dialogo: { borderRadius: radio.xl, maxHeight: '85%' },
  area: { paddingHorizontal: 0 },
  cuerpo: { paddingHorizontal: espacio.lg, paddingVertical: espacio.xs, gap: espacio.xs },
  item: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm },
  total: { marginTop: espacio.xs },
  aviso: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.xs,
    padding: espacio.sm,
    borderRadius: radio.md,
    marginTop: espacio.xs,
  },
  radio: { paddingVertical: espacio.xxs },
  acciones: { flexWrap: 'wrap', rowGap: espacio.xs },
  boton: { minHeight: TACTIL_MIN },
});
