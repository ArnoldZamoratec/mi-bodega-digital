import { useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';

import type { EntradaCola } from '@/domain/ports';
import { formatearSoles, sumarSoles } from '@/domain/rules/dinero';

import { sincronizarTodo } from '../../app/sincronizacion';
import { Aparecer } from '../../components/Aparecer';
import { confirmar } from '../../components/Confirmar';
import { EstadoVista } from '../../components/EstadoVista';
import { IconoSuave } from '../../components/IconoSuave';
import { Tarjeta } from '../../components/Tarjeta';
import { useTema } from '../../hooks/useDerivados';
import { avisar } from '../../stores/avisosStore';
import { useDatos } from '../../stores/datosStore';
import { useRed } from '../../stores/redStore';
import { useContenedor } from '../../stores/sesionStore';
import { espacio, radio } from '../../theme/tokens';

/** Outbox visible para el usuario: transparencia sobre qué ventas aún no llegan a la nube. */
export function VentasPendientesScreen() {
  const tema = useTema();
  const contenedor = useContenedor();
  const pendientes = useDatos((s) => s.pendientes);
  const enLinea = useRed((s) => s.enLinea);
  const [sincronizando, setSincronizando] = useState(false);

  const reintentar = async () => {
    setSincronizando(true);
    // Las bloqueadas por error permanente se reintentan solo si el usuario lo pide.
    await Promise.all(
      pendientes
        .filter((p) => p.bloqueada)
        .map((p) => contenedor.cola.actualizar({ ...p, bloqueada: false })),
    );
    // D-31: "Sincronizar ahora" reenvía también lo que quedó "en vuelo" (confirmar es
    // idempotente). Incluye los fiados (D-24) y la caja (D-28). Si la conexión con la nube
    // quedó trabada, se recrea y se vuelve a intentar sola.
    const r = await sincronizarTodo(contenedor, { forzar: true });
    setSincronizando(false);
    avisar(
      r.pendientes === 0
        ? 'Todas las ventas están sincronizadas'
        : r.instanciaRota
          ? 'Reconectando con la nube… se reintentará en unos segundos'
          : `Quedan ${r.pendientes} venta(s) pendiente(s)`,
      r.pendientes === 0 ? 'exito' : 'info',
    );
  };

  const descartar = async (e: EntradaCola) => {
    const ok = await confirmar({
      titulo: 'Descartar venta',
      mensaje: `La venta de ${formatearSoles(e.operacion.venta.total)} no se guardará en la nube ni descontará stock. ¿Continuar?`,
      confirmar: 'Descartar',
      destructivo: true,
    });
    if (ok) await contenedor.cola.quitar(e.operacion.ventaId);
  };

  if (pendientes.length === 0) {
    return (
      <EstadoVista
        tipo="vacio"
        icono="cloud-check-outline"
        titulo="Todo sincronizado"
        mensaje="No hay ventas pendientes en este teléfono."
      />
    );
  }

  const total = sumarSoles(pendientes.map((p) => p.operacion.venta.total));
  const bloqueadas = pendientes.filter((p) => p.bloqueada).length;

  return (
    <View style={[estilos.flex, { backgroundColor: tema.colors.background }]}>
      <FlatList
        data={pendientes}
        keyExtractor={(e) => e.operacion.ventaId}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <Aparecer>
            <Tarjeta nivel={2} style={estilos.resumen}>
              <IconoSuave
                nombre={enLinea ? 'cloud-sync-outline' : 'cloud-off-outline'}
                tamano={48}
                color={tema.extra.advertencia}
                fondo={tema.extra.fondoAdvertencia}
              />
              <View style={estilos.flex}>
                <Text variant="titleLarge">{formatearSoles(total)}</Text>
                <Text variant="bodyMedium" style={{ color: tema.colors.onSurfaceVariant }}>
                  {pendientes.length === 1
                    ? '1 venta guardada en el teléfono'
                    : `${pendientes.length} ventas guardadas en el teléfono`}
                  {bloqueadas > 0 ? ` · ${bloqueadas} requieren revisión` : ''}
                </Text>
              </View>
            </Tarjeta>
          </Aparecer>
        }
        renderItem={({ item }) => {
          const venta = item.operacion.venta;
          const estado = item.bloqueada
            ? { texto: 'Requiere revisión', color: tema.extra.deuda, fondo: tema.extra.fondoDeuda }
            : item.ultimoError
              ? {
                  texto: `Reintentando · ${item.intentos}`,
                  color: tema.extra.advertencia,
                  fondo: tema.extra.fondoAdvertencia,
                }
              : {
                  texto: 'En espera',
                  color: tema.colors.onSurfaceVariant,
                  fondo: tema.colors.surfaceVariant,
                };
          return (
            <Tarjeta style={estilos.item}>
              <View style={estilos.itemFila}>
                <View style={estilos.flex}>
                  <Text variant="titleMedium">{formatearSoles(venta.total)}</Text>
                  <Text variant="bodySmall" style={{ color: tema.colors.onSurfaceVariant }}>
                    {venta.metodoDePago} ·{' '}
                    {venta.items.length === 1 ? '1 producto' : `${venta.items.length} productos`} ·{' '}
                    {new Date(item.operacion.creadaEn).toLocaleString('es-PE')}
                  </Text>
                </View>
                <View style={[estilos.pildora, { backgroundColor: estado.fondo }]}>
                  <Text variant="labelSmall" style={{ color: estado.color }}>
                    {estado.texto}
                  </Text>
                </View>
              </View>
              {item.ultimoError ? (
                <Text
                  variant="bodySmall"
                  style={{ color: item.bloqueada ? tema.colors.error : tema.extra.advertencia }}
                >
                  {item.ultimoError}
                </Text>
              ) : null}
              <Button
                compact
                icon="trash-can-outline"
                textColor={tema.colors.error}
                style={estilos.descartar}
                onPress={() => void descartar(item)}
              >
                Descartar
              </Button>
            </Tarjeta>
          );
        }}
      />
      <View
        style={[
          estilos.pie,
          { backgroundColor: tema.colors.surface, borderTopColor: tema.extra.borde },
        ]}
      >
        <Button
          mode="contained"
          icon={enLinea ? 'cloud-upload-outline' : 'cloud-off-outline'}
          onPress={() => void reintentar()}
          loading={sincronizando}
          disabled={!enLinea || sincronizando}
          contentStyle={estilos.boton}
        >
          {sincronizando ? 'Sincronizando…' : enLinea ? 'Sincronizar ahora' : 'Sin conexión'}
        </Button>
        {!enLinea ? (
          <Text variant="bodySmall" style={[estilos.nota, { color: tema.colors.onSurfaceVariant }]}>
            Se enviarán solas cuando vuelva el internet.
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  flex: { flex: 1 },
  lista: { padding: espacio.md, gap: espacio.xs },
  resumen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.md,
    padding: espacio.md,
    marginBottom: espacio.xs,
  },
  item: { padding: espacio.md, paddingBottom: espacio.xs, gap: espacio.xxs },
  itemFila: { flexDirection: 'row', alignItems: 'flex-start', gap: espacio.sm },
  pildora: { paddingHorizontal: espacio.xs, paddingVertical: 2, borderRadius: radio.completo },
  descartar: { alignSelf: 'flex-end' },
  pie: {
    padding: espacio.md,
    gap: espacio.xs,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
  nota: { textAlign: 'center' },
  boton: { minHeight: 52 },
});
