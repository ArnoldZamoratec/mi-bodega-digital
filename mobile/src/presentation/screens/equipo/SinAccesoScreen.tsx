import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensajeDeError } from '@/data/firebase/errores';
import { sesionDueno } from '@/domain/rules/roles';

import { aplicarSesion, revalidarSesion, useIntencionUnirse } from '../../app/controlSesion';
import { confirmar } from '../../components/Confirmar';
import { IconoSuave } from '../../components/IconoSuave';
import { Tarjeta } from '../../components/Tarjeta';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { useServicios } from '../../servicios';
import { avisar } from '../../stores/avisosStore';
import { useRed } from '../../stores/redStore';
import { useSesion } from '../../stores/sesionStore';
import { espacio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

const SIN_RED = 'Necesitas internet para esto. Conéctate y vuelve a intentarlo.';

/**
 * D-33: cajero desactivado o quitado. No puede leer ni escribir en esa bodega (las reglas lo
 * cortan al instante). Opciones: volver a revisar (si el dueño lo reactivó), usar su propia
 * bodega, entrar con otro código o cerrar sesión. Dejar la bodega borra `cuentas/{uid}`, lo
 * que las reglas solo permiten cuando ya no es cajero activo.
 */
export function SinAccesoScreen(_props: PantallaRaiz<'SinAcceso'>) {
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const { auth, equipo } = useServicios();
  const usuario = useSesion((s) => s.usuario);
  const sinAcceso = useSesion((s) => s.sinAcceso);
  const enLinea = useRed((s) => s.enLinea);
  const [ocupado, setOcupado] = useState<null | 'revisar' | 'dejar' | 'codigo'>(null);

  const pausado = sinAcceso?.motivo === 'desactivado';

  const revisar = async () => {
    if (!enLinea) return avisar(SIN_RED, 'error');
    setOcupado('revisar');
    try {
      await revalidarSesion();
      if (useSesion.getState().estado === 'sin-acceso') {
        avisar(pausado ? 'Tu acceso sigue pausado.' : 'Sigues fuera de esa bodega.', 'info');
      }
    } finally {
      setOcupado(null);
    }
  };

  /** Borra `cuentas/{uid}`: la cuenta vuelve a ser dueña de su propia bodega. */
  const dejarBodega = async (): Promise<boolean> => {
    if (!usuario || !equipo) return false;
    if (!enLinea) {
      avisar(SIN_RED, 'error');
      return false;
    }
    try {
      await equipo.borrarCuenta(usuario.uid);
      return true;
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo salir de esa bodega'), 'error');
      return false;
    }
  };

  const usarMiBodega = async () => {
    if (!usuario) return;
    const ok = await confirmar({
      titulo: 'Usar mi propia bodega',
      mensaje:
        'Dejas de ser cajero de esa bodega y esta cuenta vuelve a tu propia bodega. Para volver a vender allá necesitarás un código nuevo.',
      confirmar: 'Usar mi bodega',
    });
    if (!ok) return;
    setOcupado('dejar');
    try {
      if (await dejarBodega()) {
        await aplicarSesion({ tipo: 'activa', sesion: sesionDueno(usuario.uid, '') });
      }
    } finally {
      setOcupado(null);
    }
  };

  const otroCodigo = async () => {
    setOcupado('codigo');
    try {
      if ((await dejarBodega()) && usuario) {
        // Vuelve a su propia bodega y, ya dentro, se abre la pantalla del código.
        useIntencionUnirse.getState().fijar(true);
        await aplicarSesion({ tipo: 'activa', sesion: sesionDueno(usuario.uid, '') });
      }
    } finally {
      setOcupado(null);
    }
  };

  const salir = async () => {
    try {
      await auth.salir();
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al cerrar sesión'), 'error');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: tema.colors.background }}
      contentContainerStyle={[
        estilos.contenido,
        { paddingTop: insets.top + espacio.xl, paddingBottom: insets.bottom + espacio.xl },
      ]}
      testID="pantalla-sin-acceso"
    >
      <Tarjeta nivel={2} style={estilos.tarjeta}>
        <IconoSuave
          nombre={pausado ? 'account-clock-outline' : 'account-remove-outline'}
          tamano={56}
          color={tema.extra.advertencia}
          fondo={tema.extra.fondoAdvertencia}
        />
        <Text variant="headlineSmall" accessibilityRole="header" style={estilos.centro}>
          {pausado ? 'Tu acceso está pausado' : 'Ya no eres parte de esa bodega'}
        </Text>
        <Text
          variant="bodyLarge"
          style={[estilos.centro, { color: tema.colors.onSurfaceVariant }]}
          testID="sin-acceso-mensaje"
        >
          {pausado
            ? 'El dueño pausó tu acceso, así que por ahora no puedes vender ni ver datos de la bodega. Pídele que te active desde Ajustes → Equipo y luego toca “Revisar de nuevo”.'
            : 'El dueño te quitó del equipo. Si fue un error, pídele una invitación nueva.'}
        </Text>
        {usuario?.email ? (
          <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
            Cuenta: {usuario.email}
          </Text>
        ) : null}
        {!enLinea ? (
          <Text variant="bodySmall" style={{ color: tema.extra.advertencia }}>
            Estás sin internet. Conéctate para revisar tu acceso.
          </Text>
        ) : null}
      </Tarjeta>

      <View style={estilos.botones}>
        <Button
          mode="contained"
          icon="refresh"
          onPress={() => void revisar()}
          loading={ocupado === 'revisar'}
          disabled={ocupado !== null}
          contentStyle={estilos.boton}
          testID="sin-acceso-revisar"
        >
          Revisar de nuevo
        </Button>
        <Button
          mode="outlined"
          icon="ticket-confirmation-outline"
          onPress={() => void otroCodigo()}
          loading={ocupado === 'codigo'}
          disabled={ocupado !== null || !equipo}
          contentStyle={estilos.boton}
          testID="sin-acceso-codigo"
        >
          Tengo otro código
        </Button>
        <Button
          mode="outlined"
          icon="storefront-outline"
          onPress={() => void usarMiBodega()}
          loading={ocupado === 'dejar'}
          disabled={ocupado !== null || !equipo}
          contentStyle={estilos.boton}
          testID="sin-acceso-mi-bodega"
        >
          Usar mi propia bodega
        </Button>
        <Button
          icon="logout"
          textColor={tema.colors.error}
          onPress={() => void salir()}
          disabled={ocupado !== null}
          contentStyle={estilos.boton}
          testID="sin-acceso-salir"
        >
          Cerrar sesión
        </Button>
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenido: {
    paddingHorizontal: espacio.md,
    gap: espacio.lg,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lectura,
    alignSelf: 'center',
  },
  tarjeta: { padding: espacio.lg, gap: espacio.md, alignItems: 'center' },
  centro: { textAlign: 'center' },
  botones: { gap: espacio.sm },
  boton: { minHeight: 52 },
});
