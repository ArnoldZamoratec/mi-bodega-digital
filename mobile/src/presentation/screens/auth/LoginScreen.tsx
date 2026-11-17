import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { zodResolver } from '@hookform/resolvers/zod';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useState, type ComponentProps } from 'react';
import { useForm } from 'react-hook-form';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mensajeDeError } from '@/data/firebase/errores';

import { useIntencionUnirse } from '../../app/controlSesion';
import { Aparecer } from '../../components/Aparecer';
import { BotonGoogle } from '../../components/BotonGoogle';
import { CampoTexto } from '../../components/CampoTexto';
import { sobreHero } from '../../components/EncabezadoHero';
import { SimboloBodegon } from '../../components/SimboloBodegon';
import { Tarjeta } from '../../components/Tarjeta';
import {
  esquemaLogin,
  esquemaRegistro,
  type DatosLogin,
  type DatosRegistro,
} from '../../forms/esquemas';
import { useTema } from '../../hooks/useDerivados';
import { avisar } from '../../stores/avisosStore';
import { useServicios } from '../../servicios';
import { kraft } from '../../theme/paleta';
import { degradado, familia, NOMBRE_MARCA } from '../../theme/tema';
import { espacio, radio, TACTIL_MIN } from '../../theme/tokens';

type Modo = 'login' | 'registro';

/**
 * Wireframe:
 *  [símbolo + "Bodegón Digital"]
 *  [título del modo]
 *  [correo] [contraseña] ([confirmar] en registro)
 *  [error de servidor]
 *  [botón principal]  [¿Olvidaste tu contraseña?]
 *  [alternar login/registro]
 * Estados: idle · enviando (botón con spinner, campos bloqueados) · error (mensaje en español).
 */
export function LoginScreen() {
  const [modo, setModo] = useState<Modo>('login');
  const tema = useTema();
  const insets = useSafeAreaInsets();
  const quiereUnirse = useIntencionUnirse((s) => s.pendiente);
  const fijarUnirse = useIntencionUnirse((s) => s.fijar);

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={estilos.flex}
        // Con edge-to-edge (Android 15+, SDK 58) la ventana ya no se achica sola con el
        // teclado: 'padding' en ambas plataformas mantiene a la vista el campo y el botón.
        behavior="padding"
      >
        <ScrollView
          contentContainerStyle={[estilos.scroll, { paddingBottom: insets.bottom + espacio.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          <LinearGradient
            colors={tema.dark ? degradado.oscuro : degradado.claro}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[estilos.hero, { paddingTop: insets.top + espacio.xl }]}
          >
            <View pointerEvents="none" style={[estilos.circulo, estilos.circuloGrande]} />
            <View pointerEvents="none" style={[estilos.circulo, estilos.circuloChico]} />
            <Aparecer style={estilos.cabecera}>
              <View style={estilos.logoMarco}>
                <SimboloBodegon
                  tamano={60}
                  variante="color"
                  accessibilityLabel={`Logo de ${NOMBRE_MARCA}`}
                />
              </View>
              <Text style={estilos.marca} accessibilityRole="text">
                <Text style={{ color: sobreHero.texto }}>Bodegón </Text>
                <Text style={{ color: sobreHero.acento }}>Digital</Text>
              </Text>
              <Text
                variant="headlineLarge"
                style={[estilos.centrado, { color: sobreHero.texto }]}
                accessibilityRole="header"
              >
                {modo === 'login' ? 'Bienvenido de nuevo' : 'Crea tu cuenta'}
              </Text>
              <Text variant="bodyLarge" style={[estilos.centrado, { color: sobreHero.tenue }]}>
                {modo === 'login'
                  ? 'Vende, controla tu stock y lleva tus fiados desde el celular.'
                  : 'Empieza gratis a registrar ventas, inventario y fiados.'}
              </Text>
            </Aparecer>
          </LinearGradient>

          <Aparecer retraso={80} style={estilos.tarjetaContenedor}>
            <Tarjeta nivel={3} style={estilos.tarjeta}>
              <Text variant="titleLarge" style={estilos.tituloForm}>
                {modo === 'login' ? 'Iniciar sesión' : 'Registrarse'}
              </Text>
              {/* Google primero: un toque, sin contraseña que recordar. Sirve para entrar y
                  para crear la cuenta, así que aparece en ambos modos. */}
              <AccesoGoogle />
              {modo === 'login' ? <FormLogin /> : <FormRegistro />}
            </Tarjeta>
          </Aparecer>

          <View style={estilos.beneficios}>
            {BENEFICIOS.map((b) => (
              <View key={b.texto} style={estilos.beneficio}>
                <MaterialCommunityIcons name={b.icono} size={18} color={tema.colors.primary} />
                <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  {b.texto}
                </Text>
              </View>
            ))}
          </View>

          {/* D-33: el cajero también entra o se registra aquí; el código se escribe después. */}
          <View style={estilos.invitacion}>
            {quiereUnirse ? (
              <Text
                variant="bodyMedium"
                style={[estilos.centrado, { color: tema.colors.onSurface }]}
                testID="login-aviso-codigo"
              >
                Primero entra o crea tu cuenta. Después te pediremos el código de invitación.
              </Text>
            ) : (
              <Button
                icon="ticket-confirmation-outline"
                onPress={() => fijarUnirse(true)}
                contentStyle={{ minHeight: TACTIL_MIN }}
                testID="login-tengo-codigo"
              >
                Tengo un código de invitación
              </Button>
            )}
          </View>

          <View style={estilos.alternar}>
            <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
              {modo === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'}
            </Text>
            <Button
              compact
              onPress={() => setModo(modo === 'login' ? 'registro' : 'login')}
              testID="alternar-modo"
            >
              {modo === 'login' ? 'Regístrate' : 'Inicia sesión'}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const BENEFICIOS: {
  icono: ComponentProps<typeof MaterialCommunityIcons>['name'];
  texto: string;
}[] = [
  { icono: 'wifi-off', texto: 'Vende sin internet' },
  { icono: 'barcode-scan', texto: 'Escáner' },
  { icono: 'shield-check-outline', texto: 'En la nube' },
];

/** Botón de Google + separador "o con tu correo". No se muestra si Google no está configurado. */
function AccesoGoogle() {
  const tema = useTema();
  const { auth } = useServicios();
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!auth.googleDisponible) return null;

  const entrar = async () => {
    setError(null);
    setCargando(true);
    try {
      // 'cancelado' (cerró el selector de cuentas) no es un error: no se muestra nada.
      await auth.ingresarConGoogle();
    } catch (e) {
      setError(mensajeDeError(e, 'No se pudo iniciar sesión con Google. Intenta de nuevo.'));
    } finally {
      setCargando(false);
    }
  };

  return (
    <View style={estilos.google}>
      <BotonGoogle onPress={() => void entrar()} cargando={cargando} />
      {error ? (
        <HelperText type="error" visible testID="error-google">
          {error}
        </HelperText>
      ) : null}
      <View style={estilos.separador} accessibilityElementsHidden>
        <View style={[estilos.linea, { backgroundColor: tema.colors.outlineVariant }]} />
        <Text variant="labelMedium" style={{ color: tema.colors.onSurfaceVariant }}>
          o con tu correo
        </Text>
        <View style={[estilos.linea, { backgroundColor: tema.colors.outlineVariant }]} />
      </View>
    </View>
  );
}

function FormLogin() {
  const { auth } = useServicios();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const { control, handleSubmit, getValues, formState, setFocus } = useForm<DatosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: '', password: '' },
  });

  const enviar = handleSubmit(async ({ email, password }) => {
    setErrorServidor(null);
    try {
      await auth.ingresar(email, password);
    } catch (e) {
      setErrorServidor(mensajeDeError(e, 'No se pudo iniciar sesión'));
    }
  });

  const recuperar = async () => {
    const email = getValues('email').trim();
    if (!email) {
      setErrorServidor('Escribe tu correo para enviarte el enlace de recuperación.');
      return;
    }
    try {
      await auth.recuperarContrasena(email);
      avisar('Te enviamos un correo para restablecer tu contraseña', 'exito');
    } catch (e) {
      setErrorServidor(mensajeDeError(e, 'No se pudo enviar el correo'));
    }
  };

  return (
    <View style={estilos.form}>
      <CampoTexto
        control={control}
        nombre="email"
        etiqueta="Correo electrónico"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        disabled={formState.isSubmitting}
        returnKeyType="next"
        onSubmitEditing={() => setFocus('password')}
      />
      <CampoTexto
        control={control}
        nombre="password"
        etiqueta="Contraseña"
        secureTextEntry
        autoComplete="password"
        textContentType="password"
        disabled={formState.isSubmitting}
        returnKeyType="go"
        onSubmitEditing={() => void enviar()}
      />
      <HelperText type="error" visible={!!errorServidor} testID="error-login">
        {errorServidor ?? ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={() => void enviar()}
        loading={formState.isSubmitting}
        disabled={formState.isSubmitting}
        contentStyle={estilos.botonGrande}
        testID="boton-ingresar"
      >
        {formState.isSubmitting ? 'Ingresando…' : 'Ingresar'}
      </Button>
      <Button onPress={recuperar} compact style={estilos.secundario}>
        ¿Olvidaste tu contraseña?
      </Button>
    </View>
  );
}

function FormRegistro() {
  const { auth } = useServicios();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  const { control, handleSubmit, formState, setFocus } = useForm<DatosRegistro>({
    resolver: zodResolver(esquemaRegistro),
    defaultValues: { email: '', password: '', confirmacion: '' },
  });

  const enviar = handleSubmit(async ({ email, password }) => {
    setErrorServidor(null);
    try {
      await auth.registrar(email, password);
    } catch (e) {
      setErrorServidor(mensajeDeError(e, 'No se pudo crear la cuenta'));
    }
  });

  return (
    <View style={estilos.form}>
      <CampoTexto
        control={control}
        nombre="email"
        etiqueta="Correo electrónico"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        returnKeyType="next"
        onSubmitEditing={() => setFocus('password')}
      />
      <CampoTexto
        control={control}
        nombre="password"
        etiqueta="Contraseña (mín. 6)"
        secureTextEntry
        returnKeyType="next"
        onSubmitEditing={() => setFocus('confirmacion')}
      />
      <CampoTexto
        control={control}
        nombre="confirmacion"
        etiqueta="Confirmar contraseña"
        secureTextEntry
        returnKeyType="go"
        onSubmitEditing={() => void enviar()}
      />
      <HelperText type="error" visible={!!errorServidor} testID="error-registro">
        {errorServidor ?? ''}
      </HelperText>
      <Button
        mode="contained"
        onPress={() => void enviar()}
        loading={formState.isSubmitting}
        disabled={formState.isSubmitting}
        contentStyle={estilos.botonGrande}
        testID="boton-registrar"
      >
        Crear cuenta
      </Button>
    </View>
  );
}

const estilos = StyleSheet.create({
  invitacion: { alignItems: 'center', paddingHorizontal: espacio.md },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, gap: espacio.lg },
  hero: {
    paddingHorizontal: espacio.lg,
    paddingBottom: espacio.xxl + espacio.lg,
    borderBottomLeftRadius: radio.xl + 8,
    borderBottomRightRadius: radio.xl + 8,
    overflow: 'hidden',
  },
  circulo: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.06)' },
  circuloGrande: { width: 320, height: 320, top: -140, right: -120 },
  circuloChico: { width: 180, height: 180, bottom: -60, left: -60 },
  cabecera: { alignItems: 'center', gap: espacio.xs, maxWidth: 440, alignSelf: 'center' },
  logoMarco: {
    width: 84,
    height: 84,
    borderRadius: radio.xl,
    backgroundColor: kraft[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: espacio.xs,
    overflow: 'hidden',
    boxShadow: '0px 8px 24px rgba(3, 32, 25, 0.35)',
  },
  marca: { fontFamily: familia.extra, fontSize: 20, letterSpacing: -0.4 },
  centrado: { textAlign: 'center' },
  tarjetaContenedor: {
    marginTop: -(espacio.xxl + espacio.xs),
    paddingHorizontal: espacio.md,
    width: '100%',
    maxWidth: 472,
    alignSelf: 'center',
  },
  tarjeta: { padding: espacio.lg, borderRadius: radio.xl },
  tituloForm: { marginBottom: espacio.md },
  google: { gap: espacio.xs, marginBottom: espacio.sm },
  separador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.sm,
    marginTop: espacio.xs,
  },
  linea: { flex: 1, height: StyleSheet.hairlineWidth * 2 },
  beneficios: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: espacio.md,
    paddingHorizontal: espacio.md,
  },
  beneficio: { flexDirection: 'row', alignItems: 'center', gap: espacio.xxs },
  form: { gap: espacio.xxs },
  botonGrande: { minHeight: TACTIL_MIN },
  secundario: { alignSelf: 'center', marginTop: espacio.xs },
  alternar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
