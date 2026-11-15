import { zodResolver } from '@hookform/resolvers/zod';
import { useLayoutEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { Button, SegmentedButtons, Text } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import { METODOS_PAGO_ABONO } from '@/domain/entities';
import { formatearSoles, parsearSoles } from '@/domain/rules/dinero';
import { calcularSaldo, cargoMasAntiguoPendiente } from '@/domain/rules/fiado';
import { registrarAbono, registrarCargo } from '@/domain/usecases/fiado';

import { CampoTexto } from '../../components/CampoTexto';
import { PantallaFormulario, SeccionFormulario } from '../../components/PantallaFormulario';
import { Tarjeta } from '../../components/Tarjeta';
import { esquemaMovimiento, type DatosMovimiento } from '../../forms/esquemas';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { estaEnLinea } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';
import { espacio } from '../../theme/tokens';

/**
 * Cargo manual ("Fiar") o abono ("Registrar pago").
 * El abono se pre-llena con el cargo pendiente más antiguo y lo que falta (RN-09),
 * y nunca marca el cargo como pagado (D-14).
 */
export function MovimientoFormScreen({ navigation, route }: PantallaRaiz<'MovimientoForm'>) {
  const { clienteId, tipo } = route.params;
  const tema = useTema();
  const contenedor = useContenedor();
  const todos = useDatos((s) => s.movimientos.datos);
  const cliente = useDatos((s) => s.clientes.datos.find((c) => c.id === clienteId));
  const movimientos = useMemo(
    () => todos.filter((m) => m.clienteId === clienteId),
    [todos, clienteId],
  );
  const origen = useMemo(
    () => (tipo === 'abono' ? cargoMasAntiguoPendiente(movimientos) : undefined),
    [tipo, movimientos],
  );
  const saldo = calcularSaldo(movimientos);

  const { control, handleSubmit, formState, setFocus } = useForm<DatosMovimiento>({
    resolver: zodResolver(esquemaMovimiento),
    defaultValues: {
      monto: origen ? origen.pendiente.toFixed(2) : '',
      descripcion: origen ? `Pago de: ${origen.movimiento.descripcion}`.slice(0, 100) : '',
      metodoPago: 'Efectivo',
    },
  });

  // El título va en el cuerpo del formulario; la barra queda limpia.
  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
  }, [navigation]);

  const esCargo = tipo === 'cargo';
  const tono = esCargo
    ? { color: tema.extra.deuda, fondo: tema.extra.fondoDeuda }
    : { color: tema.colors.primary, fondo: tema.colors.secondaryContainer };

  // Sin conexión también: queda en el teléfono y se envía al volver la señal (D-24).
  const guardar = handleSubmit(async (d) => {
    const monto = parsearSoles(d.monto);
    try {
      if (tipo === 'cargo') {
        await registrarCargo(contenedor.fiado, clienteId, monto, d.descripcion);
      } else {
        await registrarAbono(contenedor.fiado, {
          clienteId,
          monto,
          descripcion: d.descripcion,
          metodoPago: d.metodoPago,
          ...(origen ? { deudaOrigenId: origen.movimiento.id } : {}),
        });
      }
      haptica.exito();
      const hecho = tipo === 'cargo' ? 'Deuda registrada' : 'Pago registrado';
      avisar(
        estaEnLinea() ? hecho : `${hecho} en el teléfono. Se enviará al volver la señal.`,
        'exito',
      );
      navigation.goBack();
    } catch (e) {
      avisar(
        mensajeDeError(e, tipo === 'cargo' ? 'Error al añadir deuda' : 'Error al registrar pago'),
        'error',
      );
    }
  });

  return (
    <PantallaFormulario
      icono={esCargo ? 'arrow-top-right' : 'cash-plus'}
      tono={tono}
      titulo={esCargo ? 'Fiar' : 'Registrar pago'}
      descripcion={
        esCargo
          ? `Nueva deuda para ${cliente?.nombre ?? 'el cliente'}.`
          : `Pago de ${cliente?.nombre ?? 'el cliente'}. Se suma a tus reportes del día.`
      }
      pie={
        <Button
          mode="contained"
          icon="check"
          onPress={() => void guardar()}
          loading={formState.isSubmitting}
          disabled={formState.isSubmitting}
          buttonColor={esCargo ? tema.extra.deuda : undefined}
          contentStyle={estilos.boton}
          testID="boton-guardar-movimiento"
        >
          {esCargo ? 'Añadir deuda' : 'Registrar pago'}
        </Button>
      }
    >
      <Tarjeta style={estilos.saldo}>
        <Text variant="labelLarge" style={{ color: tema.colors.onSurfaceVariant }}>
          Saldo actual
        </Text>
        <Text
          variant="titleLarge"
          style={{ color: saldo > 0 ? tema.extra.deuda : tema.extra.aFavor }}
        >
          {formatearSoles(saldo)}
        </Text>
      </Tarjeta>

      <SeccionFormulario titulo="Detalle">
        <CampoTexto
          control={control}
          nombre="monto"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('descripcion')}
          etiqueta="Monto (S/)"
          keyboardType="decimal-pad"
          icono="cash"
          autoFocus={!origen}
          ayuda={
            origen
              ? `Falta pagar ${formatearSoles(origen.pendiente)} de la deuda más antigua`
              : undefined
          }
        />
        <CampoTexto
          control={control}
          nombre="descripcion"
          etiqueta={esCargo ? 'Descripción (ej. 2 gaseosas)' : 'Descripción'}
          icono="text-short"
          maxLength={100}
        />
      </SeccionFormulario>

      {!esCargo ? (
        <SeccionFormulario titulo="¿Cómo pagó?">
          <Controller
            control={control}
            name="metodoPago"
            render={({ field }) => (
              <SegmentedButtons
                value={field.value}
                onValueChange={field.onChange}
                buttons={METODOS_PAGO_ABONO.map((m) => ({
                  value: m,
                  label: m,
                  icon: m === 'Efectivo' ? 'cash' : 'cellphone',
                }))}
                style={estilos.segmento}
              />
            )}
          />
        </SeccionFormulario>
      ) : null}
    </PantallaFormulario>
  );
}

const estilos = StyleSheet.create({
  saldo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: espacio.md,
  },
  segmento: { marginBottom: espacio.sm },
  boton: { minHeight: 52 },
});
