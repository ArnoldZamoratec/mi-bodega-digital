import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { StyleSheet } from 'react-native';
import { Button } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';

import { CampoTexto } from '../../components/CampoTexto';
import { PantallaFormulario, SeccionFormulario } from '../../components/PantallaFormulario';
import { esquemaNegocio, type DatosNegocio } from '../../forms/esquemas';
import type { PantallaRaiz } from '../../navigation/tipos';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { requiereConexion } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';

export function DatosNegocioScreen({ navigation }: PantallaRaiz<'DatosNegocio'>) {
  const contenedor = useContenedor();
  const config = useDatos((s) => s.config);

  const { control, handleSubmit, formState, setFocus } = useForm<DatosNegocio>({
    resolver: zodResolver(esquemaNegocio),
    defaultValues: {
      nombre: config.nombre,
      ruc: config.ruc,
      direccion: config.direccion,
      telefono: config.telefono,
      diasVencimientoFiado: String(config.diasVencimientoFiado),
    },
  });

  const guardar = handleSubmit(async (d) => {
    if (!requiereConexion()) return;
    try {
      await contenedor.config.guardar({
        ...config,
        nombre: d.nombre.trim(),
        ruc: d.ruc.trim(),
        direccion: d.direccion.trim(),
        telefono: d.telefono.trim(),
        diasVencimientoFiado: Number(d.diasVencimientoFiado),
      });
      avisar('Datos del negocio guardados', 'exito');
      navigation.goBack();
    } catch (e) {
      avisar(mensajeDeError(e, 'No se pudo guardar'), 'error');
    }
  });

  return (
    <PantallaFormulario
      icono="storefront-outline"
      titulo="Tu bodega"
      descripcion="Estos datos aparecen en la app y en tus recordatorios de fiado."
      pie={
        <Button
          mode="contained"
          icon="check"
          onPress={() => void guardar()}
          loading={formState.isSubmitting}
          disabled={formState.isSubmitting}
          contentStyle={estilos.boton}
        >
          {formState.isSubmitting ? 'Guardando…' : 'Guardar cambios'}
        </Button>
      }
    >
      <SeccionFormulario titulo="Identidad">
        <CampoTexto
          control={control}
          nombre="nombre"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('ruc')}
          etiqueta="Nombre de la bodega"
          icono="store-outline"
        />
        <CampoTexto
          control={control}
          nombre="ruc"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('direccion')}
          etiqueta="RUC (opcional)"
          keyboardType="number-pad"
          maxLength={11}
          icono="card-account-details-outline"
          ayuda="11 dígitos"
        />
      </SeccionFormulario>

      <SeccionFormulario titulo="Contacto">
        <CampoTexto
          control={control}
          nombre="direccion"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('telefono')}
          etiqueta="Dirección (opcional)"
          icono="map-marker-outline"
        />
        <CampoTexto
          control={control}
          nombre="telefono"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('diasVencimientoFiado')}
          etiqueta="Teléfono (opcional)"
          keyboardType="phone-pad"
          icono="phone-outline"
        />
      </SeccionFormulario>

      <SeccionFormulario titulo="Fiado">
        <CampoTexto
          control={control}
          nombre="diasVencimientoFiado"
          etiqueta="Días para considerar vencido"
          keyboardType="number-pad"
          icono="calendar-clock-outline"
          ayuda="Se usa en el recordatorio diario de deudas"
        />
      </SeccionFormulario>
    </PantallaFormulario>
  );
}

const estilos = StyleSheet.create({
  boton: { minHeight: 52 },
});
