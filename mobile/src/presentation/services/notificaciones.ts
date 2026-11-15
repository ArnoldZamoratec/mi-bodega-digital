import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { ConfigNegocio, MovimientoFiado, Producto } from '@/domain/entities';
import { formatearSoles } from '@/domain/rules/dinero';
import { cargosVencidos } from '@/domain/rules/fiado';
import { nuevosConStockBajo } from '@/domain/rules/productos';

/**
 * Notificaciones **locales** (D-11): no requieren backend ni credenciales FCM/APNs.
 *  - Stock bajo: al detectar que un producto cruza el umbral (RN-01).
 *  - Fiados vencidos: recordatorio diario, reprogramado con el resumen actualizado.
 */

const CANAL_ALERTAS = 'alertas';
const ID_RECORDATORIO = 'recordatorio-fiado';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let permisoConcedido: boolean | null = null;

export async function prepararNotificaciones(pedirPermiso: boolean): Promise<boolean> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CANAL_ALERTAS, {
        name: 'Alertas de la bodega',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const actual = await Notifications.getPermissionsAsync();
    if (actual.granted) return (permisoConcedido = true);
    if (!pedirPermiso || !actual.canAskAgain) return (permisoConcedido = false);
    const pedido = await Notifications.requestPermissionsAsync();
    return (permisoConcedido = pedido.granted);
  } catch {
    return (permisoConcedido = false);
  }
}

/** Antirrebote: no repetir la alerta del mismo producto en menos de 6 horas. */
const ultimaAlerta = new Map<string, number>();
const ANTIRREBOTE_MS = 6 * 60 * 60 * 1000;

export async function alertarStockBajo(
  anteriores: Producto[],
  actuales: Producto[],
  config: ConfigNegocio,
  ahora = Date.now(),
): Promise<void> {
  if (!config.alertasStockBajo || permisoConcedido === false) return;
  const cruzaron = nuevosConStockBajo(anteriores, actuales).filter(
    (p) => ahora - (ultimaAlerta.get(p.id) ?? 0) > ANTIRREBOTE_MS,
  );
  if (cruzaron.length === 0) return;
  cruzaron.forEach((p) => ultimaAlerta.set(p.id, ahora));

  const cuerpo =
    cruzaron.length === 1
      ? `${cruzaron[0]!.nombre}: quedan ${cruzaron[0]!.stock} unidades.`
      : `${cruzaron.length} productos con stock bajo: ${cruzaron.map((p) => p.nombre).join(', ')}.`;

  await Notifications.scheduleNotificationAsync({
    content: { title: 'Stock bajo', body: cuerpo, data: { tipo: 'stock-bajo' } },
    trigger: Platform.OS === 'android' ? { channelId: CANAL_ALERTAS } : null,
  }).catch(() => undefined);
}

/**
 * Reprograma el recordatorio diario con el resumen actual de fiados vencidos.
 * Si no hay vencidos o está desactivado, se cancela.
 */
export async function programarRecordatorioFiado(
  movimientos: MovimientoFiado[],
  config: ConfigNegocio,
  ahora = new Date(),
): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(ID_RECORDATORIO);
    if (config.horaRecordatorioFiado === null || !permisoConcedido) return;

    const vencidos = cargosVencidos(movimientos, ahora, config.diasVencimientoFiado);
    if (vencidos.length === 0) return;

    const clientes = new Set(vencidos.map((c) => c.movimiento.clienteId)).size;
    const total = vencidos.reduce((acc, c) => acc + c.pendiente, 0);

    await Notifications.scheduleNotificationAsync({
      identifier: ID_RECORDATORIO,
      content: {
        title: 'Fiados vencidos',
        body: `${clientes} cliente(s) con deudas de más de ${config.diasVencimientoFiado} días · ${formatearSoles(total)}`,
        data: { tipo: 'fiado-vencido' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: config.horaRecordatorioFiado,
        minute: 0,
        ...(Platform.OS === 'android' ? { channelId: CANAL_ALERTAS } : {}),
      },
    });
  } catch {
    // Las notificaciones son un complemento: un fallo no debe afectar la operación.
  }
}
