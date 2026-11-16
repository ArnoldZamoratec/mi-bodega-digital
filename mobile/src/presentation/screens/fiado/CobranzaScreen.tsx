import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { memo, useMemo, useState } from 'react';
import { FlatList, Linking, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import { formatearSoles } from '@/domain/rules/dinero';
import {
  haceDias,
  listaCobranza,
  recuperadoEnMes,
  totalPorCobrar,
  type FilaCobranza,
} from '@/domain/rules/cobranza';
import { recordarPorWhatsapp } from '@/domain/usecases/cobranza';

import { DosPaneles } from '../../components/DosPaneles';
import { EstadoVista } from '../../components/EstadoVista';
import { Presionable } from '../../components/Presionable';
import { Tarjeta } from '../../components/Tarjeta';
import { iniciales } from '../../formato';
import { useTema } from '../../hooks/useDerivados';
import { MULTIPLICADOR_MONTO, useDisposicion } from '../../hooks/useDisposicion';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { useContenedor } from '../../stores/sesionStore';
import { colorAvatar } from '../../theme/tema';
import { espacio, NUMEROS, radio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';
import { DetalleCliente } from './ClienteDetalleScreen';

/**
 * Wireframe Cobranza (D-27):
 *  [Por cobrar S/ … · Recuperado este mes S/ …]
 *  [fila: avatar · nombre · "debe desde hace N días" · "último recordatorio …" · saldo]
 *  [   Recordar por WhatsApp   ]  (tono discreto si se recordó hace < 3 días; nunca bloquea)
 * Orden: primero quien debe desde hace más tiempo (cargo pendiente más antiguo, FIFO).
 * Expandida (D-30): la fila abre el detalle del cliente en el panel derecho.
 */
export function CobranzaScreen({ navigation }: PantallaRaiz<'Cobranza'>) {
  const tema = useTema();
  const contenedor = useContenedor();
  const clientes = useDatos((s) => s.clientes);
  const movimientos = useDatos((s) => s.movimientos);
  const nombreNegocio = useDatos((s) => s.config.nombre);

  // `ahora` se toma cuando cambian los datos: al anotar un recordatorio llega un snapshot
  // nuevo de clientes y la fila pasa a "recordado hoy".
  const { filas, recuperado } = useMemo(() => {
    const ahora = new Date();
    return {
      filas: listaCobranza(clientes.datos, movimientos.datos, ahora),
      recuperado: recuperadoEnMes(movimientos.datos, ahora),
    };
  }, [clientes.datos, movimientos.datos]);
  const porCobrar = useMemo(() => totalPorCobrar(filas), [filas]);
  const { dosPaneles, disposicion, escalaFuente } = useDisposicion();
  // Teléfono con letra grande: las dos métricas se apilan en vez de cortarse.
  const resumenApilado = disposicion === 'compacta' && escalaFuente >= 1.3;
  const [elegido, setElegido] = useState<string | null>(null);
  const seleccionada = dosPaneles
    ? (filas.find((f) => f.cliente.id === elegido) ?? filas[0])
    : undefined;

  const recordar = async (fila: FilaCobranza) => {
    try {
      const enlace = await recordarPorWhatsapp(contenedor.recordatorios, {
        clienteId: fila.cliente.id,
        nombreCliente: fila.cliente.nombre,
        telefono: fila.cliente.telefono,
        saldo: fila.saldo,
        nombreNegocio,
      });
      if (!enlace) return;
      haptica.toque();
      await Linking.openURL(enlace);
    } catch {
      avisar('No se pudo abrir WhatsApp. Revisa que esté instalado.', 'error');
    }
  };

  const cargando = clientes.cargando || movimientos.cargando;

  const lista = (
    <FlatList
      data={cargando ? [] : filas}
      keyExtractor={(f) => f.cliente.id}
      renderItem={({ item }) => (
        <FilaCobro
          fila={item}
          onRecordar={() => void recordar(item)}
          seleccionada={seleccionada?.cliente.id === item.cliente.id}
          onAbrir={() =>
            dosPaneles
              ? setElegido(item.cliente.id)
              : navigation.navigate('ClienteDetalle', { clienteId: item.cliente.id })
          }
        />
      )}
      contentContainerStyle={estilos.lista}
      initialNumToRender={12}
      windowSize={7}
      removeClippedSubviews
      testID="lista-cobranza"
      ListHeaderComponent={
        <Tarjeta nivel={2} style={[estilos.resumen, resumenApilado && estilos.resumenApilado]}>
          <View style={estilos.metrica}>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              Por cobrar
            </Text>
            <Text
              variant="headlineMedium"
              style={[NUMEROS, { color: porCobrar > 0 ? tema.extra.deuda : tema.colors.onSurface }]}
              maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
              testID="cobranza-por-cobrar"
            >
              {formatearSoles(porCobrar)}
            </Text>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              {filas.length === 1 ? '1 cliente' : `${filas.length} clientes`}
            </Text>
          </View>
          <View
            style={[
              resumenApilado ? estilos.separadorHorizontal : estilos.separador,
              { backgroundColor: tema.extra.borde },
            ]}
          />
          <View style={estilos.metrica}>
            <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
              Recuperado este mes
            </Text>
            <Text
              variant="headlineMedium"
              style={[NUMEROS, { color: tema.extra.aFavor }]}
              maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
              testID="cobranza-recuperado"
            >
              {formatearSoles(recuperado)}
            </Text>
            <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
              Pagos de fiado recibidos
            </Text>
          </View>
        </Tarjeta>
      }
      ListEmptyComponent={
        cargando ? (
          <EstadoVista tipo="cargando" />
        ) : (
          <EstadoVista
            tipo="vacio"
            icono="check-decagram-outline"
            titulo="Nadie te debe"
            mensaje="Cuando fíes a un cliente, aquí verás a quién cobrar primero."
          />
        )
      }
    />
  );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      {seleccionada && !cargando ? (
        <DosPaneles
          testID="cobranza-dos-paneles"
          lista={lista}
          detalle={
            <DetalleCliente
              key={seleccionada.cliente.id}
              clienteId={seleccionada.cliente.id}
              onMovimiento={(tipo) =>
                navigation.navigate('MovimientoForm', {
                  clienteId: seleccionada.cliente.id,
                  tipo,
                })
              }
              cabecera={
                <Text variant="titleLarge" numberOfLines={2} accessibilityRole="header">
                  {seleccionada.cliente.nombre}
                </Text>
              }
            />
          }
        />
      ) : (
        lista
      )}
    </View>
  );
}

const FilaCobro = memo(function FilaCobro({
  fila,
  seleccionada = false,
  onRecordar,
  onAbrir,
}: {
  fila: FilaCobranza;
  seleccionada?: boolean;
  onRecordar: () => void;
  onAbrir: () => void;
}) {
  const tema = useTema();
  const { cliente, saldo } = fila;
  const avatar = colorAvatar(cliente.nombre, tema.dark);
  const tenue = { color: tema.colors.onSurfaceVariant };
  const recordatorio =
    fila.diasDesdeRecordatorio === null
      ? 'Aún sin recordatorio'
      : `Último recordatorio ${haceDias(fila.diasDesdeRecordatorio)}`;

  return (
    <Tarjeta
      style={[
        estilos.fila,
        seleccionada && {
          borderColor: tema.colors.primary,
          backgroundColor: tema.colors.secondaryContainer,
        },
      ]}
    >
      <Presionable
        onPress={onAbrir}
        style={estilos.cabeceraFila}
        accessibilityRole="button"
        accessibilityState={{ selected: seleccionada }}
        accessibilityLabel={`${cliente.nombre}, debe ${formatearSoles(saldo)}. Ver detalle`}
        testID={`cobro-${cliente.nombre}`}
      >
        <View style={[estilos.avatar, { backgroundColor: avatar.fondo }]}>
          <Text variant="titleSmall" style={{ color: avatar.texto }}>
            {iniciales(cliente.nombre)}
          </Text>
        </View>
        <View style={estilos.flex}>
          <Text variant="titleMedium" numberOfLines={1}>
            {cliente.nombre}
          </Text>
          <Text variant="bodySmall" style={tenue} testID={`antiguedad-${cliente.nombre}`}>
            {fila.diasPendiente === 0
              ? 'Fiado de hoy'
              : `Debe desde ${haceDias(fila.diasPendiente)}`}
          </Text>
          <Text variant="bodySmall" style={tenue} testID={`recordatorio-${cliente.nombre}`}>
            {recordatorio}
          </Text>
        </View>
        <Text variant="titleMedium" style={[NUMEROS, { color: tema.extra.deuda }]}>
          {formatearSoles(saldo)}
        </Text>
      </Presionable>
      {fila.whatsapp ? (
        fila.recordadoHacePoco ? (
          // Recordado hace poco: se puede volver a enviar, pero la app no lo empuja.
          <Button
            mode="text"
            icon="check"
            compact
            textColor={tema.colors.onSurfaceVariant}
            contentStyle={estilos.botonAlto}
            onPress={onRecordar}
            accessibilityHint="Ya le recordaste hace poco. Toca si igual quieres volver a escribirle."
            testID={`recordar-${cliente.nombre}`}
          >
            {`Recordado ${haceDias(fila.diasDesdeRecordatorio ?? 0)} · volver a escribir`}
          </Button>
        ) : (
          <Button
            mode="contained-tonal"
            icon="whatsapp"
            onPress={onRecordar}
            contentStyle={estilos.botonAlto}
            testID={`recordar-${cliente.nombre}`}
          >
            Recordar por WhatsApp
          </Button>
        )
      ) : (
        <View style={estilos.sinCelular}>
          <MaterialCommunityIcons name="phone-off-outline" size={14} color={tenue.color} />
          <Text variant="bodySmall" style={tenue}>
            Sin celular registrado
          </Text>
        </View>
      )}
    </Tarjeta>
  );
});

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  lista: {
    padding: espacio.md,
    gap: espacio.sm,
    paddingBottom: espacio.xl,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  resumen: { flexDirection: 'row', padding: espacio.md, gap: espacio.md, marginBottom: espacio.xs },
  metrica: { flex: 1, gap: 2 },
  resumenApilado: { flexDirection: 'column' },
  separador: { width: StyleSheet.hairlineWidth * 2 },
  separadorHorizontal: { height: StyleSheet.hairlineWidth * 2 },
  fila: { padding: espacio.sm, gap: espacio.xs },
  cabeceraFila: { flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 48 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonAlto: { minHeight: 48 },
  sinCelular: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.xxs,
    paddingVertical: espacio.xs,
    justifyContent: 'center',
  },
});
