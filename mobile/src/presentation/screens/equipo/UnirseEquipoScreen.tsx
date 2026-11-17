import { useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';

import { ErrorEquipo } from '@/data/firebase/equipoFirestore';
import { mensajeDeError } from '@/data/firebase/errores';
import { ErrorDominio } from '@/domain/errors';
import { LARGO_NOMBRE_MIEMBRO, normalizarCodigo, problemaInvitacion } from '@/domain/rules/roles';
import { aceptarInvitacion } from '@/domain/usecases/equipo';

import { aplicarSesion } from '../../app/controlSesion';
import { confirmar } from '../../components/Confirmar';
import { PantallaFormulario, SeccionFormulario } from '../../components/PantallaFormulario';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { useServicios } from '../../servicios';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { useRed } from '../../stores/redStore';
import { useSesion } from '../../stores/sesionStore';
import { espacio } from '../../theme/tokens';
import { formatearEntradaCodigo } from './codigo';

const SIN_RED = 'Para usar el código necesitas internet. Conéctate y vuelve a intentarlo.';

function mensajeAlUnirse(e: unknown): string {
  if (e instanceof ErrorDominio || e instanceof ErrorEquipo) return e.message;
  const codigo = e && typeof e === 'object' && 'code' in e ? String(e.code) : '';
  if (codigo === 'permission-denied') {
    return 'No se pudo usar el código. Puede que ya no esté vigente: pídele al dueño uno nuevo.';
  }
  return mensajeDeError(e, 'No se pudo usar el código. Vuelve a intentarlo.');
}

/** Lo que el dueño aún no envió de su propia bodega (se perdería de vista al cambiar). */
async function pendientesPropios(): Promise<number> {
  const s = useSesion.getState();
  if (s.estado !== 'autenticado' || s.sesion.rol !== 'dueno') return 0;
  const c = s.contenedor;
  const [fiado, caja] = await Promise.all([
    c.colaFiado?.listar().catch(() => []) ?? [],
    c.colaCaja?.listar().catch(() => []) ?? [],
  ]);
  return useDatos.getState().pendientes.length + fiado.length + caja.length;
}

/**
 * D-33: "Tengo un código de invitación". El cajero escribe el código ABCD-EFGH que le mandó
 * el dueño y su nombre (para que el dueño vea "Vendió: Rosa"). Una transacción marca la
 * invitación como usada, crea su miembro y su cuenta. Necesita internet.
 */
export function UnirseEquipoScreen({ navigation }: PantallaRaiz<'UnirseEquipo'>) {
  const tema = useTema();
  const { equipo } = useServicios();
  const usuario = useSesion((s) => s.usuario);
  const enLinea = useRed((s) => s.enLinea);
  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
  }, [navigation]);

  const unirme = async () => {
    setError(null);
    if (!usuario || !equipo) return;
    if (!enLinea) {
      setError(SIN_RED);
      return;
    }
    const normalizado = normalizarCodigo(codigo);
    if (!normalizado) {
      setError(new ErrorDominio('CODIGO_INVALIDO').message);
      return;
    }
    if (!nombre.trim()) {
      setError('Escribe tu nombre: así el dueño sabe quién hizo cada venta.');
      return;
    }
    setEnviando(true);
    try {
      const pendientes = await pendientesPropios();
      if (pendientes > 0) {
        setError(
          `Tienes ${pendientes} ${pendientes === 1 ? 'operación' : 'operaciones'} de tu bodega sin enviar. Espera a que se envíen (Ajustes → Ventas pendientes) y vuelve a intentarlo.`,
        );
        return;
      }
      // Se lee primero para mostrar el nombre de la bodega antes de confirmar.
      const invitacion = await equipo.leerInvitacion(normalizado);
      const problema = problemaInvitacion(invitacion, usuario.uid, new Date());
      if (problema || !invitacion) throw new ErrorDominio(problema ?? 'INVITACION_NO_EXISTE');
      const bodega = invitacion.nombreBodega || 'la bodega';
      const ok = await confirmar({
        titulo: `¿Unirte a ${bodega}?`,
        mensaje: `Vas a vender en ${bodega} como cajero. Desde ahora esta cuenta trabajará en esa bodega. Los datos de tu propia bodega no se borran.`,
        confirmar: 'Unirme',
      });
      if (!ok) return;
      const sesion = await aceptarInvitacion(equipo, {
        codigo: normalizado,
        uid: usuario.uid,
        nombre,
        email: usuario.email,
        ahora: new Date(),
      });
      const estabaDentro = useSesion.getState().estado === 'autenticado';
      await aplicarSesion({ tipo: 'activa', sesion });
      haptica.exito();
      avisar(`¡Bienvenido! Ya vendes en ${bodega}.`, 'exito');
      if (estabaDentro) navigation.reset({ index: 0, routes: [{ name: 'Tabs' }] });
    } catch (e) {
      haptica.error();
      setError(mensajeAlUnirse(e));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <PantallaFormulario
      icono="account-group-outline"
      titulo="Tengo un código de invitación"
      descripcion="El dueño de la bodega te lo mandó por WhatsApp. Con él vendes en su bodega desde tu propia cuenta."
      pie={
        <Button
          mode="contained"
          icon="check"
          onPress={() => void unirme()}
          loading={enviando}
          disabled={enviando || !equipo}
          contentStyle={estilos.boton}
          testID="boton-unirme"
        >
          Unirme a la bodega
        </Button>
      }
    >
      <SeccionFormulario titulo="Tu código">
        <TextInput
          mode="outlined"
          label="Código"
          placeholder="ABCD-EFGH"
          value={codigo}
          onChangeText={(t) => setCodigo(formatearEntradaCodigo(t))}
          autoCapitalize="characters"
          autoCorrect={false}
          autoComplete="off"
          maxLength={9}
          style={estilos.codigo}
          testID="campo-codigo"
          accessibilityLabel="Código de invitación"
        />
        <TextInput
          mode="outlined"
          label="Tu nombre"
          placeholder="Por ejemplo: Rosa"
          value={nombre}
          onChangeText={setNombre}
          maxLength={LARGO_NOMBRE_MIEMBRO}
          autoCapitalize="words"
          testID="campo-nombre-cajero"
        />
        <HelperText type="info" visible>
          El dueño verá este nombre en cada venta que hagas.
        </HelperText>
      </SeccionFormulario>
      {!enLinea ? (
        <View style={[estilos.aviso, { backgroundColor: tema.extra.fondoAdvertencia }]}>
          <Text variant="bodyMedium" testID="unirse-sin-red">
            {SIN_RED}
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={[estilos.aviso, { backgroundColor: tema.extra.fondoDeuda }]}>
          <Text
            variant="bodyMedium"
            style={{ color: tema.colors.onSurface }}
            accessibilityRole="alert"
            testID="unirse-error"
          >
            {error}
          </Text>
        </View>
      ) : null}
    </PantallaFormulario>
  );
}

const estilos = StyleSheet.create({
  boton: { minHeight: 52 },
  codigo: { fontSize: 22, letterSpacing: 2 },
  aviso: { padding: espacio.md, borderRadius: 12 },
});
