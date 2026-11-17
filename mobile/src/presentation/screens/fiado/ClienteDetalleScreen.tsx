import { useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { Button, Dialog, IconButton, Portal, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { MetodoPagoAbono, MovimientoFiado } from '@/domain/entities';
import { formatearSoles } from '@/domain/rules/dinero';
import {
  calcularSaldo,
  estadoDeCargos,
  ordenarCronologico,
  type EstadoCargo,
} from '@/domain/rules/fiado';
import { numeroWhatsapp } from '@/domain/rules/cobranza';
import { recordarPorWhatsapp } from '@/domain/usecases/cobranza';
import { liquidarCargo } from '@/domain/usecases/fiado';

import { Aparecer } from '../../components/Aparecer';
import { confirmar } from '../../components/Confirmar';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave } from '../../components/IconoSuave';
import { Tarjeta } from '../../components/Tarjeta';
import { useTema } from '../../hooks/useDerivados';
import { MULTIPLICADOR_MONTO, useDisposicion, useEstiloDialogo } from '../../hooks/useDisposicion';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { estaEnLinea, requiereConexion } from '../../stores/redStore';
import { useContenedor, usePuede } from '../../stores/sesionStore';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

const ETIQUETA_ESTADO: Record<EstadoCargo, string> = {
  pendiente: 'Pendiente',
  parcial: 'Pago parcial',
  cubierto: 'Cubierto',
  pagado: 'Pagado',
};

const formatoFecha = (f: Date | null) =>
  f
    ? f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
      ' ' +
      f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })
    : 'Ahora';

/**
 * Wireframe Detalle de cliente:
 *  [nombre · teléfono · [📞][WhatsApp][✏]]
 *  [Saldo S/ ... (debe / a favor / al día)]
 *  [Fiar]  [Registrar pago]
 *  [historial (más reciente primero): descripción · fecha · ± monto · estado · [Liquidar] [🗑]]
 */
export function ClienteDetalleScreen({ navigation, route }: PantallaRaiz<'ClienteDetalle'>) {
  const { clienteId } = route.params;
  const nombre = useDatos((s) => s.clientes.datos.find((c) => c.id === clienteId)?.nombre);
  const puedeEditar = usePuede('editarClientes');

  useLayoutEffect(() => {
    navigation.setOptions({
      title: nombre ?? 'Cliente',
      // D-33: el cajero crea clientes pero no los edita.
      headerRight: puedeEditar
        ? () => (
            <IconButton
              icon="pencil"
              onPress={() => navigation.navigate('ClienteForm', { clienteId })}
              accessibilityLabel="Editar cliente"
            />
          )
        : undefined,
    });
  }, [navigation, nombre, clienteId, puedeEditar]);

  return (
    <DetalleCliente
      clienteId={clienteId}
      onMovimiento={(tipo) => navigation.navigate('MovimientoForm', { clienteId, tipo })}
      onVolver={() => navigation.goBack()}
    />
  );
}

/**
 * Cuerpo del detalle de un cliente. Se usa como pantalla apilada (teléfono, tablet vertical)
 * y como panel derecho de Fiado/Cobranza en disposición expandida (D-30).
 */
export function DetalleCliente({
  clienteId,
  onMovimiento,
  onVolver,
  cabecera,
}: {
  clienteId: string;
  onMovimiento: (tipo: 'cargo' | 'abono') => void;
  /** Solo en pantalla apilada: acción del estado "cliente no encontrado". */
  onVolver?: () => void;
  /** Encabezado propio del panel (nombre + editar) cuando no hay barra de navegación. */
  cabecera?: ReactNode;
}) {
  const tema = useTema();
  const estiloDialogo = useEstiloDialogo();
  const puedeFiar = usePuede('fiarSinVenta');
  const puedeBorrar = usePuede('borrarMovimientos');
  // A 160 %+ "Fiar" y "Registrar pago" lado a lado se cortan en 360dp: se apilan.
  const { escalaFuente } = useDisposicion();
  const contenedor = useContenedor();
  const cliente = useDatos((s) => s.clientes.datos.find((c) => c.id === clienteId));
  const { datos: todos, cargando, error } = useDatos((s) => s.movimientos);
  const nombreNegocio = useDatos((s) => s.config.nombre);
  const [liquidando, setLiquidando] = useState<string | null>(null);

  const movimientos = useMemo(
    () => todos.filter((m) => m.clienteId === clienteId),
    [todos, clienteId],
  );
  const saldo = useMemo(() => calcularSaldo(movimientos), [movimientos]);
  const estados = useMemo(
    () => new Map(estadoDeCargos(movimientos).map((c) => [c.movimiento.id, c])),
    [movimientos],
  );
  const historial = useMemo(() => ordenarCronologico(movimientos).reverse(), [movimientos]);

  if (!cliente) {
    return (
      <EstadoVista
        tipo="error"
        titulo="No se encontró el cliente"
        accion={onVolver ? { etiqueta: 'Volver', onPress: onVolver } : undefined}
      />
    );
  }

  const wa = numeroWhatsapp(cliente.telefono);
  // Mensaje y enlace salen del dominio (rules/cobranza); se anota el recordatorio (D-27).
  const recordar = async () => {
    try {
      const enlace = await recordarPorWhatsapp(contenedor.recordatorios, {
        clienteId,
        nombreCliente: cliente.nombre,
        telefono: cliente.telefono,
        saldo,
        nombreNegocio,
      });
      if (enlace) await Linking.openURL(enlace);
    } catch {
      avisar('No se pudo abrir WhatsApp. Revisa que esté instalado.', 'error');
    }
  };

  const liquidar = async (metodo: MetodoPagoAbono) => {
    const cargoId = liquidando;
    setLiquidando(null);
    if (!cargoId) return;
    try {
      await liquidarCargo(contenedor.fiado, movimientos, cargoId, metodo);
      haptica.exito();
      avisar(
        estaEnLinea()
          ? 'Pago registrado'
          : 'Pago registrado en el teléfono. Se enviará al volver la señal.',
        'exito',
      );
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al registrar el pago'), 'error');
    }
  };

  const eliminar = async (m: MovimientoFiado) => {
    // Lo que aún está en el teléfono se borra sin red; lo confirmado necesita conexión.
    if (!m.pendiente && !requiereConexion()) return;
    const ok = await confirmar({
      titulo: 'Eliminar registro',
      mensaje: `¿Seguro que quieres eliminar "${m.descripcion}" (${formatearSoles(Math.abs(m.monto))})? El saldo se recalculará.`,
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await contenedor.fiado.eliminar(m.id);
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al eliminar'), 'error');
    }
  };

  const colorSaldo = saldo > 0 ? tema.extra.deuda : tema.extra.aFavor;

  const renderItem = ({ item }: { item: MovimientoFiado }) => {
    const esCargo = item.monto > 0;
    const estado = esCargo ? estados.get(item.id) : undefined;
    const apagado = estado?.estado === 'pagado' || estado?.estado === 'cubierto';
    return (
      <Tarjeta nivel={apagado ? 0 : 1} style={[estilos.mov, apagado && estilos.apagado]}>
        <IconoSuave
          nombre={esCargo ? 'arrow-top-right' : 'arrow-bottom-left'}
          tamano={36}
          color={esCargo ? tema.extra.deuda : tema.extra.aFavor}
          fondo={esCargo ? tema.extra.fondoDeuda : tema.colors.secondaryContainer}
        />
        <View style={estilos.flex}>
          <Text variant="bodyLarge" style={apagado ? estilos.tachado : undefined}>
            {item.descripcion || (esCargo ? 'Deuda' : 'Pago')}
          </Text>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {formatoFecha(item.fecha)}
            {esCargo ? '' : ` · ${item.metodoPago ?? 'Efectivo'}`}
            {item.ventaId ? ' · desde venta' : ''}
            {item.pendiente ? (
              <Text variant="bodySmall" style={{ color: tema.extra.advertencia }}>
                {' · Por enviar'}
              </Text>
            ) : null}
          </Text>
          {estado ? (
            <View
              style={[
                estilos.pildora,
                {
                  backgroundColor:
                    estado.pendiente > 0 ? tema.extra.fondoAdvertencia : tema.colors.surfaceVariant,
                },
              ]}
            >
              <Text
                variant="labelSmall"
                style={{
                  color:
                    estado.pendiente > 0 ? tema.extra.advertencia : tema.colors.onSurfaceVariant,
                }}
              >
                {ETIQUETA_ESTADO[estado.estado]}
                {estado.estado === 'parcial' ? ` · falta ${formatearSoles(estado.pendiente)}` : ''}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={estilos.derecha}>
          <Text
            variant="titleMedium"
            style={{ color: esCargo ? tema.extra.deuda : tema.extra.aFavor }}
          >
            {esCargo ? '+ ' : '- '}
            {formatearSoles(Math.abs(item.monto))}
          </Text>
          <View style={estilos.fila}>
            {estado && estado.pendiente > 0 ? (
              <Button
                compact
                mode="contained-tonal"
                onPress={() => setLiquidando(item.id)}
                testID={`liquidar-${item.descripcion}`}
              >
                Liquidar
              </Button>
            ) : null}
            {/* El cargo de una venta fiada pendiente se quita anulando la venta. */}
            {(item.pendiente && item.ventaId) || !puedeBorrar ? null : (
              <IconButton
                icon="trash-can-outline"
                size={20}
                // Ícono discreto pero área táctil de 48dp.
                style={estilos.iconoAccion}
                onPress={() => void eliminar(item)}
                accessibilityLabel={`Eliminar ${item.descripcion}`}
              />
            )}
          </View>
        </View>
      </Tarjeta>
    );
  };

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <FlatList
        data={historial}
        keyExtractor={(m) => m.id}
        renderItem={renderItem}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <Aparecer style={estilos.cabecera}>
            {cabecera}
            <Tarjeta nivel={2} style={estilos.saldo}>
              <View
                style={[
                  estilos.pildora,
                  {
                    alignSelf: 'center',
                    backgroundColor:
                      saldo > 0 ? tema.extra.fondoDeuda : tema.colors.secondaryContainer,
                  },
                ]}
              >
                <Text variant="labelMedium" style={{ color: colorSaldo }}>
                  {saldo > 0 ? 'Debe' : saldo < 0 ? 'Saldo a favor' : 'Al día'}
                </Text>
              </View>
              <Text
                variant="displaySmall"
                style={[NUMEROS, { color: colorSaldo }]}
                maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
                testID="saldo-cliente"
              >
                {formatearSoles(saldo)}
              </Text>
              {cliente.telefono ? (
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  {cliente.telefono}
                </Text>
              ) : null}
              <View style={[estilos.fila, estilos.envolver]}>
                {cliente.telefono ? (
                  <Button
                    icon="phone-outline"
                    mode="outlined"
                    compact
                    style={estilos.contacto}
                    contentStyle={estilos.tactil}
                    onPress={() => void Linking.openURL(`tel:${cliente.telefono}`)}
                  >
                    Llamar
                  </Button>
                ) : null}
                {wa && saldo > 0 ? (
                  <Button
                    icon="whatsapp"
                    mode="outlined"
                    compact
                    style={estilos.contacto}
                    contentStyle={estilos.tactil}
                    onPress={() => void recordar()}
                  >
                    Recordar
                  </Button>
                ) : null}
              </View>
            </Tarjeta>
            <View style={[estilos.fila, escalaFuente >= 1.6 && estilos.columna]}>
              {/* D-33: fiar sin venta es solo del dueño; el cajero fía cobrando como "Fiado". */}
              {puedeFiar ? (
                <Button
                  // Tonal, no relleno rojo: en M3 un botón rojo sólido se lee como "eliminar".
                  // La acción primaria de la pantalla es cobrar (Registrar pago).
                  mode="contained-tonal"
                  icon="plus"
                  buttonColor={tema.extra.fondoDeuda}
                  textColor={tema.extra.deuda}
                  style={escalaFuente >= 1.6 ? undefined : estilos.flex}
                  contentStyle={estilos.botonAlto}
                  onPress={() => onMovimiento('cargo')}
                  testID="boton-fiar"
                >
                  Fiar
                </Button>
              ) : null}
              <Button
                mode="contained"
                icon="cash-plus"
                style={escalaFuente >= 1.6 ? undefined : estilos.flex}
                contentStyle={estilos.botonAlto}
                onPress={() => onMovimiento('abono')}
                testID="boton-abonar"
              >
                Registrar pago
              </Button>
            </View>
            <Text
              variant="labelLarge"
              style={[estilos.seccion, { color: tema.colors.onSurfaceVariant }]}
            >
              Historial
            </Text>
          </Aparecer>
        }
        ListEmptyComponent={
          cargando ? (
            <EstadoVista tipo="cargando" />
          ) : error ? (
            <EstadoVista tipo="error" titulo="Error al cargar historial" mensaje={error} />
          ) : (
            <EstadoVista
              tipo="vacio"
              icono="notebook-outline"
              titulo="Sin movimientos"
              mensaje="Este cliente aún no tiene deudas ni pagos."
            />
          )
        }
      />
      <Portal>
        <Dialog
          visible={liquidando !== null}
          onDismiss={() => setLiquidando(null)}
          style={estiloDialogo}
        >
          <Dialog.Title>¿Cómo pagó?</Dialog.Title>
          <Dialog.Content>
            <Text>
              Se registrará un pago por{' '}
              {formatearSoles(liquidando ? (estados.get(liquidando)?.pendiente ?? 0) : 0)} para que
              aparezca en tus reportes.
            </Text>
          </Dialog.Content>
          {/* flexWrap: en 320dp o con letra grande los tres botones pasan a otra línea. */}
          <Dialog.Actions style={estilos.accionesDialogo}>
            <Button onPress={() => setLiquidando(null)}>Cancelar</Button>
            <Button onPress={() => void liquidar('Yape/Plin')}>Yape/Plin</Button>
            <Button
              mode="contained"
              onPress={() => void liquidar('Efectivo')}
              testID="liquidar-efectivo"
            >
              Efectivo
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  iconoAccion: { margin: 0, width: TACTIL_MIN, height: TACTIL_MIN },
  accionesDialogo: { flexWrap: 'wrap', justifyContent: 'flex-end', rowGap: espacio.xs },
  lista: {
    padding: espacio.md,
    gap: espacio.xs,
    paddingBottom: espacio.xl,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  cabecera: { gap: espacio.sm, marginBottom: espacio.xxs },
  saldo: { padding: espacio.lg, alignItems: 'center', gap: espacio.xs },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  envolver: { flexWrap: 'wrap', justifyContent: 'center' },
  columna: { flexDirection: 'column', alignItems: 'stretch' },
  tactil: { minHeight: TACTIL_MIN },
  contacto: { borderRadius: radio.completo, marginTop: espacio.xs },
  botonAlto: { minHeight: 52 },
  seccion: { marginTop: espacio.xs },
  mov: { flexDirection: 'row', padding: espacio.sm, gap: espacio.sm },
  apagado: { opacity: 0.6 },
  derecha: { alignItems: 'flex-end', justifyContent: 'space-between' },
  tachado: { textDecorationLine: 'line-through' },
  pildora: {
    alignSelf: 'flex-start',
    paddingHorizontal: espacio.xs,
    paddingVertical: 2,
    borderRadius: radio.completo,
    marginTop: espacio.xxs,
  },
});
