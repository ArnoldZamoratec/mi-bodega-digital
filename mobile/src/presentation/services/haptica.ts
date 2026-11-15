import * as Haptics from 'expo-haptics';

/** Feedback táctil; nunca debe romper un flujo si el dispositivo no lo soporta. */
const seguro = (fn: () => Promise<void>) => {
  fn().catch(() => undefined);
};

export const haptica = {
  toque: () => seguro(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  exito: () => seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
  advertencia: () =>
    seguro(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
};
