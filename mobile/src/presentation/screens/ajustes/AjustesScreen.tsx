import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { List, Switch, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { ConfigNegocio } from '@/domain/entities';

import { confirmar } from '../../components/Confirmar';
import { EncabezadoHero, sobreHero } from '../../components/EncabezadoHero';
import { IconoSuave, type NombreIcono } from '../../components/IconoSuave';
import { Presionable } from '../../components/Presionable';
import { Tarjeta } from '../../components/Tarjeta';
import { iniciales } from '../../formato';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaTab } from '../../navigation/tipos';
import { prepararNotificaciones } from '../../services/notificaciones';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { requiereConexion } from '../../stores/redStore';
import { useSesion } from '../../stores/sesionStore';
import { useTemaStore, type PreferenciaTema } from '../../stores/temaStore';
import { NOMBRE_MARCA } from '../../theme/tema';
import { useServicios } from '../../servicios';
import { espacio, radio } from '../../theme/tokens';

const HORAS = [7, 8, 9, 10, 12, 18, 20];

export function AjustesScreen({ navigation }: PantallaTab<'Ajustes'>) {
  const tema = useTema();
  const { auth } = useServicios();
  const usuario = useSesion((s) => s.usuario);
  const contenedor = useSesion((s) => s.contenedor);
  const config = useDatos((s) => s.config);
  const pendientes = useDatos((s) => s.pendientes);
  const preferencia = useTemaStore((s) => s.preferencia);
  const fijarTema = useTemaStore((s) => s.fijar);

  const guardar = async (cambios: Partial<ConfigNegocio>) => {
    if (!contenedor || !requiereConexion()) return;
    try {
      await contenedor.config.guardar({ ...config, ...cambios });
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo guardar'), 'error');
    }
  };

  const alternarNotificaciones = async (campo: 'stock' | 'fiado', activo: boolean) => {
    if (activo && !(await prepararNotificaciones(true))) {
      avisar('Activa las notificaciones de Bodegón Digital en los ajustes del teléfono.', 'error');
      return;
    }
    await guardar(
      campo === 'stock'
        ? { alertasStockBajo: activo }
        : { horaRecordatorioFiado: activo ? 9 : null },
    );
  };

  const siguienteHora = () => {
    const actual = config.horaRecordatorioFiado ?? 9;
    const i = HORAS.indexOf(actual);
    return HORAS[(i + 1) % HORAS.length] ?? 9;
  };

  const salir = async () => {
    const mensaje =
      pendientes.length > 0
        ? `Tienes ${pendientes.length} venta(s) sin sincronizar. Se conservarán en este teléfono y se enviarán cuando vuelvas a ingresar con esta cuenta.`
        : '¿Seguro que quieres cerrar sesión?';
    if (
      !(await confirmar({
        titulo: 'Cerrar sesión',
        mensaje,
        confirmar: 'Salir',
        destructivo: true,
      }))
    )
      return;
    try {
      await auth.salir();
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al cerrar sesión'), 'error');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: tema.colors.background }}
      contentContainerStyle={estilos.scroll}
    >
      <EncabezadoHero antetitulo="Tu cuenta" titulo="Ajustes">
        <View style={estilos.perfil}>
          <View style={estilos.avatar}>
            <Text variant="titleLarge" style={{ color: tema.colors.primary }}>
              {iniciales(config.nombre)}
            </Text>
          </View>
          <View style={estilos.flex}>
            <Text variant="titleLarge" style={{ color: sobreHero.texto }} numberOfLines={1}>
              {config.nombre}
            </Text>
            <Text variant="bodyMedium" style={{ color: sobreHero.tenue }} numberOfLines={1}>
              {usuario?.email ?? ''}
            </Text>
          </View>
        </View>
      </EncabezadoHero>

      <View style={estilos.contenido}>
        <Grupo titulo="Negocio">
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title="Datos del negocio"
            description={
              [config.ruc && `RUC ${config.ruc}`, config.direccion].filter(Boolean).join(' · ') ||
              'Toca para completar los datos'
            }
            left={() => <IconoFila nombre="storefront-outline" />}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => navigation.navigate('DatosNegocio')}
            testID="ajustes-negocio"
          />
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title="Ventas pendientes de sincronizar"
            description={
              pendientes.length === 0
                ? 'Todo sincronizado'
                : `${pendientes.length} venta(s) en el teléfono`
            }
            left={() => (
              <IconoFila
                nombre={pendientes.length ? 'cloud-upload-outline' : 'cloud-check-outline'}
                tono={pendientes.length ? 'advertencia' : 'marca'}
              />
            )}
            right={(p) => <List.Icon {...p} icon="chevron-right" />}
            onPress={() => navigation.navigate('VentasPendientes')}
          />
        </Grupo>

        <View style={estilos.grupo}>
          <Text
            variant="labelMedium"
            style={[estilos.titulo, { color: tema.colors.onSurfaceVariant }]}
            accessibilityRole="header"
          >
            APARIENCIA
          </Text>
          <View style={estilos.temas} accessibilityRole="radiogroup">
            {OPCIONES_TEMA.map((o) => {
              const activo = preferencia === o.valor;
              return (
                <Presionable
                  key={o.valor}
                  onPress={() => fijarTema(o.valor)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={o.etiqueta}
                  testID={`tema-${o.valor}`}
                  contenedorStyle={estilos.flex}
                  style={[
                    estilos.opcionTema,
                    {
                      backgroundColor: activo
                        ? tema.colors.secondaryContainer
                        : tema.colors.surface,
                      borderColor: activo ? tema.colors.primary : tema.extra.borde,
                      borderWidth: activo ? 2 : StyleSheet.hairlineWidth * 2,
                      boxShadow: tema.extra.sombra[1],
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={o.icono}
                    size={24}
                    color={activo ? tema.colors.primary : tema.colors.onSurfaceVariant}
                  />
                  <Text
                    variant="labelLarge"
                    // "Automático" no entra entero en un tercio de 320dp con letra grande.
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                    style={{
                      color: activo ? tema.colors.onSecondaryContainer : tema.colors.onSurface,
                    }}
                  >
                    {o.etiqueta}
                  </Text>
                </Presionable>
              );
            })}
          </View>
        </View>

        <Grupo titulo="Notificaciones">
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title="Avisar stock bajo"
            description="Cuando un producto llega a 5 unidades o menos"
            left={() => <IconoFila nombre="package-down" tono="advertencia" />}
            right={() => (
              <Switch
                value={config.alertasStockBajo}
                onValueChange={(v) => void alternarNotificaciones('stock', v)}
              />
            )}
          />
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title="Recordatorio de fiados vencidos"
            description={
              config.horaRecordatorioFiado === null
                ? 'Desactivado'
                : `Diario a las ${config.horaRecordatorioFiado}:00 · deudas de más de ${config.diasVencimientoFiado} días`
            }
            left={() => <IconoFila nombre="bell-ring-outline" />}
            right={() => (
              <Switch
                value={config.horaRecordatorioFiado !== null}
                onValueChange={(v) => void alternarNotificaciones('fiado', v)}
              />
            )}
            onPress={
              config.horaRecordatorioFiado === null
                ? undefined
                : () => void guardar({ horaRecordatorioFiado: siguienteHora() })
            }
          />
        </Grupo>

        <Grupo titulo="Cuenta">
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title={usuario?.email ?? ''}
            description="Dueño"
            left={() => <IconoFila nombre="account-outline" />}
          />
          <List.Item
            titleNumberOfLines={3}
            descriptionNumberOfLines={3}
            title="Cerrar sesión"
            titleStyle={{ color: tema.colors.error }}
            left={() => <IconoFila nombre="logout" tono="peligro" />}
            onPress={() => void salir()}
            testID="boton-salir"
          />
        </Grupo>

        <View style={estilos.pie}>
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            {NOMBRE_MARCA} · v{Constants.expoConfig?.version ?? '1.0.0'}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const OPCIONES_TEMA: {
  valor: PreferenciaTema;
  etiqueta: string;
  icono: NombreIcono;
}[] = [
  { valor: 'sistema', etiqueta: 'Automático', icono: 'theme-light-dark' },
  { valor: 'claro', etiqueta: 'Claro', icono: 'white-balance-sunny' },
  { valor: 'oscuro', etiqueta: 'Oscuro', icono: 'weather-night' },
];

/** Icono de fila de ajustes en un cuadrado tintado. */
function IconoFila({
  nombre,
  tono = 'marca',
}: {
  nombre: NombreIcono;
  tono?: 'marca' | 'advertencia' | 'peligro';
}) {
  const tema = useTema();
  const colores = {
    marca: { color: tema.colors.primary, fondo: tema.colors.secondaryContainer },
    advertencia: { color: tema.extra.advertencia, fondo: tema.extra.fondoAdvertencia },
    peligro: { color: tema.extra.deuda, fondo: tema.extra.fondoDeuda },
  }[tono];
  return (
    <View style={estilos.iconoFila}>
      <IconoSuave nombre={nombre} tamano={36} color={colores.color} fondo={colores.fondo} />
    </View>
  );
}

/** Sección agrupada: título en versalitas fuera de la tarjeta, filas dentro. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const tema = useTema();
  return (
    <View style={estilos.grupo}>
      <Text
        variant="labelMedium"
        style={[estilos.titulo, { color: tema.colors.onSurfaceVariant }]}
        accessibilityRole="header"
      >
        {titulo.toUpperCase()}
      </Text>
      <Tarjeta style={estilos.tarjeta}>{children}</Tarjeta>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  scroll: { paddingBottom: espacio.xl },
  contenido: { padding: espacio.md, gap: espacio.lg },
  perfil: { flexDirection: 'row', alignItems: 'center', gap: espacio.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radio.lg,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  temas: { flexDirection: 'row', gap: espacio.xs },
  opcionTema: {
    flex: 1,
    alignItems: 'center',
    gap: espacio.xs,
    paddingVertical: espacio.md,
    borderRadius: radio.lg,
  },
  iconoFila: { marginLeft: espacio.md, justifyContent: 'center' },
  grupo: { gap: espacio.xs },
  titulo: { letterSpacing: 0.6, paddingHorizontal: espacio.xxs },
  tarjeta: { overflow: 'hidden', paddingVertical: espacio.xxs },
  pie: { alignItems: 'center', padding: espacio.md },
});
