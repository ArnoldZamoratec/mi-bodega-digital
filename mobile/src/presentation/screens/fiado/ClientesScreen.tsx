import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { memo, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { FAB, IconButton, Text } from 'react-native-paper';

import type { Cliente } from '@/domain/entities';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';
import { normalizarTexto } from '@/domain/rules/productos';

import { EntradaLista } from '../../components/Aparecer';
import { BannerConexion } from '../../components/BannerConexion';
import { Buscador } from '../../components/Buscador';
import { ChipHero, EncabezadoHero, FiltrosHero, sobreHero } from '../../components/EncabezadoHero';
import { DosPaneles } from '../../components/DosPaneles';
import { EstadoVista } from '../../components/EstadoVista';
import { Presionable } from '../../components/Presionable';
import { iniciales } from '../../formato';
import { useSaldos, useTema } from '../../hooks/useDerivados';
import { MULTIPLICADOR_MONTO, useDisposicion } from '../../hooks/useDisposicion';
import type { PantallaTab } from '../../navigation/tipos';
import { useDatos } from '../../stores/datosStore';
import { colorAvatar } from '../../theme/tema';
import { BRILLO_INTERIOR, espacio, NUMEROS, radio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';
import { DetalleCliente } from './ClienteDetalleScreen';

/**
 * Wireframe Fiado:
 *  [Total por cobrar S/ ...]
 *  [🔍 buscar] [chip: Con deuda]
 *  [fila: avatar · nombre · teléfono · saldo (rojo debe / verde a favor)]
 *  [FAB + Cliente]
 * Expandida (D-30): lista a la izquierda y detalle del cliente elegido a la derecha.
 */
export function ClientesScreen({ navigation }: PantallaTab<'Fiado'>) {
  const tema = useTema();
  const clientes = useDatos((s) => s.clientes);
  const movimientosCargando = useDatos((s) => s.movimientos.cargando);
  const saldos = useSaldos();
  const [busqueda, setBusqueda] = useState('');
  const [soloDeuda, setSoloDeuda] = useState(false);
  const { dosPaneles } = useDisposicion();
  const [elegido, setElegido] = useState<string | null>(null);

  const porCobrar = useMemo(() => sumarSoles([...saldos.values()].filter((s) => s > 0)), [saldos]);
  const conDeuda = useMemo(() => [...saldos.values()].filter((s) => s > 0).length, [saldos]);
  const visibles = useMemo(() => {
    const t = normalizarTexto(busqueda);
    return clientes.datos.filter(
      (c) =>
        (!t || normalizarTexto(c.nombre).includes(t) || c.telefono.includes(t)) &&
        (!soloDeuda || (saldos.get(c.id) ?? 0) > 0),
    );
  }, [clientes.datos, busqueda, soloDeuda, saldos]);
  // En dos paneles siempre hay alguien a la vista: el elegido o el primero de la lista.
  const seleccionado =
    dosPaneles && visibles.length > 0
      ? (visibles.find((c) => c.id === elegido) ?? visibles[0])
      : undefined;

  let contenido;
  if (clientes.cargando) contenido = <EstadoVista tipo="cargando" esqueleto />;
  else if (clientes.error && clientes.datos.length === 0)
    contenido = (
      <EstadoVista
        tipo="error"
        titulo="Error al cargar clientes"
        mensaje={clientes.error}
        accion={{ etiqueta: 'Reintentar', onPress: () => useDatos.getState().reintentar() }}
      />
    );
  else if (clientes.datos.length === 0)
    contenido = (
      <EstadoVista
        tipo="vacio"
        icono="account-group-outline"
        titulo="No hay clientes registrados"
        mensaje="Anota a quién le fías y cuánto te debe. Bodegón te recuerda cobrar."
        accion={{
          etiqueta: 'Registrar mi primer cliente',
          onPress: () => navigation.navigate('ClienteForm'),
        }}
      />
    );
  else
    contenido = (
      <FlatList
        data={visibles}
        keyExtractor={(c) => c.id}
        renderItem={({ item, index }) => (
          <EntradaLista indice={index}>
            <FilaCliente
              cliente={item}
              saldo={saldos.get(item.id) ?? 0}
              calculando={movimientosCargando}
              seleccionado={seleccionado?.id === item.id}
              onPress={() =>
                dosPaneles
                  ? setElegido(item.id)
                  : navigation.navigate('ClienteDetalle', { clienteId: item.id })
              }
            />
          </EntradaLista>
        )}
        contentContainerStyle={estilos.lista}
        initialNumToRender={15}
        ListEmptyComponent={<EstadoVista tipo="vacio" icono="magnify" titulo="Sin resultados" />}
        testID="lista-clientes"
      />
    );

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <EncabezadoHero antetitulo="Cuaderno de fiados" titulo="Fiado">
        <View style={estilos.total}>
          <Text variant="labelLarge" style={{ color: sobreHero.tenue }}>
            Total por cobrar
          </Text>
          <Text
            variant="displaySmall"
            style={[NUMEROS, { color: sobreHero.texto }]}
            maxFontSizeMultiplier={MULTIPLICADOR_MONTO}
            testID="total-por-cobrar"
          >
            {formatearSoles(porCobrar)}
          </Text>
          <Text variant="bodyMedium" style={{ color: sobreHero.tenue }}>
            {conDeuda === 0
              ? 'Nadie te debe. ¡Todo al día!'
              : `${conDeuda} ${conDeuda === 1 ? 'cliente te debe' : 'clientes te deben'} · ${clientes.datos.length} en total`}
          </Text>
        </View>
        <Buscador
          placeholder="Buscar cliente o teléfono"
          value={busqueda}
          onChangeText={setBusqueda}
          testID="buscar-cliente"
          accessibilityLabel="Buscar cliente"
        />
        <FiltrosHero>
          <ChipHero
            etiqueta="Todos"
            activo={!soloDeuda}
            onPress={() => setSoloDeuda(false)}
            icono="account-group-outline"
          />
          <ChipHero
            etiqueta={`Con deuda · ${conDeuda}`}
            activo={soloDeuda}
            onPress={() => setSoloDeuda(!soloDeuda)}
            icono="alert-circle-outline"
          />
          {/* D-27: a quién cobrar primero, con recordatorio por WhatsApp. */}
          <ChipHero
            etiqueta="Cobranza"
            activo={false}
            onPress={() => navigation.navigate('Cobranza')}
            icono="cash-clock"
            testID="ir-cobranza"
            accessibilityLabel="Abrir cobranza: clientes por cobrar y recordatorios"
          />
        </FiltrosHero>
      </EncabezadoHero>
      <BannerConexion onPress={() => navigation.navigate('VentasPendientes')} />
      {dosPaneles && visibles.length > 0 && seleccionado ? (
        <DosPaneles
          testID="fiado-dos-paneles"
          lista={contenido}
          detalle={
            <DetalleCliente
              key={seleccionado.id}
              clienteId={seleccionado.id}
              onMovimiento={(tipo) =>
                navigation.navigate('MovimientoForm', { clienteId: seleccionado.id, tipo })
              }
              cabecera={
                <View style={estilos.cabeceraPanel}>
                  <Text variant="titleLarge" style={estilos.flex} numberOfLines={2}>
                    {seleccionado.nombre}
                  </Text>
                  <IconButton
                    icon="pencil"
                    onPress={() =>
                      navigation.navigate('ClienteForm', { clienteId: seleccionado.id })
                    }
                    accessibilityLabel="Editar cliente"
                  />
                </View>
              }
            />
          }
        />
      ) : (
        contenido
      )}
      <FAB
        icon="account-plus"
        label="Cliente"
        color={tema.colors.onPrimary}
        style={[
          estilos.fab,
          {
            backgroundColor: tema.colors.primary,
            boxShadow: `${BRILLO_INTERIOR}, ${tema.extra.sombra[3]}`,
          },
        ]}
        onPress={() => navigation.navigate('ClienteForm')}
        testID="fab-nuevo-cliente"
      />
    </View>
  );
}

const FilaCliente = memo(function FilaCliente({
  cliente,
  saldo,
  calculando,
  seleccionado = false,
  onPress,
}: {
  cliente: Cliente;
  saldo: number;
  calculando: boolean;
  /** Fila abierta en el panel de detalle (solo dos paneles). */
  seleccionado?: boolean;
  onPress: () => void;
}) {
  const tema = useTema();
  const color =
    saldo > 0 ? tema.extra.deuda : saldo < 0 ? tema.extra.aFavor : tema.colors.onSurfaceVariant;
  const avatar = colorAvatar(cliente.nombre, tema.dark);
  const etiqueta = saldo > 0 ? 'Debe' : saldo < 0 ? 'A favor' : 'Al día';
  const fondoEtiqueta =
    saldo > 0
      ? tema.extra.fondoDeuda
      : saldo < 0
        ? tema.colors.secondaryContainer
        : tema.colors.surfaceVariant;

  return (
    <Presionable
      onPress={onPress}
      style={[
        estilos.fila,
        {
          backgroundColor: seleccionado ? tema.colors.secondaryContainer : tema.colors.surface,
          borderColor: seleccionado ? tema.colors.primary : tema.extra.borde,
          boxShadow: tema.extra.sombra[1],
        },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: seleccionado }}
      accessibilityLabel={`${cliente.nombre}, ${etiqueta.toLowerCase()} ${formatearSoles(saldo)}`}
      testID={`cliente-${cliente.nombre}`}
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
        <View style={estilos.meta}>
          <MaterialCommunityIcons
            name={cliente.telefono ? 'phone-outline' : 'phone-off-outline'}
            size={13}
            color={tema.colors.onSurfaceVariant}
          />
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {cliente.telefono || 'Sin teléfono'}
          </Text>
        </View>
      </View>
      <View style={estilos.saldo}>
        <Text variant="titleMedium" style={[NUMEROS, { color }]}>
          {calculando ? '…' : formatearSoles(saldo)}
        </Text>
        {calculando ? null : (
          <View style={[estilos.pildora, { backgroundColor: fondoEtiqueta }]}>
            <Text variant="labelSmall" style={{ color }}>
              {etiqueta}
            </Text>
          </View>
        )}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={tema.colors.outline} />
    </Presionable>
  );
});

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  total: { gap: 2 },
  chips: { flexDirection: 'row', gap: espacio.xs },
  lista: {
    padding: espacio.md,
    gap: espacio.xs,
    paddingBottom: 96,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lista,
    alignSelf: 'center',
  },
  meta: { flexDirection: 'row', alignItems: 'center', gap: espacio.xxs, marginTop: 2 },
  pildora: {
    paddingHorizontal: espacio.xs,
    paddingVertical: 2,
    borderRadius: radio.completo,
    marginTop: 2,
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
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radio.completo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saldo: { alignItems: 'flex-end' },
  cabeceraPanel: { flexDirection: 'row', alignItems: 'center', gap: espacio.xs },
  fab: { position: 'absolute', right: espacio.md, bottom: espacio.md, borderRadius: radio.lg },
});
