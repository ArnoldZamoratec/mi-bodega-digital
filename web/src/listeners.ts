/**
 * Registro de listeners de Firestore (`onSnapshot`). Todos los módulos registran aquí lo que
 * abren; al cerrar sesión se cancelan TODOS de una vez. Sin esto, los listeners del usuario
 * anterior seguían vivos (fallaban con permission-denied tras signOut y, si entraba otra
 * cuenta en el mismo navegador, se duplicaban).
 */
export type Cancelar = () => void;

const activos = new Set<Cancelar>();

/** Registra un unsubscribe. Devuelve una función que lo cancela y lo quita del registro. */
export function registrarListener(cancelar: Cancelar): Cancelar {
  activos.add(cancelar);
  // Si ya se cerró (por este handle o por cancelarTodosLosListeners), no hace nada.
  return () => {
    if (activos.delete(cancelar)) cancelar();
  };
}

/** Cancela todos los listeners abiertos (logout). Un fallo en uno no impide cerrar el resto. */
export function cancelarTodosLosListeners(): void {
  const lista = [...activos];
  activos.clear();
  for (const cancelar of lista) {
    try {
      cancelar();
    } catch (error) {
      console.error('Error al cerrar un listener:', error);
    }
  }
}

export const listenersActivos = (): number => activos.size;
