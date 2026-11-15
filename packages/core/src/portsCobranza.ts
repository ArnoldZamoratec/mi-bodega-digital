/** Puerto de cobranza (D-27). En un archivo propio para no tocar `ports.ts`. */
export interface RepositorioRecordatorios {
  /**
   * Anota en `clientes/{id}.ultimoRecordatorio` la hora del recordatorio. No espera al
   * servidor: sin señal queda en la cola del SDK y el listener lo muestra al instante.
   */
  registrar(clienteId: string, fecha: Date): Promise<void>;
}
