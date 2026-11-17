import { useEffect, useMemo, useState } from 'react';
import { Linking, ScrollView, Share, StyleSheet, View } from 'react-native';
import { Button, Switch, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { Venta } from '@/domain/entities';
import { ErrorDominio } from '@/domain/errors';
import { ventasVigentes } from '@/domain/rules/anulacion';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';
import { rangoPredefinido } from '@/domain/rules/reportes';
import {
  cuposCajeros,
  formatearCodigo,
  leerAutoria,
  MAX_CAJEROS_ACTIVOS,
  mensajeInvitacion,
  type Invitacion,
  type Miembro,
} from '@/domain/rules/roles';
import { cambiarActivoCajero, invitarCajero, quitarCajero } from '@/domain/usecases/equipo';

import { confirmar } from '../../components/Confirmar';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave } from '../../components/IconoSuave';
import { Tarjeta } from '../../components/Tarjeta';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { useServicios } from '../../servicios';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { requiereConexion, useRed } from '../../stores/redStore';
import { useContenedor, usePuede, useSesionRol } from '../../stores/sesionStore';
import { espacio, NUMEROS, radio, TACTIL_MIN } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';
import { rngSeguro, textoVencimiento } from './codigo';

/** Abre WhatsApp con el mensaje listo; si no está instalado, el menú de compartir. */
async function enviarPorWhatsapp(mensaje: string) {
  const url = `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
  try {
    await Linking.openURL(url);
  } catch {
    await Share.share({ message: mensaje }).catch(() => undefined);
  }
}

/** Ventas de hoy por uid de quien vendió (solo las que tienen autoría, D-33). */
function vendidoHoyPorPersona(ventas: readonly Venta[]): Map<string, number> {
  const porUid = new Map<string, number[]>();
  for (const v of ventasVigentes(ventas)) {
    const autor = leerAutoria('venta', v as unknown as Record<string, unknown>);
    if (!autor) continue;
    porUid.set(autor.uid, [...(porUid.get(autor.uid) ?? []), v.total]);
  }
  return new Map([...porUid].map(([uid, totales]) => [uid, sumarSoles(totales)]));
}

/**
 * D-33 · Ajustes → Equipo (solo el dueño). Invitar cajero (código + WhatsApp), invitaciones
 * pendientes (anular), cajeros con su interruptor de activo, lo que vendió hoy y "Quitar".
 * Máximo 3 cajeros activos (`cuposCajeros`): las reglas no pueden contar, lo controla la app.
 * Todo necesita internet.
 */
export function EquipoScreen({ navigation }: PantallaRaiz<'Equipo'>) {
  const tema = useTema();
  const { equipo } = useServicios();
  const sesion = useSesionRol();
  const contenedor = useContenedor();
  const puedeGestionar = usePuede('gestionarEquipo');
  const config = useDatos((s) => s.config);
  const enLinea = useRed((s) => s.enLinea);
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const [invitaciones, setInvitaciones] = useState<Invitacion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [invitando, setInvitando] = useState(false);
  const [ventasHoy, setVentasHoy] = useState<Venta[]>([]);
  const ahora = new Date();

  useEffect(() => {
    if (!equipo || !sesion || !puedeGestionar) return;
    const cancelar = [
      equipo.observarMiembros(
        sesion.bodega,
        (m) => {
          setError(null);
          setMiembros(m);
        },
        (e) => setError(mensajeDeError(e, 'No se pudo cargar tu equipo')),
      ),
      equipo.observarInvitaciones(sesion.uid, setInvitaciones, () => undefined),
    ];
    return () => cancelar.forEach((c) => c());
  }, [equipo, sesion, puedeGestionar, intento]);

  const rango = useMemo(() => rangoPredefinido('hoy', new Date()), []);
  useEffect(
    () => contenedor.ventas.observarRango(rango, setVentasHoy, () => undefined),
    [contenedor, rango],
  );
  const vendido = useMemo(() => vendidoHoyPorPersona(ventasHoy), [ventasHoy]);

  if (!puedeGestionar || !sesion) {
    return (
      <EstadoVista
        tipo="vacio"
        icono="account-lock-outline"
        titulo="Solo el dueño gestiona el equipo"
        accion={{ etiqueta: 'Volver', onPress: () => navigation.goBack() }}
      />
    );
  }
  if (!equipo) return <EstadoVista tipo="error" titulo="Equipo no disponible" />;
  if (error && !miembros) {
    return (
      <EstadoVista
        tipo="error"
        titulo="No se pudo cargar tu equipo"
        mensaje={enLinea ? error : 'Para ver tu equipo necesitas internet.'}
        accion={{
          etiqueta: 'Reintentar',
          onPress: () => {
            setError(null);
            setIntento((n) => n + 1);
          },
        }}
      />
    );
  }
  if (!miembros) return <EstadoVista tipo="cargando" mensaje="Cargando tu equipo…" />;

  const cupos = cuposCajeros(miembros);
  const pendientes = invitaciones
    .filter((i) => i.usadaPor === null)
    .sort((a, b) => b.expira.getTime() - a.expira.getTime());
  const ordenados = [...miembros].sort(
    (a, b) => Number(b.activo) - Number(a.activo) || a.nombre.localeCompare(b.nombre),
  );

  const invitar = async () => {
    if (!requiereConexion()) return;
    setInvitando(true);
    try {
      const { invitacion, mensaje } = await invitarCajero(equipo, {
        sesion,
        nombreBodega: config.nombre,
        miembros,
        ahora: new Date(),
        rng: rngSeguro,
      });
      haptica.exito();
      avisar(`Código ${formatearCodigo(invitacion.codigo)} listo. Envíaselo a tu cajero.`, 'exito');
      await enviarPorWhatsapp(mensaje);
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo crear la invitación'), 'error');
    } finally {
      setInvitando(false);
    }
  };

  const anularInvitacion = async (inv: Invitacion) => {
    if (!requiereConexion()) return;
    const ok = await confirmar({
      titulo: 'Anular invitación',
      mensaje: `El código ${formatearCodigo(inv.codigo)} dejará de funcionar.`,
      confirmar: 'Anular',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await equipo.borrarInvitacion(inv.codigo);
      avisar('Invitación anulada', 'info');
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo anular la invitación'), 'error');
    }
  };

  const alternarActivo = async (m: Miembro, activo: boolean) => {
    if (!requiereConexion()) return;
    // Activar ocupa un cupo: máximo 3 cajeros activos (las reglas no pueden contarlos).
    if (activo && cupos === 0) {
      avisar(new ErrorDominio('LIMITE_CAJEROS').message, 'error');
      return;
    }
    try {
      await cambiarActivoCajero(equipo, sesion, m.uid, activo);
      avisar(
        activo ? `${m.nombre} puede vender de nuevo` : `${m.nombre} ya no puede vender por ahora`,
        'info',
      );
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo cambiar el acceso'), 'error');
    }
  };

  const quitar = async (m: Miembro) => {
    if (!requiereConexion()) return;
    const ok = await confirmar({
      titulo: `Quitar a ${m.nombre}`,
      mensaje:
        'Pierde el acceso a tu bodega al instante. Sus ventas se quedan en tu historial. Si vuelve, mándale una invitación nueva.',
      confirmar: 'Quitar',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await quitarCajero(equipo, sesion, m.uid);
      avisar(`${m.nombre} ya no es parte de tu equipo`, 'info');
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo quitar al cajero'), 'error');
    }
  };

  const tenue = { color: tema.colors.onSurfaceVariant };

  return (
    <ScrollView
      style={{ backgroundColor: tema.colors.background }}
      contentContainerStyle={estilos.contenido}
      testID="pantalla-equipo"
    >
      <Tarjeta nivel={2} style={estilos.bloque}>
        <View style={estilos.fila}>
          <IconoSuave nombre="account-group-outline" tamano={44} />
          <View style={estilos.flex}>
            <Text variant="titleMedium">Tus cajeros</Text>
            <Text variant="bodyMedium" style={tenue}>
              Venden con su propia cuenta y tú ves quién vendió cada cosa. No ven tus reportes ni
              pueden cambiar precios.
            </Text>
          </View>
        </View>
        <Button
          mode="contained"
          icon="whatsapp"
          onPress={() => void invitar()}
          loading={invitando}
          disabled={invitando || cupos === 0}
          contentStyle={estilos.boton}
          testID="boton-invitar-cajero"
        >
          Invitar cajero
        </Button>
        <Text variant="bodySmall" style={tenue} testID="equipo-cupos">
          {cupos === 0
            ? `Ya tienes ${MAX_CAJEROS_ACTIVOS} cajeros activos. Desactiva uno para invitar a otro.`
            : `Puedes tener hasta ${MAX_CAJEROS_ACTIVOS} cajeros activos. Te ${cupos === 1 ? 'queda 1 lugar' : `quedan ${cupos} lugares`}.`}
        </Text>
        {!enLinea ? (
          <Text variant="bodySmall" style={{ color: tema.extra.advertencia }}>
            Sin internet: para invitar o cambiar a tu equipo necesitas conexión.
          </Text>
        ) : null}
      </Tarjeta>

      {pendientes.length > 0 ? (
        <View style={estilos.grupo}>
          <Text variant="labelMedium" style={[estilos.titulo, tenue]} accessibilityRole="header">
            INVITACIONES SIN USAR
          </Text>
          {pendientes.map((inv) => {
            const vencida = inv.expira.getTime() <= ahora.getTime();
            return (
              <Tarjeta
                key={inv.codigo}
                nivel={1}
                style={estilos.bloque}
                testID={`invitacion-${inv.codigo}`}
              >
                <View style={estilos.fila}>
                  <View style={estilos.flex}>
                    <Text variant="titleLarge" style={[NUMEROS, estilos.codigo]} selectable>
                      {formatearCodigo(inv.codigo)}
                    </Text>
                    <Text variant="bodySmall" style={vencida ? { color: tema.extra.deuda } : tenue}>
                      {textoVencimiento(inv.expira, ahora)}
                    </Text>
                  </View>
                </View>
                <View style={estilos.acciones}>
                  {!vencida ? (
                    <Button
                      icon="whatsapp"
                      onPress={() =>
                        void enviarPorWhatsapp(
                          mensajeInvitacion({ nombreBodega: inv.nombreBodega, codigo: inv.codigo }),
                        )
                      }
                      contentStyle={estilos.botonChico}
                    >
                      Reenviar
                    </Button>
                  ) : null}
                  <Button
                    textColor={tema.extra.deuda}
                    onPress={() => void anularInvitacion(inv)}
                    contentStyle={estilos.botonChico}
                    testID={`anular-${inv.codigo}`}
                  >
                    {vencida ? 'Borrar' : 'Anular'}
                  </Button>
                </View>
              </Tarjeta>
            );
          })}
        </View>
      ) : null}

      <View style={estilos.grupo}>
        <Text variant="labelMedium" style={[estilos.titulo, tenue]} accessibilityRole="header">
          CAJEROS
        </Text>
        {ordenados.length === 0 ? (
          <Tarjeta nivel={1} style={estilos.bloque}>
            <Text variant="bodyMedium" style={tenue}>
              Aún no tienes cajeros. Toca “Invitar cajero” y mándale el código por WhatsApp.
            </Text>
          </Tarjeta>
        ) : (
          ordenados.map((m) => (
            <Tarjeta key={m.uid} nivel={1} style={estilos.bloque} testID={`cajero-${m.uid}`}>
              <View style={estilos.fila}>
                <View style={estilos.flex}>
                  <Text variant="titleMedium" numberOfLines={1}>
                    {m.nombre || 'Cajero'}
                  </Text>
                  {m.email ? (
                    <Text variant="bodySmall" style={tenue} numberOfLines={1}>
                      {m.email}
                    </Text>
                  ) : null}
                  <Text variant="bodySmall" style={tenue}>
                    {m.activo
                      ? `Hoy vendió ${formatearSoles(vendido.get(m.uid) ?? 0)}`
                      : 'Pausado: no puede vender'}
                  </Text>
                </View>
                <Switch
                  value={m.activo}
                  onValueChange={(v) => void alternarActivo(m, v)}
                  accessibilityLabel={`${m.nombre} puede vender`}
                  testID={`activo-${m.uid}`}
                />
              </View>
              <View style={estilos.acciones}>
                <Button
                  textColor={tema.extra.deuda}
                  onPress={() => void quitar(m)}
                  contentStyle={estilos.botonChico}
                  testID={`quitar-${m.uid}`}
                >
                  Quitar
                </Button>
              </View>
            </Tarjeta>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espacio.md,
    gap: espacio.lg,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lectura,
    alignSelf: 'center',
  },
  bloque: { padding: espacio.md, gap: espacio.sm, borderRadius: radio.lg },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espacio.md },
  grupo: { gap: espacio.xs },
  titulo: { letterSpacing: 0.6, paddingHorizontal: espacio.xxs },
  acciones: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: espacio.xs },
  boton: { minHeight: 52 },
  botonChico: { minHeight: TACTIL_MIN },
  codigo: { letterSpacing: 2 },
});
