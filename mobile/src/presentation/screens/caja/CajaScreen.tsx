import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import {
  arqueo,
  LARGO_MAXIMO_MOTIVO,
  type Caja,
  type MovimientoCaja,
  type ResultadoArqueo,
  type TipoMovimientoCaja,
} from '@/domain/rules/caja';
import { formatearSoles, parsearSoles } from '@/domain/rules/dinero';
import { fechaEfectiva } from '@/domain/rules/reportes';
import { abrirCaja, cerrarCaja, registrarMovimientoCaja } from '@/domain/usecases/caja';

import { EstadoVista } from '../../components/EstadoVista';
import { Tarjeta } from '../../components/Tarjeta';
import { useCaja } from '../../hooks/useCaja';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { estaEnLinea } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';
import { espacio, NUMEROS, radio } from '../../theme/tokens';
import { ANCHO_CONTENIDO } from '../../theme/ventana';

const fechaHora = (f: Date | null): string =>
  f
    ? `${f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' })} ${f.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
    : '—';

const ETIQUETA_ARQUEO: Record<ResultadoArqueo, string> = {
  cuadra: 'Cuadra',
  sobrante: 'Sobrante',
  faltante: 'Faltante',
};

const textoArqueo = (diferencia: number, resultado: ResultadoArqueo): string =>
  resultado === 'cuadra'
    ? 'Cuadra exacto'
    : `${ETIQUETA_ARQUEO[resultado]} ${formatearSoles(Math.abs(diferencia))}`;

const sinSenal = (texto: string) =>
  estaEnLinea() ? texto : `${texto} en el teléfono. Se enviará al volver la señal.`;

/**
 * Wireframe Caja (D-28):
 *  sin caja abierta → [¿Con cuánto sencillo empiezas? S/ __] [Abrir caja]
 *  con caja abierta → [Efectivo esperado S/ … + desglose] [Ingreso] [Egreso]
 *                     [movimientos] [Cerrar caja → contar efectivo → esperado vs contado]
 *  siempre          → [Cierres anteriores: fecha · esperado · contado · sobrante/faltante]
 */
export function CajaScreen(_props: PantallaRaiz<'Caja'>) {
  const tema = useTema();
  const contenedor = useContenedor();
  const caja = useCaja();
  const [montoInicial, setMontoInicial] = useState('');
  const [abriendo, setAbriendo] = useState(false);
  const [dialogoMov, setDialogoMov] = useState<TipoMovimientoCaja | null>(null);
  const [cerrando, setCerrando] = useState(false);

  if (caja.cargando) return <EstadoVista tipo="cargando" />;
  if (caja.error && caja.cajas.length === 0)
    return <EstadoVista tipo="error" titulo="No se pudo cargar la caja" mensaje={caja.error} />;

  const abrir = async () => {
    const monto = montoInicial.trim() === '' ? 0 : parsearSoles(montoInicial);
    setAbriendo(true);
    try {
      await abrirCaja(contenedor.caja, caja.cajas, monto);
      haptica.exito();
      setMontoInicial('');
      avisar(sinSenal('Caja abierta'), 'exito');
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo abrir la caja'), 'error');
    } finally {
      setAbriendo(false);
    }
  };

  const tenue = { color: tema.colors.onSurfaceVariant };

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <ScrollView contentContainerStyle={estilos.contenido} keyboardShouldPersistTaps="handled">
        {caja.abierta ? (
          <CajaAbierta
            caja={caja.abierta}
            resumen={caja.resumen}
            movimientos={caja.movimientos}
            onIngreso={() => setDialogoMov('ingreso')}
            onEgreso={() => setDialogoMov('egreso')}
            onCerrar={() => setCerrando(true)}
          />
        ) : (
          <Tarjeta nivel={2} style={estilos.bloque}>
            <Text variant="titleLarge">Abrir caja</Text>
            <Text variant="bodyMedium" style={tenue}>
              ¿Con cuánto sencillo empiezas? Al cerrar, Bodegón te dice cuánto debería haber en el
              cajón.
            </Text>
            <TextInput
              mode="outlined"
              label="Monto inicial"
              value={montoInicial}
              onChangeText={setMontoInicial}
              keyboardType="decimal-pad"
              left={<TextInput.Affix text="S/" />}
              testID="campo-monto-inicial"
            />
            <Button
              mode="contained"
              icon="cash-register"
              onPress={() => void abrir()}
              loading={abriendo}
              disabled={abriendo}
              contentStyle={estilos.botonAlto}
              testID="boton-abrir-caja"
            >
              Abrir caja
            </Button>
          </Tarjeta>
        )}

        <Text variant="labelLarge" style={[estilos.seccion, tenue]} accessibilityRole="header">
          Cierres anteriores
        </Text>
        {caja.historial.length === 0 ? (
          <Text variant="bodyMedium" style={tenue}>
            Aún no cerraste ninguna caja.
          </Text>
        ) : (
          caja.historial.map((c) => <FilaCierre key={c.id} caja={c} />)
        )}
      </ScrollView>

      <DialogoMovimiento
        tipo={dialogoMov}
        onCerrar={() => setDialogoMov(null)}
        onGuardar={async (tipo, monto, motivo) => {
          try {
            await registrarMovimientoCaja(contenedor.caja, caja.abierta, tipo, monto, motivo);
            haptica.exito();
            setDialogoMov(null);
            avisar(
              sinSenal(tipo === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado'),
              'exito',
            );
          } catch (e) {
            avisar(mensajeDeError(e, 'No se pudo registrar el movimiento'), 'error');
          }
        }}
      />
      <DialogoCierre
        visible={cerrando}
        esperado={caja.resumen?.esperado ?? null}
        onCerrar={() => setCerrando(false)}
        onConfirmar={async (contado) => {
          // El esperado se recalcula en este instante: lo que se ve es lo que se guarda.
          const resumen = caja.resumenAhora();
          if (!resumen) return;
          try {
            await cerrarCaja(contenedor.caja, caja.abierta, contado, resumen.esperado);
            const { diferencia, resultado } = arqueo(contado, resumen.esperado);
            if (resultado === 'cuadra') haptica.exito();
            else haptica.advertencia();
            setCerrando(false);
            avisar(sinSenal(`Caja cerrada · ${textoArqueo(diferencia, resultado)}`), 'exito');
          } catch (e) {
            avisar(mensajeDeError(e, 'No se pudo cerrar la caja'), 'error');
          }
        }}
      />
    </View>
  );
}

function CajaAbierta({
  caja,
  resumen,
  movimientos,
  onIngreso,
  onEgreso,
  onCerrar,
}: {
  caja: Caja;
  resumen: ReturnType<typeof useCaja>['resumen'];
  movimientos: MovimientoCaja[];
  onIngreso: () => void;
  onEgreso: () => void;
  onCerrar: () => void;
}) {
  const tema = useTema();
  const tenue = { color: tema.colors.onSurfaceVariant };
  const filas: [string, string, number][] = resumen
    ? [
        ['Monto inicial', 'detalle-inicial', resumen.inicial],
        ['Ventas en efectivo', 'detalle-ventas', resumen.ventasEfectivo],
        ['Pagos de fiado en efectivo', 'detalle-abonos', resumen.abonosEfectivo],
        ['Ingresos', 'detalle-ingresos', resumen.ingresos],
        ['Egresos', 'detalle-egresos', -resumen.egresos],
      ]
    : [];

  return (
    <>
      <Tarjeta nivel={2} style={estilos.bloque}>
        <View style={[estilos.pildora, { backgroundColor: tema.colors.secondaryContainer }]}>
          <Text variant="labelMedium" style={{ color: tema.colors.onSecondaryContainer }}>
            {`Abierta desde ${fechaHora(fechaEfectiva(caja.apertura))}`}
            {caja.pendiente ? ' · Por enviar' : ''}
          </Text>
        </View>
        <Text variant="labelLarge" style={tenue}>
          Efectivo esperado en el cajón
        </Text>
        <Text
          variant="displaySmall"
          style={[NUMEROS, { color: tema.colors.primary }]}
          testID="caja-esperado"
        >
          {resumen ? formatearSoles(resumen.esperado) : '…'}
        </Text>
        {filas.map(([etiqueta, id, monto]) => (
          <View key={id} style={estilos.filaDetalle}>
            <Text variant="bodyMedium" style={tenue}>
              {etiqueta}
            </Text>
            <Text variant="bodyMedium" style={NUMEROS} testID={id}>
              {monto < 0 ? `- ${formatearSoles(-monto)}` : formatearSoles(monto)}
            </Text>
          </View>
        ))}
        <View style={estilos.fila}>
          <Button
            mode="contained-tonal"
            icon="plus"
            style={estilos.flex}
            contentStyle={estilos.botonAlto}
            onPress={onIngreso}
            testID="boton-ingreso"
          >
            Ingreso
          </Button>
          <Button
            mode="contained-tonal"
            icon="minus"
            style={estilos.flex}
            contentStyle={estilos.botonAlto}
            buttonColor={tema.extra.fondoDeuda}
            textColor={tema.extra.deuda}
            onPress={onEgreso}
            testID="boton-egreso"
          >
            Egreso
          </Button>
        </View>
        <Button
          mode="contained"
          icon="lock-outline"
          contentStyle={estilos.botonAlto}
          onPress={onCerrar}
          disabled={!resumen}
          testID="boton-cerrar-caja"
        >
          Cerrar caja
        </Button>
      </Tarjeta>

      {movimientos.length > 0 ? (
        <>
          <Text variant="labelLarge" style={[estilos.seccion, tenue]} accessibilityRole="header">
            Movimientos de esta caja
          </Text>
          {movimientos.map((m) => (
            <Tarjeta key={m.id} nivel={1} style={estilos.movimiento}>
              <View style={estilos.flex}>
                <Text variant="bodyLarge">{m.motivo}</Text>
                <Text variant="bodySmall" style={tenue}>
                  {fechaHora(fechaEfectiva(m))}
                  {m.pendiente ? ' · Por enviar' : ''}
                </Text>
              </View>
              <Text
                variant="titleMedium"
                style={[
                  NUMEROS,
                  { color: m.tipo === 'ingreso' ? tema.extra.aFavor : tema.extra.deuda },
                ]}
              >
                {m.tipo === 'ingreso' ? '+ ' : '- '}
                {formatearSoles(m.monto)}
              </Text>
            </Tarjeta>
          ))}
        </>
      ) : null}
    </>
  );
}

function FilaCierre({ caja }: { caja: Caja }) {
  const tema = useTema();
  const tenue = { color: tema.colors.onSurfaceVariant };
  const cierre = caja.cierre;
  const { diferencia, resultado } = cierre
    ? arqueo(cierre.contado, cierre.esperado)
    : { diferencia: 0, resultado: 'cuadra' as const };
  const color =
    resultado === 'cuadra'
      ? tema.extra.aFavor
      : resultado === 'sobrante'
        ? tema.extra.advertencia
        : tema.extra.deuda;
  return (
    <Tarjeta nivel={1} style={estilos.cierre} testID={`cierre-${caja.id}`}>
      <View style={estilos.flex}>
        <Text variant="titleSmall">
          {`${fechaHora(fechaEfectiva(caja.apertura))} → ${cierre ? fechaHora(fechaEfectiva(cierre)) : '—'}`}
        </Text>
        <Text variant="bodySmall" style={tenue}>
          {cierre
            ? `Esperado ${formatearSoles(cierre.esperado)} · Contado ${formatearSoles(cierre.contado)}`
            : 'Sin datos de cierre'}
          {caja.pendiente ? ' · Por enviar' : ''}
        </Text>
      </View>
      <Text variant="labelLarge" style={[NUMEROS, { color }]}>
        {textoArqueo(diferencia, resultado)}
      </Text>
    </Tarjeta>
  );
}

function DialogoMovimiento({
  tipo,
  onCerrar,
  onGuardar,
}: {
  tipo: TipoMovimientoCaja | null;
  onCerrar: () => void;
  onGuardar: (tipo: TipoMovimientoCaja, monto: number, motivo: string) => Promise<void>;
}) {
  const [monto, setMonto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [guardando, setGuardando] = useState(false);
  const valor = parsearSoles(monto);
  const valido = Number.isFinite(valor) && valor > 0 && motivo.trim().length > 0;

  const cerrar = () => {
    setMonto('');
    setMotivo('');
    onCerrar();
  };

  return (
    <Portal>
      <Dialog visible={tipo !== null} onDismiss={cerrar} testID="dialogo-movimiento-caja">
        <Dialog.Title>
          {tipo === 'egreso' ? 'Sacar dinero (egreso)' : 'Meter dinero (ingreso)'}
        </Dialog.Title>
        <Dialog.Content style={estilos.dialogo}>
          <TextInput
            mode="outlined"
            label="Monto"
            value={monto}
            onChangeText={setMonto}
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="S/" />}
            testID="campo-monto-mov"
          />
          <TextInput
            mode="outlined"
            label="Motivo"
            placeholder={tipo === 'egreso' ? 'Pago al proveedor de pan' : 'Sencillo del banco'}
            value={motivo}
            onChangeText={setMotivo}
            maxLength={LARGO_MAXIMO_MOTIVO}
            testID="campo-motivo-mov"
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={cerrar}>Cancelar</Button>
          <Button
            mode="contained"
            disabled={!valido || guardando}
            loading={guardando}
            onPress={() => {
              if (!tipo) return;
              setGuardando(true);
              void onGuardar(tipo, valor, motivo).finally(() => {
                setGuardando(false);
                setMonto('');
                setMotivo('');
              });
            }}
            testID="guardar-mov"
          >
            Guardar
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

function DialogoCierre({
  visible,
  esperado,
  onCerrar,
  onConfirmar,
}: {
  visible: boolean;
  esperado: number | null;
  onCerrar: () => void;
  onConfirmar: (contado: number) => Promise<void>;
}) {
  const tema = useTema();
  const [texto, setTexto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const contado = parsearSoles(texto);
  const valido = Number.isFinite(contado) && contado >= 0 && esperado !== null;
  const resultado = valido && esperado !== null ? arqueo(contado, esperado) : null;
  const color = !resultado
    ? tema.colors.onSurfaceVariant
    : resultado.resultado === 'cuadra'
      ? tema.extra.aFavor
      : resultado.resultado === 'sobrante'
        ? tema.extra.advertencia
        : tema.extra.deuda;

  const cerrar = () => {
    setTexto('');
    onCerrar();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={cerrar} testID="dialogo-cierre-caja">
        <Dialog.Title>Cerrar caja</Dialog.Title>
        <Dialog.Content style={estilos.dialogo}>
          <Text variant="bodyMedium">Cuenta el efectivo del cajón y escribe el total.</Text>
          <TextInput
            mode="outlined"
            label="Efectivo contado"
            value={texto}
            onChangeText={setTexto}
            keyboardType="decimal-pad"
            left={<TextInput.Affix text="S/" />}
            testID="campo-contado"
          />
          <View style={estilos.filaDetalle}>
            <Text variant="bodyMedium">Esperado</Text>
            <Text variant="bodyMedium" style={NUMEROS} testID="arqueo-esperado">
              {esperado === null ? '…' : formatearSoles(esperado)}
            </Text>
          </View>
          <View style={estilos.filaDetalle}>
            <Text variant="bodyMedium">Contado</Text>
            <Text variant="bodyMedium" style={NUMEROS}>
              {valido ? formatearSoles(contado) : '—'}
            </Text>
          </View>
          <View style={estilos.filaDetalle}>
            <Text variant="titleSmall">Diferencia</Text>
            <Text variant="titleSmall" style={[NUMEROS, { color }]} testID="arqueo-diferencia">
              {resultado ? textoArqueo(resultado.diferencia, resultado.resultado) : '—'}
            </Text>
          </View>
          {resultado && resultado.resultado !== 'cuadra' ? (
            <HelperText type="info" visible>
              Puedes volver a contar antes de cerrar. Una caja cerrada ya no se modifica.
            </HelperText>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={cerrar}>Cancelar</Button>
          <Button
            mode="contained"
            disabled={!valido || guardando}
            loading={guardando}
            onPress={() => {
              setGuardando(true);
              void onConfirmar(contado).finally(() => {
                setGuardando(false);
                setTexto('');
              });
            }}
            testID="confirmar-cierre"
          >
            Cerrar caja
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  contenido: {
    padding: espacio.md,
    gap: espacio.sm,
    paddingBottom: espacio.xl,
    width: '100%',
    maxWidth: ANCHO_CONTENIDO.lectura,
    alignSelf: 'center',
  },
  bloque: { padding: espacio.lg, gap: espacio.sm },
  fila: { flexDirection: 'row', gap: espacio.xs, marginTop: espacio.xs },
  filaDetalle: { flexDirection: 'row', justifyContent: 'space-between', gap: espacio.sm },
  botonAlto: { minHeight: 52 },
  seccion: { marginTop: espacio.sm },
  pildora: {
    alignSelf: 'flex-start',
    paddingHorizontal: espacio.xs,
    paddingVertical: 2,
    borderRadius: radio.completo,
  },
  movimiento: { flexDirection: 'row', alignItems: 'center', padding: espacio.sm, gap: espacio.sm },
  cierre: { flexDirection: 'row', alignItems: 'center', padding: espacio.sm, gap: espacio.sm },
  dialogo: { gap: espacio.sm },
});
