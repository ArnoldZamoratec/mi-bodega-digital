import { zodResolver } from '@hookform/resolvers/zod';
import { useLayoutEffect } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';

import { CampoTexto } from '../../components/CampoTexto';
import { PantallaFormulario, SeccionFormulario } from '../../components/PantallaFormulario';
import { esquemaCliente, type DatosCliente } from '../../forms/esquemas';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useCarrito } from '../../stores/carritoStore';
import { useDatos } from '../../stores/datosStore';
import { requiereConexion } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';

export function ClienteFormScreen({ navigation, route }: PantallaRaiz<'ClienteForm'>) {
  const contenedor = useContenedor();
  const clienteId = route.params?.clienteId;
  const cliente = useDatos((s) => s.clientes.datos.find((c) => c.id === clienteId));

  const { control, handleSubmit, formState, setFocus } = useForm<DatosCliente>({
    resolver: zodResolver(esquemaCliente),
    defaultValues: { nombre: cliente?.nombre ?? '', telefono: cliente?.telefono ?? '' },
  });

  // El título va en el cuerpo del formulario; la barra queda limpia.
  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
  }, [navigation]);

  const guardar = handleSubmit(async (d) => {
    if (!requiereConexion()) return;
    const datos = { nombre: d.nombre.trim(), telefono: d.telefono.trim() };
    try {
      if (clienteId) {
        await contenedor.clientes.actualizar(clienteId, datos);
      } else {
        const id = await contenedor.clientes.crear(datos);
        // Si se creó desde el cobro fiado, queda seleccionado.
        const carrito = useCarrito.getState();
        if (carrito.metodoDePago === 'Fiado' && !carrito.clienteId) carrito.fijarCliente(id);
      }
      haptica.exito();
      avisar(clienteId ? 'Cliente actualizado' : 'Cliente registrado', 'exito');
      navigation.goBack();
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al guardar cliente'), 'error');
    }
  });

  return (
    <PantallaFormulario
      icono={clienteId ? 'account-edit-outline' : 'account-plus-outline'}
      titulo={clienteId ? 'Editar cliente' : 'Nuevo cliente'}
      descripcion="Con su celular podrás llamarlo o recordarle su deuda por WhatsApp."
      pie={
        <Button
          mode="contained"
          icon="check"
          onPress={() => void guardar()}
          loading={formState.isSubmitting}
          disabled={formState.isSubmitting}
          contentStyle={estilos.boton}
          testID="boton-guardar-cliente"
        >
          {formState.isSubmitting ? 'Guardando…' : 'Guardar cliente'}
        </Button>
      }
    >
      <SeccionFormulario titulo="Datos del cliente">
        <CampoTexto
          control={control}
          nombre="nombre"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('telefono')}
          etiqueta="Nombre"
          autoCapitalize="words"
          icono="account-outline"
          autoFocus={!clienteId}
        />
        <CampoTexto
          control={control}
          nombre="telefono"
          etiqueta="Teléfono (opcional)"
          keyboardType="phone-pad"
          icono="phone-outline"
          ayuda="Ej. 987 654 321"
        />
      </SeccionFormulario>
    </PantallaFormulario>
  );
}

const estilos = StyleSheet.create({
  boton: { minHeight: 52 },
});
