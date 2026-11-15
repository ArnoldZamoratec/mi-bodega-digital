import { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, List, Modal, Portal, Searchbar, Text } from 'react-native-paper';

import type { Cliente } from '@/domain/entities';
import { formatearSoles } from '@/domain/rules/dinero';
import { normalizarTexto } from '@/domain/rules/productos';

import { useSaldos, useTema } from '../hooks/useDerivados';
import { useDatos } from '../stores/datosStore';

interface Props {
  clienteId: string | null;
  onSeleccionar: (id: string) => void;
  onNuevoCliente: () => void;
}

/** Selector con búsqueda: con cientos de clientes, un <select> como el de la web no escala. */
export function SelectorCliente({ clienteId, onSeleccionar, onNuevoCliente }: Props) {
  const tema = useTema();
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const clientes = useDatos((s) => s.clientes.datos);
  const saldos = useSaldos();

  const seleccionado = clientes.find((c) => c.id === clienteId);
  const filtrados = useMemo(() => {
    const t = normalizarTexto(busqueda);
    return t ? clientes.filter((c) => normalizarTexto(c.nombre).includes(t)) : clientes;
  }, [clientes, busqueda]);

  const elegir = (c: Cliente) => {
    onSeleccionar(c.id);
    setAbierto(false);
    setBusqueda('');
  };

  return (
    <>
      <Button
        mode="outlined"
        icon="account"
        onPress={() => setAbierto(true)}
        contentStyle={estilos.boton}
        testID="selector-cliente"
        accessibilityHint="Abre la lista de clientes"
      >
        {seleccionado ? seleccionado.nombre : 'Seleccionar cliente…'}
      </Button>
      <Portal>
        <Modal
          visible={abierto}
          onDismiss={() => setAbierto(false)}
          contentContainerStyle={[estilos.modal, { backgroundColor: tema.colors.surface }]}
        >
          <Text variant="titleLarge" style={estilos.titulo}>
            ¿A quién se fía?
          </Text>
          <Searchbar placeholder="Buscar cliente" value={busqueda} onChangeText={setBusqueda} />
          <FlatList
            data={filtrados}
            keyExtractor={(c) => c.id}
            style={estilos.lista}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const saldo = saldos.get(item.id) ?? 0;
              return (
                <List.Item
                  title={item.nombre}
                  description={item.telefono || 'Sin teléfono'}
                  onPress={() => elegir(item)}
                  testID={`cliente-opcion-${item.nombre}`}
                  right={() => (
                    <Text
                      style={{
                        alignSelf: 'center',
                        color: saldo > 0 ? tema.extra.deuda : tema.colors.onSurfaceVariant,
                      }}
                    >
                      {formatearSoles(saldo)}
                    </Text>
                  )}
                />
              );
            }}
            ListEmptyComponent={<Text style={estilos.vacio}>No hay clientes que coincidan.</Text>}
          />
          <View style={estilos.acciones}>
            <Button
              icon="account-plus"
              onPress={() => {
                setAbierto(false);
                onNuevoCliente();
              }}
            >
              Nuevo cliente
            </Button>
            <Button onPress={() => setAbierto(false)}>Cerrar</Button>
          </View>
        </Modal>
      </Portal>
    </>
  );
}

const estilos = StyleSheet.create({
  boton: { minHeight: 48, justifyContent: 'flex-start' },
  modal: { margin: 16, borderRadius: 16, padding: 16, maxHeight: '85%', gap: 8 },
  titulo: { marginBottom: 4 },
  lista: { flexGrow: 0 },
  vacio: { textAlign: 'center', padding: 16 },
  acciones: { flexDirection: 'row', justifyContent: 'space-between' },
});
