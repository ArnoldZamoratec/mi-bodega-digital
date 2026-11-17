import { zodResolver } from '@hookform/resolvers/zod';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useLayoutEffect } from 'react';
import { useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import { Button, IconButton } from 'react-native-paper';

import { mensajeDeError } from '@/data/firebase/errores';
import type { ProductoDatos } from '@/domain/entities';
import { parsearSoles } from '@/domain/rules/dinero';

import { CampoTexto } from '../../components/CampoTexto';
import { EstadoVista } from '../../components/EstadoVista';
import { confirmar } from '../../components/Confirmar';
import { PantallaFormulario, SeccionFormulario } from '../../components/PantallaFormulario';
import { esquemaProducto, type DatosProducto } from '../../forms/esquemas';
import { useTema } from '../../hooks/useDerivados';
import type { PantallaRaiz } from '../../navigation/tipos';
import { haptica } from '../../services/haptica';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { useCodigoEscaneado } from '../../stores/escanerStore';
import { requiereConexion } from '../../stores/redStore';
import { useContenedor, usePuede } from '../../stores/sesionStore';
import { espacio, radio, TACTIL_MIN } from '../../theme/tokens';

/**
 * Wireframe: [nombre] [precio S/] [stock (vacío = sin control)] [código de barras][📷]
 *            [Guardar]  ([Eliminar] si edita)
 */
export function ProductoFormScreen({ navigation, route }: PantallaRaiz<'ProductoForm'>) {
  const tema = useTema();
  const contenedor = useContenedor();
  const productoId = route.params?.productoId;
  const producto = useDatos((s) => s.productos.datos.find((p) => p.id === productoId));
  const todos = useDatos((s) => s.productos.datos);
  const codigoEscaneado = useCodigoEscaneado((s) => s.codigo);
  const limpiarCodigo = useCodigoEscaneado((s) => s.fijar);
  const puedeEditar = usePuede('editarProductos');

  const { control, handleSubmit, setValue, setError, formState, setFocus } = useForm<DatosProducto>(
    {
      resolver: zodResolver(esquemaProducto),
      defaultValues: {
        nombre: producto?.nombre ?? '',
        precio: producto ? producto.precio.toFixed(2) : '',
        stock:
          producto?.stock === null || producto?.stock === undefined ? '' : String(producto.stock),
        codigoBarras: producto?.codigoBarras ?? route.params?.codigoBarras ?? '',
      },
    },
  );

  // El título va en el cuerpo del formulario; la barra queda limpia.
  useLayoutEffect(() => {
    navigation.setOptions({ title: '' });
  }, [navigation]);

  // Código devuelto por el escáner.
  useFocusEffect(
    useCallback(() => {
      if (codigoEscaneado) {
        setValue('codigoBarras', codigoEscaneado, { shouldValidate: true, shouldDirty: true });
        limpiarCodigo(null);
      }
    }, [codigoEscaneado, setValue, limpiarCodigo]),
  );

  useEffect(() => () => limpiarCodigo(null), [limpiarCodigo]);

  const guardar = handleSubmit(async (d) => {
    if (!requiereConexion()) return;
    const codigo = d.codigoBarras.trim();
    const duplicado = codigo
      ? todos.find((p) => p.codigoBarras === codigo && p.id !== productoId)
      : undefined;
    if (duplicado) {
      setError('codigoBarras', { message: `Ya lo usa "${duplicado.nombre}"` });
      return;
    }
    const datos: ProductoDatos = {
      nombre: d.nombre.trim(),
      precio: parsearSoles(d.precio),
      stock: d.stock.trim() === '' ? null : parseInt(d.stock, 10),
      ...(codigo ? { codigoBarras: codigo } : {}),
    };
    try {
      if (productoId) await contenedor.productos.actualizar(productoId, datos);
      else await contenedor.productos.crear(datos);
      haptica.exito();
      avisar(productoId ? 'Producto actualizado' : 'Producto creado', 'exito');
      navigation.goBack();
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al guardar producto'), 'error');
    }
  });

  const eliminar = async () => {
    if (!producto || !requiereConexion()) return;
    const ok = await confirmar({
      titulo: 'Eliminar producto',
      mensaje: `¿Seguro que quieres eliminar ${producto.nombre}?`,
      confirmar: 'Eliminar',
      destructivo: true,
    });
    if (!ok) return;
    try {
      await contenedor.productos.eliminar(producto.id);
      navigation.goBack();
    } catch (e) {
      avisar(mensajeDeError(e, 'Error al eliminar'), 'error');
    }
  };

  // D-33: crear o editar productos es del dueño (las reglas lo exigen).
  if (!puedeEditar) {
    return (
      <EstadoVista
        tipo="vacio"
        icono="account-lock-outline"
        titulo="Solo el dueño puede cambiar productos"
        mensaje="Puedes ver precios y stock en Inventario y vender con normalidad."
        accion={{ etiqueta: 'Volver', onPress: () => navigation.goBack() }}
        testID="producto-sin-permiso"
      />
    );
  }

  return (
    <PantallaFormulario
      icono={productoId ? 'package-variant' : 'package-variant-plus'}
      titulo={productoId ? 'Editar producto' : 'Nuevo producto'}
      descripcion={
        productoId
          ? 'Los cambios no afectan a las ventas ya registradas.'
          : 'Agrégalo una vez y véndelo desde la pestaña Vender.'
      }
      pie={
        <Button
          mode="contained"
          icon="check"
          onPress={() => void guardar()}
          loading={formState.isSubmitting}
          disabled={formState.isSubmitting}
          contentStyle={estilos.boton}
          testID="boton-guardar-producto"
        >
          {formState.isSubmitting ? 'Guardando…' : 'Guardar producto'}
        </Button>
      }
    >
      <SeccionFormulario titulo="Información">
        <CampoTexto
          control={control}
          nombre="nombre"
          returnKeyType="next"
          onSubmitEditing={() => setFocus('precio')}
          etiqueta="Nombre del producto"
          autoCapitalize="sentences"
          icono="tag-outline"
        />
        <View style={estilos.fila}>
          <View style={estilos.flex}>
            <CampoTexto
              control={control}
              nombre="precio"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('stock')}
              etiqueta="Precio (S/)"
              keyboardType="decimal-pad"
            />
          </View>
          <View style={estilos.flex}>
            <CampoTexto
              control={control}
              nombre="stock"
              returnKeyType="next"
              onSubmitEditing={() => setFocus('codigoBarras')}
              etiqueta="Stock"
              keyboardType="number-pad"
              ayuda="Vacío = sin control"
            />
          </View>
        </View>
      </SeccionFormulario>

      <SeccionFormulario titulo="Código de barras">
        <View style={estilos.fila}>
          <View style={estilos.flex}>
            <CampoTexto
              control={control}
              nombre="codigoBarras"
              etiqueta="Código (opcional)"
              keyboardType="number-pad"
              icono="barcode"
            />
          </View>
          <IconButton
            icon="barcode-scan"
            mode="contained"
            size={24}
            style={estilos.escanear}
            containerColor={tema.colors.primary}
            iconColor={tema.colors.onPrimary}
            onPress={() => navigation.navigate('Escaner', { modo: 'codigo' })}
            accessibilityLabel="Escanear código de barras"
          />
        </View>
      </SeccionFormulario>

      {producto ? (
        <Button
          icon="trash-can-outline"
          mode="outlined"
          textColor={tema.colors.error}
          style={[estilos.eliminar, { borderColor: tema.extra.fondoDeuda }]}
          contentStyle={estilos.boton}
          onPress={eliminar}
        >
          Eliminar producto
        </Button>
      ) : null}
    </PantallaFormulario>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  fila: { flexDirection: 'row', gap: espacio.sm, alignItems: 'flex-start' },
  escanear: { margin: 0, marginTop: 6, width: TACTIL_MIN + 4, height: TACTIL_MIN + 4 },
  eliminar: { borderRadius: radio.completo },
  boton: { minHeight: 52 },
});
