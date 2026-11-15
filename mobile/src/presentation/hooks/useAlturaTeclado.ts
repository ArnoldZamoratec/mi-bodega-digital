import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * Alto del teclado en dp (0 si está cerrado). Con edge-to-edge (SDK 58) la ventana ya no
 * se achica sola; los diálogos de Paper se posicionan con `absoluteFill` e ignoran el
 * padding de un KeyboardAvoidingView, así que necesitan este valor directamente.
 */
export function useAlturaTeclado(): number {
  const [altura, setAltura] = useState(0);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', (e) =>
      setAltura(e.endCoordinates.height),
    );
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setAltura(0));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);
  return altura;
}
