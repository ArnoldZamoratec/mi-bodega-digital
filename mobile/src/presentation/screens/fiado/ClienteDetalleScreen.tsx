import { useLayoutEffect, useMemo, useState } from 'react';
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
import { liquidarCargo } from '@/domain/usecases/fiado';

import { Aparecer } from '../../components/Aparecer';
import { confirmar } from '../../components/Confirmar';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave } from '../../components/IconoSuave';
import { Tarjeta } from '../../components/Tarjeta';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { estaEnLinea, requiereConexion } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';
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

/** Celular peruano (9 dígitos que empiezan en 9) → enlace de WhatsApp. */
const whatsapp = (telefono: string): string | null => {
  const digitos = telefono.replace(/\D/g, '');
  const local = digitos.startsWith('51') && digitos.length === 11 ? digitos.slice(2) : digitos;
  return /^9\d{8}$/.test(local) ? `51${local}` : null;
};

/**
 * Wireframe Detalle de cliente:
 *  [nombre · teléfono · [📞][WhatsApp][✏]]
 *  [Saldo S/ ... (debe / a favor / al día)]
 *  [Fiar]  [Registrar pago]
 *  [historial (más reciente primero): descripción · fecha · ± monto · estado · [Liquidar] [🗑]]
 */
export function ClienteDetalleScreen({ navigation, route }: PantallaRaiz<'ClienteDetalle'>) {
  const { clienteId } = route.params;
  const tema = useTema();
  const contenedor = useContenedor();
  const cliente = useDatos((s) => s.clientes.datos.find((c) => c.id === clienteId));
  const { datos: todos, cargando, error } = useDatos((s) => s.movimientos);
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

  useLayoutEffect(() => {
    navigation.setOptions({
      title: cliente?.nombre ?? 'Cliente',
      headerRight: () => (
        <IconButton
          icon="pencil"
          onPress={() => navigation.navigate('ClienteForm', { clienteId })}
          accessibilityLabel="Editar cliente"
        />
      ),
    });
  }, [navigation, cliente?.nombre, clienteId]);

  if (!cliente) {
    return (
      <EstadoVista
        tipo="error"
        titulo="No se encontró el cliente"
        accion={{ etiqueta: 'Volver', onPress: () => navigation.goBack() }}
      />
    );
  }

  const wa = whatsapp(cliente.telefono);
  const recordar = () => {
    if (!wa) return;
    const texto = `Hola ${cliente.nombre}, te saluda tu bodega. Tu saldo pendiente es ${formatearSoles(saldo)}. ¡Gracias!`;
    void Linking.openURL(`https://wa.me/${wa}?text=${encodeURIComponent(texto)}`);
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
            {item.pendiente && item.ventaId ? null : (
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
                testID="saldo-cliente"
              >
                {formatearSoles(saldo)}
              </Text>
              {cliente.telefono ? (
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  {cliente.telefono}
                </Text>
              ) : null}
              <View style={estilos.fila}>
                {cliente.telefono ? (
                  <Button
                    icon="phone-outline"
                    mode="outlined"
                    compact
                    style={estilos.contacto}
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
                    onPress={recordar}
                  >
                    Recordar
                  </Button>
                ) : null}
              </View>
            </Tarjeta>
            <View style={estilos.fila}>
              <Button
                // Tonal, no relleno rojo: en M3 un botón rojo sólido se lee como "eliminar".
                // La acción primaria de la pantalla es cobrar (Registrar pago).
                mode="contained-tonal"
                icon="plus"
                buttonColor={tema.extra.fondoDeuda}
                textColor={tema.extra.deuda}
                style={estilos.flex}
                contentStyle={estilos.botonAlto}
                onPress={() => navigation.navigate('MovimientoForm', { clienteId, tipo: 'cargo' })}
                testID="boton-fiar"
              >
                Fiar
              </Button>
              <Button
                mode="contained"
                icon="cash-plus"
                style={estilos.flex}
                contentStyle={estilos.botonAlto}
                onPress={() => navigation.navigate('MovimientoForm', { clienteId, tipo: 'abono' })}
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
        <Dialog visible={liquidando !== null} onDismiss={() => setLiquidando(null)}>
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
